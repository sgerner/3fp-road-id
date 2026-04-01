create or replace function public.claim_group_social_posts(target_batch_size integer default 20)
returns setof public.group_social_posts
language plpgsql
security definer
set search_path = public
as $$
declare
	batch_size integer := greatest(1, least(coalesce(target_batch_size, 20), 100));
begin
	return query
	with due as (
		select p.id
		from public.group_social_posts p
		where (
				p.status in ('scheduled', 'queued')
				or (p.status = 'failed' and p.scheduled_for is not null)
			)
			and p.schedule_bucket is not null
			and p.schedule_bucket <= timezone('utc', now())
			and p.publish_attempts < 3
		order by p.schedule_bucket asc, p.created_at asc
		for update skip locked
		limit batch_size
	),
	updated as (
		update public.group_social_posts p
		set
			status = 'publishing',
			publish_attempts = p.publish_attempts + 1,
			updated_at = timezone('utc', now())
		from due
		where p.id = due.id
		returning p.*
	)
	select * from updated;
end;
$$;

revoke all on function public.claim_group_social_posts(integer) from public;;
