-- Keep participant contact details private to the participant and ride managers.
drop policy if exists activity_rsvps_select on public.activity_rsvps;
create policy activity_rsvps_select on public.activity_rsvps
for select using (
    auth.uid() = user_id
    or public.can_manage_activity(activity_event_id)
);

-- Public roll calls need only active display names and the occurrence they belong to.
create function public.list_public_ride_participants(target_activity_event_id uuid)
returns table (
    id uuid,
    activity_occurrence_id uuid,
    participant_name text,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select rsvp.id,
           rsvp.activity_occurrence_id,
           case
               when btrim(rsvp.participant_name) = ''
                 or strpos(rsvp.participant_name, '@') > 0
                 or btrim(rsvp.participant_name) = btrim(rsvp.participant_phone) then 'Rider'
               else rsvp.participant_name
           end,
           rsvp.created_at
    from public.activity_rsvps rsvp
    join public.ride_details details on details.activity_event_id = rsvp.activity_event_id
    where rsvp.activity_event_id = target_activity_event_id
      and details.participant_visibility = 'public'
      and public.activity_is_published(rsvp.activity_event_id)
      and rsvp.status = 'going'
    order by rsvp.created_at, rsvp.id;
$$;

revoke all on function public.list_public_ride_participants(uuid) from public;
grant execute on function public.list_public_ride_participants(uuid) to anon, authenticated, service_role;
