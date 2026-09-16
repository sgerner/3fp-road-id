-- Close second-order write paths that remain reachable through the generic
-- table API after the row-level ownership policies have authorized a row.

-- A volunteer may maintain contact details and waiver state on their own
-- signup, but approval, cancellation timestamps, and relationships belong to
-- the event workflow/host. The signup table intentionally has no status
-- column; assignment status lives on volunteer_signup_shifts.
create or replace function public.protect_volunteer_signup_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller_id uuid := (select auth.uid());
  caller_role text := coalesce((select auth.role()), '');
begin
  if caller_id is null or caller_role in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  if public.can_manage_volunteer_event(coalesce(old.event_id, new.event_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.volunteer_user_id is distinct from caller_id then
      raise exception using
        errcode = '42501',
        message = 'A volunteer signup must belong to the signed-in volunteer';
    end if;
    if new.approval_note is not null
       or new.internal_notes is not null
       or new.confirmed_at is not null
       or new.cancelled_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Approval and attendance fields are managed by the event host';
    end if;
    return new;
  end if;

  if new.event_id is distinct from old.event_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.volunteer_user_id is distinct from old.volunteer_user_id
     or new.approval_note is distinct from old.approval_note
     or new.internal_notes is distinct from old.internal_notes
     or new.confirmed_at is distinct from old.confirmed_at
     or new.cancelled_at is distinct from old.cancelled_at
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '42501',
      message = 'Signup relationship and host-managed fields cannot be changed by a volunteer';
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_volunteer_signup_fields on public.volunteer_signups;
create trigger protect_volunteer_signup_fields
before insert or update on public.volunteer_signups
for each row execute function public.protect_volunteer_signup_fields();

-- Preserve the legacy registered default while rejecting host-only states and
-- making volunteer transitions one-way unless the row is being reactivated.
create or replace function public.protect_volunteer_signup_shift_transitions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller_id uuid := (select auth.uid());
  caller_role text := coalesce((select auth.role()), '');
  event_id uuid;
  requires_approval boolean;
  shift_start timestamptz;
begin
  if caller_id is null or caller_role in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  select vs.event_id, vo.requires_approval
  into event_id, requires_approval
  from public.volunteer_signups vs
  join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
  join public.volunteer_opportunity_shifts os on os.opportunity_id = vo.id
  where vs.id = new.signup_id
    and os.id = new.shift_id
    and vo.event_id = vs.event_id;

  if event_id is null then
    raise exception using
      errcode = '42501',
      message = 'The selected volunteer shift is not part of the signup event';
  end if;

  if public.can_manage_volunteer_event(event_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status::text not in ('registered', 'pending', 'approved') then
      raise exception using
        errcode = '42501',
        message = 'A volunteer may only create a registered, pending, or approved assignment';
    end if;
    if requires_approval and new.status::text <> 'pending' then
      raise exception using
        errcode = '42501',
        message = 'This assignment requires host approval';
    end if;
    if new.confirmed_at is not null or new.cancelled_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Attendance timestamps are managed by the volunteer workflow';
    end if;
    return new;
  end if;

  if new.signup_id is distinct from old.signup_id
     or new.shift_id is distinct from old.shift_id then
    raise exception using
      errcode = '42501',
      message = 'A volunteer cannot move an existing assignment directly';
  end if;

  if new.status::text is distinct from old.status::text then
    if new.status::text = 'cancelled' then
      if new.cancelled_at is null or new.confirmed_at is not null then
        raise exception using
          errcode = '42501',
          message = 'Cancelled assignments must include only a cancellation timestamp';
      end if;
    elsif new.status::text = 'pending' then
      if old.status::text <> 'cancelled'
         or new.cancelled_at is not null
         or new.confirmed_at is not null then
        raise exception using
          errcode = '42501',
          message = 'Only a cancelled assignment can be reactivated';
      end if;
    else
      raise exception using
        errcode = '42501',
        message = 'Only the event host can set this assignment status';
    end if;
  end if;

  if new.confirmed_at is distinct from old.confirmed_at then
    if new.confirmed_at is null then
      if new.status::text <> 'cancelled' then
        raise exception using
          errcode = '42501',
          message = 'A confirmation cannot be cleared except while cancelling';
      end if;
    else
      if new.status::text <> 'approved' or new.cancelled_at is not null then
        raise exception using
          errcode = '42501',
          message = 'Only an active approved assignment can be confirmed';
      end if;

      select os.starts_at
      into shift_start
      from public.volunteer_opportunity_shifts os
      where os.id = new.shift_id;

      if shift_start is null
         or shift_start < now()
         or shift_start > now() + interval '48 hours' then
        raise exception using
          errcode = '42501',
          message = 'Assignments can only be confirmed within 48 hours of the shift';
      end if;
    end if;
  end if;

  if new.cancelled_at is distinct from old.cancelled_at then
    if new.cancelled_at is null then
      if new.status::text <> 'pending' or old.status::text <> 'cancelled' then
        raise exception using
          errcode = '42501',
          message = 'Only a cancelled assignment can be reactivated';
      end if;
    elsif new.status::text <> 'cancelled' or new.confirmed_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Cancellation timestamps require cancelled status';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_volunteer_signup_shift_transitions
  on public.volunteer_signup_shifts;
create trigger protect_volunteer_signup_shift_transitions
before insert or update on public.volunteer_signup_shifts
for each row execute function public.protect_volunteer_signup_shift_transitions();

-- RSVP ownership policies must bind the occurrence and event IDs together;
-- otherwise an owner can move an RSVP between unrelated activity events.
drop policy if exists activity_rsvps_insert on public.activity_rsvps;
create policy activity_rsvps_insert on public.activity_rsvps
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.activity_occurrences ao
    join public.activity_events ae on ae.id = ao.activity_event_id
    where ao.id = public.activity_rsvps.activity_occurrence_id
      and ao.activity_event_id = public.activity_rsvps.activity_event_id
      and ao.status = 'scheduled'
      and ae.status = 'published'
  )
);

drop policy if exists activity_rsvps_update on public.activity_rsvps;
create policy activity_rsvps_update on public.activity_rsvps
for update to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_activity(activity_event_id)
)
with check (
  public.can_manage_activity(activity_event_id)
  or (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.activity_occurrences ao
      join public.activity_events ae on ae.id = ao.activity_event_id
      where ao.id = public.activity_rsvps.activity_occurrence_id
        and ao.activity_event_id = public.activity_rsvps.activity_event_id
        and ae.status = 'published'
    )
  )
);

