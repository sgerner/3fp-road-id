begin;

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000101', 'rsvp-host@example.invalid'),
    ('00000000-0000-4000-8000-000000000102', 'rsvp-rider@example.invalid'),
    ('00000000-0000-4000-8000-000000000103', 'rsvp-cancelled@example.invalid'),
    ('00000000-0000-4000-8000-000000000104', 'rsvp-viewer@example.invalid');

insert into public.activity_events (
    id, activity_type, host_user_id, created_by_user_id, title, slug,
    starts_at, ends_at, status, start_location_name
)
select ride.id, 'ride', '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000101', 'RSVP privacy fixture', ride.slug,
       now() + interval '1 day', now() + interval '1 day 1 hour', ride.status, 'Start'
from (values
    ('00000000-0000-4000-8000-000000000201'::uuid, 'rsvp-public-fixture', 'published'),
    ('00000000-0000-4000-8000-000000000202'::uuid, 'rsvp-private-fixture', 'published'),
    ('00000000-0000-4000-8000-000000000203'::uuid, 'rsvp-draft-fixture', 'draft')
) ride(id, slug, status);

insert into public.ride_details (activity_event_id, participant_visibility)
select id, case when slug = 'rsvp-private-fixture' then 'private' else 'public' end
from public.activity_events
where slug in ('rsvp-public-fixture', 'rsvp-private-fixture', 'rsvp-draft-fixture');

insert into public.activity_occurrences (activity_event_id, starts_at, ends_at)
select id, starts_at, ends_at
from public.activity_events
where slug in ('rsvp-public-fixture', 'rsvp-private-fixture', 'rsvp-draft-fixture');

insert into public.activity_rsvps (
    activity_event_id, activity_occurrence_id, user_id,
    participant_name, participant_email, participant_phone, status, cancelled_at
)
select ride.id, occurrence.id, '00000000-0000-4000-8000-000000000102',
       'rsvp-rider@example.invalid', 'rsvp-rider@example.invalid', '555-0100', 'going', null
from public.activity_occurrences occurrence
join public.activity_events ride on ride.id = occurrence.activity_event_id
where ride.slug in ('rsvp-public-fixture', 'rsvp-private-fixture', 'rsvp-draft-fixture');

insert into public.activity_rsvps (
    activity_event_id, activity_occurrence_id, user_id,
    participant_name, participant_email, status, cancelled_at
)
select activity_event_id, id, '00000000-0000-4000-8000-000000000103',
       'Cancelled rider', 'rsvp-cancelled@example.invalid', 'cancelled', now()
from public.activity_occurrences
where activity_event_id = '00000000-0000-4000-8000-000000000201';

set local role anon;
do $$
declare
    public_ride constant uuid := '00000000-0000-4000-8000-000000000201';
    projected jsonb;
begin
    if exists (select 1 from public.activity_rsvps where activity_event_id = public_ride) then
        raise exception 'Anonymous role can read private RSVP rows';
    end if;
    select jsonb_agg(to_jsonb(participant)) into projected
    from public.list_public_ride_participants(public_ride) participant;
    if jsonb_array_length(projected) is distinct from 1
       or projected->0->>'participant_name' is distinct from 'Rider'
       or (projected->0) ?| array['participant_email', 'participant_phone', 'user_id'] then
        raise exception 'Published roll call leaked contact data or included a cancelled RSVP';
    end if;
    if exists (select 1 from public.list_public_ride_participants('00000000-0000-4000-8000-000000000202'))
       or exists (select 1 from public.list_public_ride_participants('00000000-0000-4000-8000-000000000203')) then
        raise exception 'Published roll call included a private or draft ride';
    end if;
end $$;

set local role authenticated;
do $$
declare
    public_ride constant uuid := '00000000-0000-4000-8000-000000000201';
begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000104', true);
    if exists (select 1 from public.activity_rsvps where activity_event_id = public_ride) then
        raise exception 'Unrelated authenticated role can read private RSVP rows';
    end if;
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
    if (select array_agg(participant_phone) from public.activity_rsvps where activity_event_id = public_ride)
       is distinct from array['555-0100'] then
        raise exception 'Rider can no longer read their own RSVP or can read other RSVP rows';
    end if;
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
    if (select count(*) from public.activity_rsvps where activity_event_id = public_ride) <> 2
       or not exists (select 1 from public.activity_rsvps where activity_event_id = public_ride and participant_phone = '555-0100') then
        raise exception 'Ride manager can no longer read participant contacts';
    end if;
end $$;

rollback;
