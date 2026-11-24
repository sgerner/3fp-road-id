-- Support event sponsorship requests and preserve existing host group affiliations
-- when invited volunteer co-hosts edit event details.

create or replace function public.is_volunteer_event_host(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select target_event_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.volunteer_event_hosts veh
      where veh.event_id = target_event_id
        and veh.user_id = (select auth.uid())
    );
$function$;

revoke all on function public.is_volunteer_event_host(uuid) from public;
grant execute on function public.is_volunteer_event_host(uuid) to anon, authenticated, service_role;

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
        or public.is_volunteer_event_host(ve.id)
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
        or public.is_volunteer_event_host(ve.id)
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

drop policy if exists volunteer_events_select on public.volunteer_events;
create policy volunteer_events_select on public.volunteer_events
for select to anon, authenticated
using (
  status = 'published'
  or public.can_manage_group(host_group_id)
  or created_by_user_id = (select auth.uid())
  or host_user_id = (select auth.uid())
  or public.is_volunteer_event_host(id)
  or exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.admin = true
  )
);

-- Server-managed sponsorship requests for rides and volunteer events.
create table if not exists public.event_sponsorship_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  activity_event_id uuid references public.activity_events(id) on delete cascade,
  volunteer_event_id uuid references public.volunteer_events(id) on delete cascade,
  message text,
  status text not null default 'pending',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sponsorship_requests_single_event_chk check (
    ((activity_event_id is not null)::integer + (volunteer_event_id is not null)::integer) = 1
  ),
  constraint event_sponsorship_requests_status_chk check (
    status in ('pending', 'approved', 'declined', 'cancelled')
  ),
  constraint event_sponsorship_requests_message_len_chk check (
    message is null or char_length(message) <= 1000
  ),
  constraint event_sponsorship_requests_decision_note_len_chk check (
    decision_note is null or char_length(decision_note) <= 1000
  )
);

create unique index if not exists event_sponsorship_requests_pending_activity_uidx
  on public.event_sponsorship_requests (activity_event_id)
  where status = 'pending' and activity_event_id is not null;

create unique index if not exists event_sponsorship_requests_pending_volunteer_uidx
  on public.event_sponsorship_requests (volunteer_event_id)
  where status = 'pending' and volunteer_event_id is not null;

create index if not exists event_sponsorship_requests_group_status_created_idx
  on public.event_sponsorship_requests (group_id, status, created_at desc);

create index if not exists event_sponsorship_requests_requester_idx
  on public.event_sponsorship_requests (requester_user_id, created_at desc);

create index if not exists event_sponsorship_requests_activity_event_idx
  on public.event_sponsorship_requests (activity_event_id)
  where activity_event_id is not null;

create index if not exists event_sponsorship_requests_volunteer_event_idx
  on public.event_sponsorship_requests (volunteer_event_id)
  where volunteer_event_id is not null;

create index if not exists event_sponsorship_requests_reviewed_by_idx
  on public.event_sponsorship_requests (reviewed_by_user_id)
  where reviewed_by_user_id is not null;

alter table public.event_sponsorship_requests enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on table public.event_sponsorship_requests
  from public, anon, authenticated;

grant select on table public.event_sponsorship_requests to authenticated;
grant all on table public.event_sponsorship_requests to service_role;

drop policy if exists event_sponsorship_requests_service_role_all on public.event_sponsorship_requests;
create policy event_sponsorship_requests_service_role_all on public.event_sponsorship_requests
for all to service_role
using (true)
with check (true);

drop policy if exists event_sponsorship_requests_select on public.event_sponsorship_requests;
create policy event_sponsorship_requests_select on public.event_sponsorship_requests
for select to authenticated
using (
  requester_user_id = (select auth.uid())
  or public.can_manage_group(group_id)
  or public.is_site_admin()
  or (activity_event_id is not null and public.can_manage_activity(activity_event_id))
  or (volunteer_event_id is not null and public.can_manage_volunteer_event(volunteer_event_id))
);
