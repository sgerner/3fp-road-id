-- RLS scopes volunteer rows to the right person, but UPDATE policies still
-- expose every column on a row owned by that person. These triggers keep
-- relationship and manager-owned fields immutable for volunteers and prevent
-- a volunteer from self-approving an assignment through the generic API.

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
  -- Trusted server workflows and database jobs retain the full row surface.
  if caller_id is null or caller_role in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  -- Managers may edit operational contact and approval fields for their event.
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
     or new.cancelled_at is distinct from old.cancelled_at then
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
  -- Trusted server workflows and managers retain the full assignment surface.
  if caller_id is null or caller_role in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and public.can_manage_volunteer_event(
       (select vs.event_id from public.volunteer_signups vs where vs.id = old.signup_id)
     ) then
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

  if tg_op = 'INSERT' then
    if new.status::text not in ('pending', 'approved') then
      raise exception using
        errcode = '42501',
        message = 'A volunteer may only create a pending or approved assignment';
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
      if new.cancelled_at is not null or new.confirmed_at is not null then
        raise exception using
          errcode = '42501',
          message = 'Pending assignments cannot be marked attended or cancelled';
      end if;
    elsif new.status::text = 'approved' then
      -- Approval is a host decision. An already-approved volunteer may still
      -- update its confirmation timestamp through the time-window check below.
      if old.status::text <> 'approved' then
        raise exception using
          errcode = '42501',
          message = 'Only the event host can approve an assignment';
      end if;
    else
      raise exception using
        errcode = '42501',
        message = 'Only the event host can set this assignment status';
    end if;
  end if;

  if new.confirmed_at is distinct from old.confirmed_at
     and new.confirmed_at is not null then
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

-- Trigger entry points are internal and should not be exposed as RPCs.
revoke all on function public.protect_volunteer_signup_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_volunteer_signup_shift_transitions() from public, anon, authenticated, service_role;
