-- Harden the second-order permission paths found in the full RLS audit.
--
-- This migration keeps the intentionally public content paths public, but
-- removes public write grants, protects profile privilege columns, scopes
-- manager access to volunteer profiles, and moves sensitive operational data
-- behind the service role.

-- Policies that only work for authenticated users should not be callable by
-- the anonymous role. Keep the public interest form insert intentionally
-- public; its endpoint has additional application-level anti-abuse checks.
do $policy_roles$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'public' = any (roles)
      and cmd <> 'SELECT'
      and not (
        tablename = 'get_involved_interest_submissions'
        and policyname = 'get_involved_interest_submissions_insert'
      )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$policy_roles$;

-- Profiles -------------------------------------------------------------------

drop policy if exists profiles_open_select_anon on public.profiles;
drop policy if exists profiles_open_select_auth on public.profiles;
drop policy if exists profiles_insert_volunteer_manager on public.profiles;
drop policy if exists profiles_update_volunteer_manager on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists "Profiles - insert own" on public.profiles;
drop policy if exists "Profiles - update own" on public.profiles;
drop policy if exists "Profiles - delete own" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_volunteer_manager on public.profiles;
drop policy if exists profiles_insert_self_safe on public.profiles;
drop policy if exists profiles_update_self_safe on public.profiles;
drop policy if exists profiles_delete_self on public.profiles;

create policy profiles_select_own
on public.profiles
for select to authenticated
using (user_id = (select auth.uid()));

-- Volunteer managers may see the people relevant to an event they manage. This
-- is deliberately narrower than the old open profile policy: it does not make
-- the entire profile directory (including emergency contacts) public.
create policy profiles_select_volunteer_manager
on public.profiles
for select to authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where public.can_manage_volunteer_event(ve.id)
      and (
        ve.host_user_id = public.profiles.user_id
        or ve.created_by_user_id = public.profiles.user_id
        or exists (
          select 1
          from public.volunteer_event_hosts veh
          where veh.event_id = ve.id
            and veh.user_id = public.profiles.user_id
        )
        or exists (
          select 1
          from public.volunteer_signups vs
          where vs.event_id = ve.id
            and vs.volunteer_user_id = public.profiles.user_id
        )
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = ve.host_group_id
            and gm.user_id = public.profiles.user_id
            and gm.role in ('owner', 'admin')
        )
      )
  )
);

drop policy if exists profiles_select_activity_manager on public.profiles;
create policy profiles_select_activity_manager
on public.profiles
for select to authenticated
using (
  exists (
    select 1
    from public.activity_events ae
    where public.can_manage_activity(ae.id)
      and (
        ae.host_user_id = public.profiles.user_id
        or ae.created_by_user_id = public.profiles.user_id
        or exists (
          select 1
          from public.activity_hosts ah
          where ah.activity_event_id = ae.id
            and ah.user_id = public.profiles.user_id
        )
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = ae.host_group_id
            and gm.user_id = public.profiles.user_id
            and gm.role in ('owner', 'admin')
        )
      )
  )
);

create policy profiles_insert_self_safe
on public.profiles
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and admin = false
  and email is null
);

create policy profiles_update_self_safe
on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy profiles_delete_self
on public.profiles
for delete to authenticated
using (user_id = (select auth.uid()));

-- The auth triggers own their profile inserts and are allowed to populate the
-- auth-derived email. Client roles may only write mutable profile fields.
revoke all on table public.profiles from anon, authenticated, public;
grant select on table public.profiles to anon, authenticated;
grant insert (
  user_id,
  full_name,
  avatar_url,
  bio,
  metadata,
  phone,
  emergency_contact_name,
  emergency_contact_phone
) on table public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  bio,
  metadata,
  phone,
  emergency_contact_name,
  emergency_contact_phone
) on table public.profiles to authenticated;
grant delete on table public.profiles to authenticated;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- Service-role/auth-trigger writes have no end-user auth.uid(). Any request
  -- carrying an end-user identity must not change identity, email, or admin.
  if (select auth.uid()) is not null
     and coalesce((select auth.role()), '') not in ('service_role', 'supabase_admin', 'postgres') then
    if tg_op = 'INSERT' then
      if new.admin is distinct from false or new.email is not null then
        raise exception 'Privileged profile fields are managed by the system';
      end if;
    elsif new.user_id is distinct from old.user_id
       or new.admin is distinct from old.admin
       or new.email is distinct from old.email then
      raise exception 'Privileged profile fields are managed by the system';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

-- Safe public profile display data used by published learn/news/activity pages.
drop view if exists public.public_profiles;
create view public.public_profiles as
select user_id, full_name, avatar_url
from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- The host view remains invoker-secured and now keeps host rows even when the
-- joined profile is not visible to the current role. Email is therefore only
-- returned to an authorized manager via the profile RLS policy above.
create or replace view public.v_volunteer_event_hosts_with_profiles as
select
  veh.event_id,
  veh.user_id,
  veh.created_at,
  p.email,
  p.full_name
from public.volunteer_event_hosts veh
left join public.profiles p on p.user_id = veh.user_id;
alter view public.v_volunteer_event_hosts_with_profiles set (security_invoker = true);

