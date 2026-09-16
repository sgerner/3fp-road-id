create or replace function public.cleanup_duplicate_storage_media()
returns table (
	duplicate_groups integer,
	duplicate_objects integer,
	rewritten_post_rows integer,
	rewritten_library_rows integer,
	deleted_objects integer,
	reclaimed_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
	public_base text;
	rec record;
	affected_rows integer;
begin
	select regexp_replace(sample_url, '/storage/v1/object/public/.*$', '')
	into public_base
	from (
		select case
			when jsonb_typeof(item) = 'string' then trim(both '"' from item::text)
			when jsonb_typeof(item) = 'object' then coalesce(item->>'url', item->>'public_url', item->>'src')
			else null
		end as sample_url
		from public.group_social_posts p
		cross join lateral jsonb_array_elements(p.media) as item
		where case
			when jsonb_typeof(item) = 'string' then trim(both '"' from item::text)
			when jsonb_typeof(item) = 'object' then coalesce(item->>'url', item->>'public_url', item->>'src')
			else null
		end like 'https://%/storage/v1/object/public/%'
		limit 1
	) sample;

	if public_base is null then
		return query
		select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 0::bigint;
		return;
	end if;

	select count(*)
	into duplicate_groups
	from (
		with objects as (
			select
				id,
				bucket_id,
				name,
				created_at,
				coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) as bytes,
				coalesce(metadata->>'eTag', metadata->>'etag') as etag,
				row_number() over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
					order by
						case bucket_id
							when 'storage' then 0
							when 'group-social-media' then 1
							else 2
						end,
						created_at asc,
						id asc
				) as rn,
				count(*) over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
				) as group_count
			from storage.objects
			where bucket_id in ('storage', 'group-social-media')
		)
		select 1
		from objects
		where group_count > 1
			and exists (
				select 1
				from objects candidate
				where candidate.bytes = objects.bytes
					and candidate.etag = objects.etag
					and candidate.bucket_id = 'group-social-media'
			)
		group by bytes, etag
	) groups_with_social_media;

	select count(*), coalesce(sum(bytes), 0)
	into duplicate_objects, reclaimed_bytes
	from (
		with objects as (
			select
				id,
				bucket_id,
				name,
				created_at,
				coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) as bytes,
				coalesce(metadata->>'eTag', metadata->>'etag') as etag,
				concat(public_base, '/storage/v1/object/public/', bucket_id, '/', name) as public_url,
				row_number() over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
					order by
						case bucket_id
							when 'storage' then 0
							when 'group-social-media' then 1
							else 2
						end,
						created_at asc,
						id asc
				) as rn,
				count(*) over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
				) as group_count
			from storage.objects
			where bucket_id in ('storage', 'group-social-media')
		),
		eligible_groups as (
			select distinct bytes, etag
			from objects
			where group_count > 1
				and exists (
					select 1
					from objects candidate
					where candidate.bytes = objects.bytes
						and candidate.etag = objects.etag
						and candidate.bucket_id = 'group-social-media'
				)
		)
		select objects.*
		from objects
		join eligible_groups using (bytes, etag)
		where objects.rn > 1
	) duplicate_losers;

	rewritten_post_rows := 0;
	rewritten_library_rows := 0;
	deleted_objects := 0;

	for rec in
		with objects as (
			select
				id,
				bucket_id,
				name,
				created_at,
				coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) as bytes,
				coalesce(metadata->>'eTag', metadata->>'etag') as etag,
				concat(public_base, '/storage/v1/object/public/', bucket_id, '/', name) as public_url,
				row_number() over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
					order by
						case bucket_id
							when 'storage' then 0
							when 'group-social-media' then 1
							else 2
						end,
						created_at asc,
						id asc
				) as rn,
				count(*) over (
					partition by
						coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0),
						coalesce(metadata->>'eTag', metadata->>'etag')
				) as group_count
			from storage.objects
			where bucket_id in ('storage', 'group-social-media')
		),
		eligible_groups as (
			select distinct bytes, etag
			from objects
			where group_count > 1
				and exists (
					select 1
					from objects candidate
					where candidate.bytes = objects.bytes
						and candidate.etag = objects.etag
						and candidate.bucket_id = 'group-social-media'
				)
		)
		select
			loser.id as loser_id,
			loser.bucket_id as loser_bucket,
			loser.name as loser_name,
			loser.public_url as loser_url,
			winner.id as winner_id,
			winner.bucket_id as winner_bucket,
			winner.name as winner_name,
			winner.public_url as winner_url,
			loser.bytes as bytes
		from objects loser
		join eligible_groups using (bytes, etag)
		join objects winner
			on winner.bytes = loser.bytes
			and winner.etag = loser.etag
			and winner.rn = 1
		where loser.rn > 1
		order by loser.bucket_id, loser.created_at, loser.id
	loop
		update public.group_social_posts
		set media = replace(media::text, rec.loser_url, rec.winner_url)::jsonb
		where media::text like '%' || rec.loser_url || '%';
		get diagnostics affected_rows = row_count;
		rewritten_post_rows := rewritten_post_rows + affected_rows;

		update public.group_social_content_library
		set media = replace(media::text, rec.loser_url, rec.winner_url)::jsonb
		where media::text like '%' || rec.loser_url || '%';
		get diagnostics affected_rows = row_count;
		rewritten_library_rows := rewritten_library_rows + affected_rows;

		delete from storage.objects
		where id = rec.loser_id;
		get diagnostics affected_rows = row_count;
		deleted_objects := deleted_objects + affected_rows;
	end loop;

	return query
	select
		duplicate_groups,
		duplicate_objects,
		rewritten_post_rows,
		rewritten_library_rows,
		deleted_objects,
		reclaimed_bytes;
end;
$$;

revoke all on function public.cleanup_duplicate_storage_media() from public;

select cron.unschedule(jobid)
from cron.job
where jobname = 'storage-media-dedupe-nightly';

select
	cron.schedule(
		'storage-media-dedupe-nightly',
		'13 3 * * *',
		$$
		select public.cleanup_duplicate_storage_media();
		$$
	);;
