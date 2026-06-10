-- Harden exposed views so they obey the caller's RLS context.
create or replace view policies.policy_popularity
with (security_invoker = true)
as
select
  p.id as policy_id,
  count(case when pr.bucket = 2 then 1 end) as immediate_count,
  count(case when pr.bucket = 1 then 1 end) as next_count,
  (coalesce(count(case when pr.bucket = 2 then 1 end), 0) * 2)
    + coalesce(count(case when pr.bucket = 1 then 1 end), 0) as popularity_score
from policies.policies p
left join policies.priorities pr on pr.policy_id = p.id
group by p.id;

create or replace view policies.policy_with_popularity
with (security_invoker = true)
as
select
  p.id,
  p.title,
  p.short_description,
  p.long_description,
  p.category,
  p.created_at,
  coalesce(pp.immediate_count, 0) as immediate_count,
  coalesce(pp.next_count, 0) as next_count,
  coalesce(pp.popularity_score, 0) as popularity_score
from policies.policies p
left join policies.policy_popularity pp on pp.policy_id = p.id;

create or replace view public.policies
with (security_invoker = true)
as
select
  id,
  title,
  short_description,
  long_description,
  category,
  created_at
from policies.policies;

create or replace view public.policy_with_popularity
with (security_invoker = true)
as
select
  id,
  title,
  short_description,
  long_description,
  category,
  created_at,
  immediate_count,
  next_count,
  popularity_score
from policies.policy_with_popularity;

create or replace view public.v_volunteer_event_hosts_with_profiles
with (security_invoker = true)
as
select
  veh.event_id,
  veh.user_id,
  veh.created_at,
  p.email,
  p.full_name
from volunteer_event_hosts veh
join profiles p on veh.user_id = p.user_id;

-- Internal storage/social/merch tables should have explicit deny-all policies so Supabase
-- sees RLS as intentional rather than "enabled with no policy".
drop policy if exists donations_no_access on public.donations;
create policy donations_no_access
on public.donations
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_membership_audit_log_no_access on public.group_membership_audit_log;
create policy group_membership_audit_log_no_access
on public.group_membership_audit_log
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_accounts_no_access on public.group_social_accounts;
create policy group_social_accounts_no_access
on public.group_social_accounts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_comment_replies_no_access on public.group_social_comment_replies;
create policy group_social_comment_replies_no_access
on public.group_social_comment_replies
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_comments_no_access on public.group_social_comments;
create policy group_social_comments_no_access
on public.group_social_comments
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_content_library_no_access on public.group_social_content_library;
create policy group_social_content_library_no_access
on public.group_social_content_library
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_oauth_pending_connections_no_access on public.group_social_oauth_pending_connections;
create policy group_social_oauth_pending_connections_no_access
on public.group_social_oauth_pending_connections
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_oauth_states_no_access on public.group_social_oauth_states;
create policy group_social_oauth_states_no_access
on public.group_social_oauth_states
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists group_social_posts_no_access on public.group_social_posts;
create policy group_social_posts_no_access
on public.group_social_posts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_dispatch_jobs_no_access on public.merch_dispatch_jobs;
create policy merch_dispatch_jobs_no_access
on public.merch_dispatch_jobs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_order_items_no_access on public.merch_order_items;
create policy merch_order_items_no_access
on public.merch_order_items
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_orders_no_access on public.merch_orders;
create policy merch_orders_no_access
on public.merch_orders
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_partner_accounts_no_access on public.merch_partner_accounts;
create policy merch_partner_accounts_no_access
on public.merch_partner_accounts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_refunds_no_access on public.merch_refunds;
create policy merch_refunds_no_access
on public.merch_refunds
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists merch_shipping_rules_no_access on public.merch_shipping_rules;
create policy merch_shipping_rules_no_access
on public.merch_shipping_rules
for all
to anon, authenticated
using (false)
with check (false);

-- Functions used for read-only authorization checks are safe as invoker functions now that
-- the underlying tables have the needed RLS policies.
create or replace function public.is_site_admin()
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
	select exists (
		select 1
		from public.profiles p
		where p.user_id = auth.uid()
			and p.admin = true
	);
$function$;

grant execute on function public.is_site_admin() to anon, authenticated;

