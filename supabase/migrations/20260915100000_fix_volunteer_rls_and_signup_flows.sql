-- Fix volunteer event creation and the authenticated signup/profile write paths.

alter table public.volunteer_events
  add column if not exists register_notifications boolean not null default true;

alter table public.volunteer_events
  add column if not exists cancel_notifications boolean not null default true;

alter table public.volunteer_event_emails
  add column if not exists last_sent_at timestamptz;

-- The client uses these states when volunteers and event managers manage shift assignments.
alter type public.volunteer_shift_signup_status add value if not exists 'pending';
alter type public.volunteer_shift_signup_status add value if not exists 'approved';
alter type public.volunteer_shift_signup_status add value if not exists 'declined';
alter type public.volunteer_shift_signup_status add value if not exists 'confirmed';

-- Event authorization must work for a row that is being inserted. The previous helper
-- only looked up an existing event, so it could never authorize the first insert.
create or replace function public.can_view_volunteer_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.volunteer_events ve
    where ve.id = target_event_id
      and (
        ve.status = 'published'
        or public.can_manage_group(ve.host_group_id)
        or ve.created_by_user_id = (select auth.uid())
        or ve.host_user_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.user_id = (select auth.uid())
            and p.admin = true
        )
      )
  );
$function$;

create or replace function public.can_manage_volunteer_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.volunteer_events ve
    where ve.id = target_event_id
      and (
        ve.host_user_id = (select auth.uid())
        or ve.created_by_user_id = (select auth.uid())
        or public.can_manage_group(ve.host_group_id)
        or exists (
          select 1
          from public.profiles p
          where p.user_id = (select auth.uid())
            and p.admin = true
        )
      )
  );
$function$;

-- New auth users are created by a SECURITY DEFINER trigger. These policies allow the
-- authenticated client to complete or update its own profile after that trigger runs.
alter table public.profiles enable row level security;

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Hosts can maintain a reference-only profile while adding someone to an event.
-- Profile rows do not carry an event_id, so the manager check is anchored to an
-- event the current user manages; the volunteer signup itself remains scoped by
-- the event-specific policies below.
drop policy if exists profiles_insert_volunteer_manager on public.profiles;
create policy profiles_insert_volunteer_manager on public.profiles
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_events ve
    where public.can_manage_volunteer_event(ve.id)
  )
);

drop policy if exists profiles_update_volunteer_manager on public.profiles;
create policy profiles_update_volunteer_manager on public.profiles
for update to authenticated
using (
  (
    user_id is null
    and exists (
      select 1
      from public.volunteer_events ve
      where public.can_manage_volunteer_event(ve.id)
    )
  )
  or exists (
    select 1
    from public.volunteer_signups vs
    where vs.volunteer_user_id = public.profiles.user_id
      and public.can_manage_volunteer_event(vs.event_id)
  )
)
with check (
  (
    user_id is null
    and exists (
      select 1
      from public.volunteer_events ve
      where public.can_manage_volunteer_event(ve.id)
    )
  )
  or exists (
    select 1
    from public.volunteer_signups vs
    where vs.volunteer_user_id = public.profiles.user_id
      and public.can_manage_volunteer_event(vs.event_id)
  )
);

-- Volunteer events -----------------------------------------------------------

drop policy if exists volunteer_events_select on public.volunteer_events;
create policy volunteer_events_select on public.volunteer_events
for select to anon, authenticated
using (public.can_view_volunteer_event(id));

drop policy if exists volunteer_events_manage on public.volunteer_events;
drop policy if exists volunteer_events_manage_insert on public.volunteer_events;
drop policy if exists volunteer_events_manage_update on public.volunteer_events;
drop policy if exists volunteer_events_manage_delete on public.volunteer_events;

create policy volunteer_events_insert on public.volunteer_events
for insert to authenticated
with check (
  host_user_id = (select auth.uid())
  and created_by_user_id = (select auth.uid())
  and (
    host_group_id is null
    or public.can_manage_group(host_group_id)
    or exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.admin = true
    )
  )
);

create policy volunteer_events_update on public.volunteer_events
for update to authenticated
using (public.can_manage_volunteer_event(id))
with check (public.can_manage_volunteer_event(id));

create policy volunteer_events_delete on public.volunteer_events
for delete to authenticated
using (public.can_manage_volunteer_event(id));

-- Opportunities and shifts are writable only through an event manager, but are
-- publicly readable when their parent event is readable.

