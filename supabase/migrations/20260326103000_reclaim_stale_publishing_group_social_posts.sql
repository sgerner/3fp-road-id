create or replace function public.claim_group_social_posts(target_batch_size integer default 20)
returns setof public.group_social_posts
language plpgsql
security definer
set search_path = public
as $$
declare
	batch_size integer := greatest(1, least(coalesce(target_batch_size, 20), 100));
	now_utc timestamptz := timezone('utc', now());
	stale_publishing_threshold timestamptz := now_utc - interval '20 minutes';
begin
	return query
	with due as (
		select p.id
		from public.group_social_posts p
		where p.publish_attempts < 3
			and (
				(
					(
						p.status in ('scheduled', 'queued')
						or (p.status = 'failed' and p.scheduled_for is not null)
					)
					and p.schedule_bucket is not null
					and p.schedule_bucket <= now_utc
				)
				or (
					p.status = 'publishing'
					and p.updated_at <= stale_publishing_threshold
				)
			)
		order by coalesce(p.schedule_bucket, p.updated_at) asc, p.created_at asc
		for update skip locked
		limit batch_size
	),
	updated as (
		update public.group_social_posts p
		set
			status = 'publishing',
			publish_attempts = p.publish_attempts + 1,
			updated_at = now_utc
		from due
		where p.id = due.id
		returning p.*
	)
	select * from updated;
end;
$$;
revoke all on function public.claim_group_social_posts(integer) from public;
