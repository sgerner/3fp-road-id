begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'event-host-fixture@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'event-admin-fixture@example.invalid');

update public.profiles set admin = true
where user_id = '00000000-0000-4000-8000-000000000502';

insert into public.groups (id, name, slug, microsite_slug, city, state_region) values
  ('00000000-0000-4000-8000-000000000511', 'Original fixture', 'event-org-original-fixture', 'event-org-original-fixture', 'Phoenix', 'AZ'),
  ('00000000-0000-4000-8000-000000000512', 'Managed fixture', 'event-org-managed-fixture', 'event-org-managed-fixture', 'Phoenix', 'AZ'),
  ('00000000-0000-4000-8000-000000000513', 'Unmanaged fixture', 'event-org-unmanaged-fixture', 'event-org-unmanaged-fixture', 'Phoenix', 'AZ');

insert into public.group_members (group_id, user_id, role)
values ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000501', 'owner');

insert into public.activity_events (
  id, activity_type, host_user_id, created_by_user_id, host_group_id,
  title, slug, starts_at, ends_at, start_location_name
) values (
  '00000000-0000-4000-8000-000000000521', 'ride',
  '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000511', 'Ride fixture',
  'event-affiliation-ride-fixture', now(), now() + interval '1 hour', 'Start'
);

insert into public.volunteer_events (
  id, host_user_id, created_by_user_id, host_group_id, title, slug, event_start, event_end
) values (
  '00000000-0000-4000-8000-000000000521',
  '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000511', 'Volunteer fixture',
  'event-affiliation-volunteer-fixture', now(), now() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);

do $$
declare
  event_table text;
  event_id constant uuid := '00000000-0000-4000-8000-000000000521';
  original_group constant uuid := '00000000-0000-4000-8000-000000000511';
  managed_group constant uuid := '00000000-0000-4000-8000-000000000512';
  unmanaged_group constant uuid := '00000000-0000-4000-8000-000000000513';
  saved_group uuid;
  update_count integer;
begin
  foreach event_table in array array['activity_events', 'volunteer_events'] loop
    execute format('update public.%I set host_group_id = $1 where id = $2 returning host_group_id', event_table)
      into saved_group using original_group, event_id;
    if saved_group is distinct from original_group then
      raise exception 'An existing host affiliation should still permit event edits';
    end if;

    begin
      execute format('update public.%I set host_group_id = $1 where id = $2', event_table)
        using unmanaged_group, event_id;
      raise exception 'Changing an event to an unmanaged group should fail';
    exception when insufficient_privilege then
      null;
    end;

    execute format('update public.%I set host_group_id = $1 where id = $2 returning host_group_id', event_table)
      into saved_group using managed_group, event_id;
    if saved_group is distinct from managed_group then
      raise exception 'An event host should be able to choose an organization they manage';
    end if;

    execute format('update public.%I set host_group_id = null where id = $1', event_table) using event_id;
    get diagnostics update_count = row_count;
    if update_count <> 1 then
      raise exception 'An event host should be able to return to personal hosting';
    end if;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
update public.volunteer_events set host_group_id = '00000000-0000-4000-8000-000000000513'
where id = '00000000-0000-4000-8000-000000000521';

set local role service_role;
update public.activity_events set host_group_id = '00000000-0000-4000-8000-000000000513'
where id = '00000000-0000-4000-8000-000000000521';

do $$
declare
  event_id constant uuid := '00000000-0000-4000-8000-000000000521';
  group_id constant uuid := '00000000-0000-4000-8000-000000000513';
begin
  if (select host_group_id from public.volunteer_events where id = event_id) is distinct from group_id
    or (select host_group_id from public.activity_events where id = event_id) is distinct from group_id then
    raise exception 'Volunteer site admins and service writers should retain organization reassignment';
  end if;
end;
$$;

rollback;