drop policy if exists volunteer_opportunities_select on public.volunteer_opportunities;
create policy volunteer_opportunities_select on public.volunteer_opportunities
for select to anon, authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_opportunities.event_id
      and public.can_view_volunteer_event(ve.id)
  )
);

drop policy if exists volunteer_opportunities_manage on public.volunteer_opportunities;
drop policy if exists volunteer_opportunities_manage_insert on public.volunteer_opportunities;
drop policy if exists volunteer_opportunities_manage_update on public.volunteer_opportunities;
drop policy if exists volunteer_opportunities_manage_delete on public.volunteer_opportunities;

create policy volunteer_opportunities_insert on public.volunteer_opportunities
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_opportunities.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

create policy volunteer_opportunities_update on public.volunteer_opportunities
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_opportunities.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
)
with check (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_opportunities.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

create policy volunteer_opportunities_delete on public.volunteer_opportunities
for delete to authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_opportunities.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

drop policy if exists volunteer_opportunity_shifts_select on public.volunteer_opportunity_shifts;
create policy volunteer_opportunity_shifts_select on public.volunteer_opportunity_shifts
for select to anon, authenticated
using (
  exists (
    select 1
    from public.volunteer_opportunities vo
    join public.volunteer_events ve on ve.id = vo.event_id
    where vo.id = public.volunteer_opportunity_shifts.opportunity_id
      and public.can_view_volunteer_event(ve.id)
  )
);

drop policy if exists volunteer_opportunity_shifts_manage on public.volunteer_opportunity_shifts;
drop policy if exists volunteer_opportunity_shifts_manage_insert on public.volunteer_opportunity_shifts;
drop policy if exists volunteer_opportunity_shifts_manage_update on public.volunteer_opportunity_shifts;
drop policy if exists volunteer_opportunity_shifts_manage_delete on public.volunteer_opportunity_shifts;

create policy volunteer_opportunity_shifts_insert on public.volunteer_opportunity_shifts
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_opportunities vo
    join public.volunteer_events ve on ve.id = vo.event_id
    where vo.id = public.volunteer_opportunity_shifts.opportunity_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

create policy volunteer_opportunity_shifts_update on public.volunteer_opportunity_shifts
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_opportunities vo
    join public.volunteer_events ve on ve.id = vo.event_id
    where vo.id = public.volunteer_opportunity_shifts.opportunity_id
      and public.can_manage_volunteer_event(ve.id)
  )
)
with check (
  exists (
    select 1
    from public.volunteer_opportunities vo
    join public.volunteer_events ve on ve.id = vo.event_id
    where vo.id = public.volunteer_opportunity_shifts.opportunity_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

create policy volunteer_opportunity_shifts_delete on public.volunteer_opportunity_shifts
for delete to authenticated
using (
  exists (
    select 1
    from public.volunteer_opportunities vo
    join public.volunteer_events ve on ve.id = vo.event_id
    where vo.id = public.volunteer_opportunity_shifts.opportunity_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

-- Questions may belong to the event itself (opportunity_id is null) or to one
-- of its opportunities. The previous policy only handled the latter.

drop policy if exists volunteer_custom_questions_select on public.volunteer_custom_questions;
create policy volunteer_custom_questions_select on public.volunteer_custom_questions
for select to anon, authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_custom_questions.event_id
      and public.can_view_volunteer_event(ve.id)
  )
  and (
    public.volunteer_custom_questions.opportunity_id is null
    or exists (
      select 1
      from public.volunteer_opportunities vo
      where vo.id = public.volunteer_custom_questions.opportunity_id
        and vo.event_id = public.volunteer_custom_questions.event_id
    )
  )
);

drop policy if exists volunteer_custom_questions_manage on public.volunteer_custom_questions;
drop policy if exists volunteer_custom_questions_manage_insert on public.volunteer_custom_questions;
drop policy if exists volunteer_custom_questions_manage_update on public.volunteer_custom_questions;
drop policy if exists volunteer_custom_questions_manage_delete on public.volunteer_custom_questions;

create policy volunteer_custom_questions_insert on public.volunteer_custom_questions
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_custom_questions.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
  and (
    public.volunteer_custom_questions.opportunity_id is null
    or exists (
      select 1
      from public.volunteer_opportunities vo
      where vo.id = public.volunteer_custom_questions.opportunity_id
        and vo.event_id = public.volunteer_custom_questions.event_id
    )
  )
);

create policy volunteer_custom_questions_update on public.volunteer_custom_questions
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_custom_questions.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
)
with check (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_custom_questions.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
  and (
    public.volunteer_custom_questions.opportunity_id is null
    or exists (
      select 1
      from public.volunteer_opportunities vo
      where vo.id = public.volunteer_custom_questions.opportunity_id
        and vo.event_id = public.volunteer_custom_questions.event_id
    )
  )
);