create or replace function public.protect_activity_rsvp_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller_id uuid := (select auth.uid());
  caller_role text := coalesce((select auth.role()), '');
begin
  if caller_id is null or caller_role in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  if public.can_manage_activity(coalesce(old.activity_event_id, new.activity_event_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from caller_id then
      raise exception using
        errcode = '42501',
        message = 'An RSVP must belong to the signed-in rider';
    end if;
    return new;
  end if;

  if new.activity_event_id is distinct from old.activity_event_id
     or new.activity_occurrence_id is distinct from old.activity_occurrence_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '42501',
      message = 'RSVP ownership and event relationships cannot be changed by a rider';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      if new.cancelled_at is null then
        raise exception using
          errcode = '42501',
          message = 'Cancelled RSVPs require a cancellation timestamp';
      end if;
    elsif new.status = 'going' then
      if old.status <> 'cancelled' or new.cancelled_at is not null then
        raise exception using
          errcode = '42501',
          message = 'Only a cancelled RSVP can be reactivated';
      end if;
    else
      raise exception using
        errcode = '42501',
        message = 'Only the activity host can set this RSVP status';
    end if;
  end if;

  if new.cancelled_at is distinct from old.cancelled_at then
    if new.cancelled_at is null then
      if new.status <> 'going' or old.status <> 'cancelled' then
        raise exception using
          errcode = '42501',
          message = 'Only a cancelled RSVP can be reactivated';
      end if;
    elsif new.status <> 'cancelled' then
      raise exception using
        errcode = '42501',
        message = 'Cancellation timestamps require cancelled status';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_activity_rsvp_fields on public.activity_rsvps;
create trigger protect_activity_rsvp_fields
before insert or update on public.activity_rsvps
for each row execute function public.protect_activity_rsvp_fields();

revoke all on function public.protect_volunteer_signup_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_volunteer_signup_shift_transitions() from public, anon, authenticated, service_role;
revoke all on function public.protect_activity_rsvp_fields() from public, anon, authenticated, service_role;
