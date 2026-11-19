-- Existing-row RLS determines who can edit an event. Authorize a changed
-- organization against the new row so that editors cannot assign other groups
-- as hosts. Preserve personal hosting, service writes and volunteer admin access.
create or replace function private.authorize_event_host_group_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user <> 'authenticated'
    or new.host_group_id is null
    or new.host_group_id is not distinct from old.host_group_id
    or public.can_manage_group(new.host_group_id) then
    return new;
  end if;

  if tg_table_name = 'volunteer_events' and public.is_site_admin() then
    return new;
  end if;

  raise exception 'You do not have permission to host an event under this organization.'
    using errcode = '42501';
end;
$$;

revoke all on function private.authorize_event_host_group_change()
  from public, anon, authenticated;

create trigger authorize_activity_event_host_group_change
  before update of host_group_id on public.activity_events
  for each row execute function private.authorize_event_host_group_change();

create trigger authorize_volunteer_event_host_group_change
  before update of host_group_id on public.volunteer_events
  for each row execute function private.authorize_event_host_group_change();