create policy volunteer_custom_questions_delete on public.volunteer_custom_questions
for delete to authenticated
using (
  exists (
    select 1
    from public.volunteer_events ve
    where ve.id = public.volunteer_custom_questions.event_id
      and public.can_manage_volunteer_event(ve.id)
  )
);

-- Volunteer signups ----------------------------------------------------------

drop policy if exists volunteer_signups_select on public.volunteer_signups;
create policy volunteer_signups_select on public.volunteer_signups
for select to authenticated
using (
  volunteer_user_id = (select auth.uid())
  or public.can_manage_volunteer_event(event_id)
);

drop policy if exists volunteer_signups_insert on public.volunteer_signups;
create policy volunteer_signups_insert on public.volunteer_signups
for insert to authenticated
with check (
  volunteer_user_id = (select auth.uid())
  and public.can_view_volunteer_event(event_id)
  and exists (
    select 1
    from public.volunteer_opportunities vo
    where vo.id = public.volunteer_signups.opportunity_id
      and vo.event_id = public.volunteer_signups.event_id
  )
);

create policy volunteer_signups_insert_manager on public.volunteer_signups
for insert to authenticated
with check (
  public.can_manage_volunteer_event(event_id)
  and exists (
    select 1
    from public.volunteer_opportunities vo
    where vo.id = public.volunteer_signups.opportunity_id
      and vo.event_id = public.volunteer_signups.event_id
  )
);

drop policy if exists volunteer_signups_update on public.volunteer_signups;
create policy volunteer_signups_update on public.volunteer_signups
for update to authenticated
using (
  volunteer_user_id = (select auth.uid())
  or public.can_manage_volunteer_event(event_id)
)
with check (
  (
    volunteer_user_id = (select auth.uid())
    and public.can_view_volunteer_event(event_id)
    and exists (
      select 1
      from public.volunteer_opportunities vo
      where vo.id = public.volunteer_signups.opportunity_id
        and vo.event_id = public.volunteer_signups.event_id
    )
  )
  or (
    public.can_manage_volunteer_event(event_id)
    and exists (
      select 1
      from public.volunteer_opportunities vo
      where vo.id = public.volunteer_signups.opportunity_id
        and vo.event_id = public.volunteer_signups.event_id
    )
  )
);

drop policy if exists volunteer_signups_delete on public.volunteer_signups;
create policy volunteer_signups_delete on public.volunteer_signups
for delete to authenticated
using (
  volunteer_user_id = (select auth.uid())
  or public.can_manage_volunteer_event(event_id)
);

-- Signup shifts are writable by the volunteer who owns the signup and by event
-- managers. Both paths validate that the selected shift belongs to the signup's
-- opportunity and event.

drop policy if exists volunteer_signup_shifts_select on public.volunteer_signup_shifts;
create policy volunteer_signup_shifts_select on public.volunteer_signup_shifts
for select to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and (
        vs.volunteer_user_id = (select auth.uid())
        or public.can_manage_volunteer_event(vs.event_id)
      )
  )
);

drop policy if exists volunteer_signup_shifts_manage on public.volunteer_signup_shifts;
drop policy if exists volunteer_signup_shifts_manage_insert on public.volunteer_signup_shifts;
drop policy if exists volunteer_signup_shifts_manage_update on public.volunteer_signup_shifts;
drop policy if exists volunteer_signup_shifts_manage_delete on public.volunteer_signup_shifts;

create policy volunteer_signup_shifts_insert_own on public.volunteer_signup_shifts
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and vs.volunteer_user_id = (select auth.uid())
      and public.can_view_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_shifts_insert_manager on public.volunteer_signup_shifts
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and public.can_manage_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_shifts_update_own on public.volunteer_signup_shifts
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and vs.volunteer_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and vs.volunteer_user_id = (select auth.uid())
  )
);

