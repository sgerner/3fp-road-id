-- Keep membership reads available to signed-in users, but remove stale
-- write policies and table-level access inherited by anonymous clients.
drop policy if exists group_members_manage on public.group_members;
drop policy if exists group_members_manage_insert on public.group_members;
drop policy if exists group_members_manage_update on public.group_members;
drop policy if exists group_members_manage_delete on public.group_members;
drop policy if exists group_members_select on public.group_members;

create policy group_members_select
  on public.group_members
  for select
  to authenticated
  using ((select auth.uid()) = user_id or can_manage_group(group_id));

revoke all privileges on table public.group_members from public, anon;
grant select on table public.group_members to authenticated;
