-- Tighten the storage cleanup RPC to the server-side service role only.
revoke all on function public.cleanup_storage_unreferenced_objects(integer, boolean)
	from public, anon, authenticated;
grant execute on function public.cleanup_storage_unreferenced_objects(integer, boolean)
	to service_role;

-- Supabase owns public.spatial_ref_sys, so enabling RLS requires a platform
-- level change and is intentionally not attempted in this application migration.

-- Pin the invoker function's lookup path so future objects cannot shadow names
-- used while the function is executed.
alter function map.get_improvements()
	set search_path = pg_catalog, map, public;

-- Cover the subscriber side of the membership email-send foreign key.
create index if not exists group_membership_email_sends_subscriber_id_idx
	on public.group_membership_email_sends (subscriber_id);

-- Evaluate auth.uid() once per statement rather than once per row.
drop policy if exists group_email_subscribers_manage on public.group_email_subscribers;
create policy group_email_subscribers_manage
	on public.group_email_subscribers
for select
to authenticated
using (
	(
		exists (
			select 1
			from public.profiles p
			where p.user_id = (select auth.uid())
			  and p.admin = true
		)
	)
	or (
		exists (
			select 1
			from public.group_members gm
			where gm.group_id = group_email_subscribers.group_id
			  and gm.user_id = (select auth.uid())
			  and gm.role = 'owner'::group_member_role
		)
	)
);

-- Avoid evaluating the manager SELECT policy for anonymous callers and merge
-- the two authenticated SELECT paths into one equivalent predicate.
drop policy if exists group_accounting_public_reports_manager_select
	on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_public_select
	on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_write
	on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_write_delete
	on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_write_insert
	on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_write_update
	on public.group_accounting_public_reports;

create policy group_accounting_public_reports_anon_select
	on public.group_accounting_public_reports
for select
to anon
using (published = true);

create policy group_accounting_public_reports_authenticated_select
	on public.group_accounting_public_reports
for select
to authenticated
using (
	published = true
	or public.is_group_accounting_manager(group_id)
);

create policy group_accounting_public_reports_manager_insert
	on public.group_accounting_public_reports
for insert
to authenticated
with check (public.is_group_accounting_manager(group_id));

create policy group_accounting_public_reports_manager_update
	on public.group_accounting_public_reports
for update
to authenticated
using (public.is_group_accounting_manager(group_id))
with check (public.is_group_accounting_manager(group_id));

create policy group_accounting_public_reports_manager_delete
	on public.group_accounting_public_reports
for delete
to authenticated
using (public.is_group_accounting_manager(group_id));
