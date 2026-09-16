-- Keep profile RLS policies from recursively re-entering profiles through the
-- event/activity visibility policies. These SECURITY DEFINER helpers inspect
-- the relationship graph as the policy owner and are executable only by an
-- authenticated caller.

create or replace function public.can_view_volunteer_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.volunteer_events ve
      where public.can_manage_volunteer_event(ve.id)
        and (
          ve.host_user_id = target_user_id
          or ve.created_by_user_id = target_user_id
          or exists (
            select 1
            from public.volunteer_event_hosts veh
            where veh.event_id = ve.id
              and veh.user_id = target_user_id
          )
          or exists (
            select 1
            from public.volunteer_signups vs
            where vs.event_id = ve.id
              and vs.volunteer_user_id = target_user_id
          )
          or exists (
            select 1
            from public.group_members gm
            where gm.group_id = ve.host_group_id
              and gm.user_id = target_user_id
              and gm.role in ('owner', 'admin')
          )
        )
    );
$function$;

create or replace function public.can_view_activity_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.activity_events ae
      where public.can_manage_activity(ae.id)
        and (
          ae.host_user_id = target_user_id
          or ae.created_by_user_id = target_user_id
          or exists (
            select 1
            from public.activity_hosts ah
            where ah.activity_event_id = ae.id
              and ah.user_id = target_user_id
          )
          or exists (
            select 1
            from public.group_members gm
            where gm.group_id = ae.host_group_id
              and gm.user_id = target_user_id
              and gm.role in ('owner', 'admin')
          )
        )
    );
$function$;

revoke execute on function public.can_view_volunteer_profile(uuid) from public, anon;
grant execute on function public.can_view_volunteer_profile(uuid) to authenticated;
revoke execute on function public.can_view_activity_profile(uuid) from public, anon;
grant execute on function public.can_view_activity_profile(uuid) to authenticated;

drop policy if exists profiles_select_volunteer_manager on public.profiles;
create policy profiles_select_volunteer_manager
on public.profiles
for select to authenticated
using (public.can_view_volunteer_profile(user_id));

drop policy if exists profiles_select_activity_manager on public.profiles;
create policy profiles_select_activity_manager
on public.profiles
for select to authenticated
using (public.can_view_activity_profile(user_id));

-- The browser uses the safe donation view. The base table is service-role-only.
drop policy if exists donation_accounts_select_manager on public.donation_accounts;
revoke all on table public.donation_accounts from anon, authenticated, public;

-- Membership writes remain manager-only; service-role checkout/webhook code is
-- not affected. Remove unnecessary anonymous table privileges as well.
revoke all on table public.group_memberships from anon, authenticated, public;
grant select, insert, update on table public.group_memberships to authenticated;