create or replace function public.is_group_membership_manager(target_group_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
	select
		public.is_site_admin()
		or exists (
			select 1
			from public.group_members gm
			where gm.group_id = target_group_id
				and gm.user_id = auth.uid()
				and gm.role in ('owner', 'admin')
		);
$function$;

grant execute on function public.is_group_membership_manager(uuid) to anon, authenticated;

create or replace function public.is_group_email_manager(target_group_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
	select public.is_group_membership_manager(target_group_id);
$function$;

grant execute on function public.is_group_email_manager(uuid) to anon, authenticated;

create or replace function public.is_group_accounting_manager(target_group_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
	select
		coalesce(public.is_site_admin(), false)
		or exists (
			select 1
			from public.group_members gm
			where gm.group_id = target_group_id
				and gm.user_id = auth.uid()
				and gm.role in ('owner', 'admin')
		);
$function$;

grant execute on function public.is_group_accounting_manager(uuid) to anon, authenticated;

create or replace function public.is_learn_admin()
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
	select exists (
		select 1
		from public.profiles
		where user_id = auth.uid()
			and admin = true
	);
$function$;

grant execute on function public.is_learn_admin() to anon, authenticated;

create or replace function public.groups_build_search_document(
	group_name text,
	group_tagline text,
	group_description text,
	group_membership_info text,
	group_service_area_description text,
	group_city text,
	group_state_region text,
	group_country text
)
returns tsvector
language sql
stable
set search_path to 'public'
as $function$
	select
		setweight(to_tsvector('simple', coalesce(group_name, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_tagline, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_membership_info, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_service_area_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_city, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_state_region, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_country, '')), 'C');
$function$;

create or replace function public.groups_prepare_search_document()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
	new.search_document := public.groups_build_search_document(
		new.name,
		new.tagline,
		new.description,
		new.membership_info,
		new.service_area_description,
		new.city,
		new.state_region,
		new.country
	);
	return new;
end;
$function$;

create or replace function public.groups_set_microsite_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
	normalized text;
begin
	normalized := public.normalize_microsite_slug(coalesce(new.microsite_slug, ''));
	if normalized = '' then
		normalized := public.normalize_microsite_slug(coalesce(new.slug, ''));
	end if;
	if normalized = '' then
		normalized := 'group' || substring(replace(coalesce(new.id::text, md5(random()::text)), '-', '') from 1 for 8);
	end if;
	new.microsite_slug := normalized;
	return new;
end;
$function$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
	new.updated_at = now();
	return new;
end;
$function$;

create or replace function public.normalize_microsite_slug(input text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
	select regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '', 'g');
$function$;

create or replace function public.learn_jsonb_array_to_text(source jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $function$
	select coalesce(string_agg(value, ' '), '')
	from jsonb_array_elements_text(coalesce(source, '[]'::jsonb)) as t(value);
$function$;

-- RPC entry points should be invoker functions now that the backing tables enforce access.
create or replace function policies.submit_response(
	p_email text,
	p_name text,
	p_address text,
	p_immediate uuid[],
	p_next uuid[]
)
returns void
language plpgsql
security invoker
set search_path to 'policies', 'public'
as $function$
declare
  v_submission_id uuid;
begin
  insert into policies.submissions(email, name, address)
  values (p_email, p_name, p_address)
  on conflict (email)
  do update set name = excluded.name, address = excluded.address
  returning id into v_submission_id;

  delete from policies.priorities where submission_id = v_submission_id;

  if p_immediate is not null then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_immediate), 2;
  end if;

  if p_next is not null then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_next), 1;
  end if;
end $function$;

grant execute on function policies.submit_response(text, text, text, uuid[], uuid[]) to anon, authenticated;

create or replace function public.submit_response(
	p_email text,
	p_name text,
	p_address text,
	p_immediate uuid[],
	p_next uuid[]
)
returns void
language sql
security invoker
set search_path to 'public', 'policies'
as $function$
	select policies.submit_response(p_email, p_name, p_address, p_immediate, p_next);
$function$;

grant execute on function public.submit_response(text, text, text, uuid[], uuid[]) to anon, authenticated;

create or replace function public.claim_group_social_posts(target_batch_size integer default 20)
returns setof public.group_social_posts
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
$function$;

revoke all on function public.claim_group_social_posts(integer) from public, anon, authenticated;
grant execute on function public.claim_group_social_posts(integer) to service_role;

revoke all on function public.cleanup_duplicate_storage_media() from public, anon, authenticated;
grant execute on function public.cleanup_duplicate_storage_media() to service_role;

revoke all on function public.cleanup_storage_media_assets(integer) from public, anon, authenticated;
grant execute on function public.cleanup_storage_media_assets(integer) to service_role;

-- Trigger functions should not be exposed as RPC entry points.
alter function public.create_profile_on_new_user() set schema private;
alter function public.handle_new_user() set schema private;

drop trigger if exists new_user_profile_trigger on auth.users;
create trigger new_user_profile_trigger
after insert on auth.users
for each row execute function private.create_profile_on_new_user();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