create policy volunteer_signup_shifts_update_manager on public.volunteer_signup_shifts
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and public.can_manage_volunteer_event(vs.event_id)
  )
)
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and public.can_manage_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_shifts_delete on public.volunteer_signup_shifts
for delete to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_opportunities vo on vo.id = vs.opportunity_id
    join public.volunteer_opportunity_shifts os on os.id = public.volunteer_signup_shifts.shift_id
    where vs.id = public.volunteer_signup_shifts.signup_id
      and os.opportunity_id = vo.id
      and vo.event_id = vs.event_id
      and (
        vs.volunteer_user_id = (select auth.uid())
        or public.can_manage_volunteer_event(vs.event_id)
      )
  )
);

-- Signup responses follow the same owner/manager model and validate that the
-- question belongs to the signup's event and, when scoped, its opportunity.

drop policy if exists volunteer_signup_responses_select on public.volunteer_signup_responses;
create policy volunteer_signup_responses_select on public.volunteer_signup_responses
for select to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and (
        vs.volunteer_user_id = (select auth.uid())
        or public.can_manage_volunteer_event(vs.event_id)
      )
  )
);

drop policy if exists volunteer_signup_responses_manage on public.volunteer_signup_responses;
drop policy if exists volunteer_signup_responses_manage_insert on public.volunteer_signup_responses;
drop policy if exists volunteer_signup_responses_manage_update on public.volunteer_signup_responses;
drop policy if exists volunteer_signup_responses_manage_delete on public.volunteer_signup_responses;

create policy volunteer_signup_responses_insert_own on public.volunteer_signup_responses
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and vs.volunteer_user_id = (select auth.uid())
      and public.can_view_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_responses_insert_manager on public.volunteer_signup_responses
for insert to authenticated
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and public.can_manage_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_responses_update_own on public.volunteer_signup_responses
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and vs.volunteer_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and vs.volunteer_user_id = (select auth.uid())
  )
);

create policy volunteer_signup_responses_update_manager on public.volunteer_signup_responses
for update to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and public.can_manage_volunteer_event(vs.event_id)
  )
)
with check (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and public.can_manage_volunteer_event(vs.event_id)
  )
);

create policy volunteer_signup_responses_delete on public.volunteer_signup_responses
for delete to authenticated
using (
  exists (
    select 1
    from public.volunteer_signups vs
    join public.volunteer_custom_questions q on q.id = public.volunteer_signup_responses.question_id
    where vs.id = public.volunteer_signup_responses.signup_id
      and q.event_id = vs.event_id
      and (q.opportunity_id is null or q.opportunity_id = vs.opportunity_id)
      and (
        vs.volunteer_user_id = (select auth.uid())
        or public.can_manage_volunteer_event(vs.event_id)
      )
  )
);

-- Event email templates and host assignments are manager-owned resources.

drop policy if exists volunteer_event_emails_manage on public.volunteer_event_emails;
drop policy if exists volunteer_event_emails_manage_insert on public.volunteer_event_emails;
drop policy if exists volunteer_event_emails_manage_update on public.volunteer_event_emails;
drop policy if exists volunteer_event_emails_manage_delete on public.volunteer_event_emails;
drop policy if exists volunteer_event_emails_select on public.volunteer_event_emails;

create policy volunteer_event_emails_select on public.volunteer_event_emails
for select to authenticated
using (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_emails_insert on public.volunteer_event_emails
for insert to authenticated
with check (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_emails_update on public.volunteer_event_emails
for update to authenticated
using (public.can_manage_volunteer_event(event_id))
with check (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_emails_delete on public.volunteer_event_emails
for delete to authenticated
using (public.can_manage_volunteer_event(event_id));

drop policy if exists volunteer_event_hosts_manage on public.volunteer_event_hosts;
drop policy if exists volunteer_event_hosts_manage_insert on public.volunteer_event_hosts;
drop policy if exists volunteer_event_hosts_manage_update on public.volunteer_event_hosts;
drop policy if exists volunteer_event_hosts_manage_delete on public.volunteer_event_hosts;
drop policy if exists volunteer_event_hosts_select on public.volunteer_event_hosts;

create policy volunteer_event_hosts_select on public.volunteer_event_hosts
for select to authenticated
using (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_hosts_insert on public.volunteer_event_hosts
for insert to authenticated
with check (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_hosts_update on public.volunteer_event_hosts
for update to authenticated
using (public.can_manage_volunteer_event(event_id))
with check (public.can_manage_volunteer_event(event_id));

create policy volunteer_event_hosts_delete on public.volunteer_event_hosts
for delete to authenticated
using (public.can_manage_volunteer_event(event_id));
