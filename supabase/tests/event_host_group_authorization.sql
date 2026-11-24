begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'event-host-fixture@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'event-admin-fixture@example.invalid'),
  ('00000000-0000-4000-8000-000000000503', 'event-cohost-fixture@example.invalid'),
  ('00000000-0000-4000-8000-000000000504', 'group-owner-fixture@example.invalid');

insert into public.profiles (user_id, email, admin) values
  ('00000000-0000-4000-8000-000000000501', 'event-host-fixture@example.invalid', false),
  ('00000000-0000-4000-8000-000000000502', 'event-admin-fixture@example.invalid', true),
  ('00000000-0000-4000-8000-000000000503', 'event-cohost-fixture@example.invalid', false),
  ('00000000-0000-4000-8000-000000000504', 'group-owner-fixture@example.invalid', false)
on conflict (user_id) do update set admin = excluded.admin;

insert into public.groups (id, name, slug, microsite_slug, city, state_region) values
  ('00000000-0000-4000-8000-000000000511', 'Original fixture', 'event-org-original-fixture', 'event-org-original-fixture', 'Phoenix', 'AZ'),
  ('00000000-0000-4000-8000-000000000512', 'Managed fixture', 'event-org-managed-fixture', 'event-org-managed-fixture', 'Phoenix', 'AZ'),
  ('00000000-0000-4000-8000-000000000513', 'Unmanaged fixture', 'event-org-unmanaged-fixture', 'event-org-unmanaged-fixture', 'Phoenix', 'AZ');

insert into public.group_members (group_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000501', 'owner'),
  ('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000504', 'owner');

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

insert into public.activity_hosts (activity_event_id, user_id)
values ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000503');

insert into public.volunteer_event_hosts (event_id, user_id)
values ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000503');

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

    execute format('update public.%I set host_group_id = $1 where id = $2', event_table)
      using managed_group, event_id;
  end loop;
end;
$$;

-- Invited co-hosts can edit event details while preserving unchanged host_group_id,
-- and cannot switch host_group_id to an unmanaged organization.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000503', true);

do $$
declare
  event_id constant uuid := '00000000-0000-4000-8000-000000000521';
  managed_group constant uuid := '00000000-0000-4000-8000-000000000512';
  unmanaged_group constant uuid := '00000000-0000-4000-8000-000000000513';
  saved_group uuid;
begin
  update public.activity_events
    set title = 'Ride updated by co-host', host_group_id = managed_group
    where id = event_id
    returning host_group_id into saved_group;
  if saved_group is distinct from managed_group then
    raise exception 'Invited ride co-host should preserve unchanged host organization';
  end if;

  update public.volunteer_events
    set title = 'Volunteer event updated by co-host', host_group_id = managed_group
    where id = event_id
    returning host_group_id into saved_group;
  if saved_group is distinct from managed_group then
    raise exception 'Invited volunteer co-host should preserve unchanged host organization';
  end if;

  begin
    update public.volunteer_events
      set host_group_id = unmanaged_group
      where id = event_id;
    raise exception 'Co-host changing volunteer event to unmanaged group should fail';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
update public.volunteer_events set host_group_id = '00000000-0000-4000-8000-000000000513'
where id = '00000000-0000-4000-8000-000000000521';

set local role service_role;
update public.activity_events set host_group_id = null
where id = '00000000-0000-4000-8000-000000000521';

insert into public.event_sponsorship_requests (
  id, group_id, requester_user_id, activity_event_id, message, status
) values (
  '00000000-0000-4000-8000-000000000531',
  '00000000-0000-4000-8000-000000000513',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000521',
  'Would love club co-sponsorship for our community ride.',
  'pending'
);

-- Group owners and requesters can read pending sponsorship requests; direct client writes are blocked.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000504', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.event_sponsorship_requests
  where id = '00000000-0000-4000-8000-000000000531';
  if visible_count <> 1 then
    raise exception 'Group manager should be able to view pending sponsorship requests';
  end if;

  begin
    update public.event_sponsorship_requests
      set status = 'approved'
      where id = '00000000-0000-4000-8000-000000000531';
    raise exception 'Direct client updates to event_sponsorship_requests should be denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set local role service_role;
update public.event_sponsorship_requests
  set status = 'approved', reviewed_by_user_id = '00000000-0000-4000-8000-000000000504', reviewed_at = now()
  where id = '00000000-0000-4000-8000-000000000531';
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