-- Donation account data ------------------------------------------------------

drop policy if exists donation_accounts_select on public.donation_accounts;
drop policy if exists donation_accounts_select_manager on public.donation_accounts;
create policy donation_accounts_select_manager
on public.donation_accounts
for select to authenticated
using (group_id is not null and public.can_manage_group(group_id));

drop view if exists public.donation_accounts_public;
create view public.donation_accounts_public as
select
  da.id,
  da.recipient_type,
  da.group_id,
  da.display_name,
  da.charges_enabled,
  da.payouts_enabled,
  (da.stripe_account_id is not null and da.charges_enabled) as is_connected
from public.donation_accounts da
join public.groups g on g.id = da.group_id
where da.recipient_type = 'group'
  and g.is_published = true;
grant select on public.donation_accounts_public to anon, authenticated;

-- Membership records may be viewed by their member or a group manager, but
-- payment/status/tier fields are never self-service writable. Checkout and
-- webhook paths use the service role for creation and reconciliation.
drop policy if exists memberships_insert on public.group_memberships;
drop policy if exists memberships_update on public.group_memberships;
drop policy if exists memberships_insert_manager on public.group_memberships;
drop policy if exists memberships_update_manager on public.group_memberships;
alter policy memberships_select on public.group_memberships to authenticated;

create policy memberships_insert_manager
on public.group_memberships
for insert to authenticated
with check (public.is_group_membership_manager(group_id));

create policy memberships_update_manager
on public.group_memberships
for update to authenticated
using (public.is_group_membership_manager(group_id))
with check (public.is_group_membership_manager(group_id));

revoke insert, update, delete on table public.group_memberships from anon, authenticated, public;
grant insert, update on table public.group_memberships to authenticated;

-- These tables contain payment provider identifiers, webhook payloads,
-- verification tokens, bank credentials, raw feeds, and audit records. All
-- application call sites use the service client after their own server-side
-- authorization checks, so there is no reason to expose them through the
-- browser PostgREST roles.
do $sensitive_tables$
declare
  table_name text;
  policy_row record;
begin
  foreach table_name in array array[
    'group_membership_billing',
    'group_site_domains',
    'group_site_domain_orders',
    'group_site_domain_events',
    'group_email_sending_domains',
    'group_accounting_accounts',
    'group_accounting_audit_events',
    'group_accounting_bank_connections',
    'group_accounting_bank_feed_items',
    'group_accounting_budgets',
    'group_accounting_entries',
    'group_accounting_exports',
    'group_accounting_lines',
    'group_accounting_provider_accounts',
    'group_accounting_receipts',
    'group_accounting_reconciliations',
    'group_accounting_settings'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('revoke all on table public.%I from anon, authenticated, public', table_name);
      for policy_row in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = table_name
      loop
        execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
      end loop;
    end if;
  end loop;
end
$sensitive_tables$;

-- Storage --------------------------------------------------------------------

drop policy if exists "Upload 13v9it7_0" on storage.objects;
drop policy if exists "Upload 13v9it7_1" on storage.objects;
drop policy if exists "Upload 13v9it7_2" on storage.objects;
drop policy if exists "Upload 13v9it7_3" on storage.objects;
drop policy if exists storage_storage_insert_authenticated on storage.objects;
drop policy if exists storage_storage_update_authenticated on storage.objects;
drop policy if exists storage_storage_delete_authenticated on storage.objects;

-- The bucket is public for downloads, but object metadata and mutations are
-- not anonymous. Public URLs do not require a storage.objects SELECT policy.
create policy storage_storage_insert_authenticated
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'storage'
  and (
    (
      (storage.foldername(name))[1] = 'profiles'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
    or (
      (storage.foldername(name))[1] = 'groups'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.can_manage_group((case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (storage.foldername(name))[2]
        else null
      end)::uuid)
    )
  )
);

create policy storage_storage_update_authenticated
on storage.objects
for update to authenticated
using (
  bucket_id = 'storage'
  and (
    (
      (storage.foldername(name))[1] = 'profiles'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
    or (
      (storage.foldername(name))[1] = 'groups'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.can_manage_group((case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (storage.foldername(name))[2]
        else null
      end)::uuid)
    )
  )
)
with check (
  bucket_id = 'storage'
  and (
    (
      (storage.foldername(name))[1] = 'profiles'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
    or (
      (storage.foldername(name))[1] = 'groups'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.can_manage_group((case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (storage.foldername(name))[2]
        else null
      end)::uuid)
    )
  )
);

create policy storage_storage_delete_authenticated
on storage.objects
for delete to authenticated
using (
  bucket_id = 'storage'
  and (
    (
      (storage.foldername(name))[1] = 'profiles'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
    or (
      (storage.foldername(name))[1] = 'groups'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.can_manage_group((case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (storage.foldername(name))[2]
        else null
      end)::uuid)
    )
  )
);

-- PostGIS helper overloads are not used by the application and should not be
-- callable by browser roles. Keep service_role access for trusted workloads.
revoke all on function public.st_estimatedextent(text, text) from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text) from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text, boolean) from public, anon, authenticated;
