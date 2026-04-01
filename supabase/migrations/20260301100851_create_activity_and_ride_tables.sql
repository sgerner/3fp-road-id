create schema if not exists private;

create table if not exists private.app_settings (
    key text primary key,
    value text not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.cron_secrets (
    name text primary key,
    secret text not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

insert into private.app_settings (key, value)
values ('site_origin', 'https://3fp.org')
on conflict (key) do nothing;

insert into private.cron_secrets (name, secret)
values ('ride_emails', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

revoke all on schema private from public;
revoke all on all tables in schema private from public, anon, authenticated;

create table if not exists public.activity_events (
    id uuid primary key default extensions.uuid_generate_v4(),
    activity_type text not null check (activity_type in ('ride')),
    host_user_id uuid not null references auth.users(id) on delete cascade,
    host_group_id uuid null references public.groups(id) on delete set null,
    created_by_user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    published_at timestamptz null,
    title text not null,
    slug text not null unique,
    summary text null,
    description text null,
    timezone text not null default 'UTC',
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    next_occurrence_start timestamptz null,
    next_occurrence_end timestamptz null,
    status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'archived')),
    start_location_name text not null,
    start_location_address text null,
    start_latitude double precision null,
    start_longitude double precision null,
    contact_email text null,
    contact_phone text null
);

create table if not exists public.activity_hosts (
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    primary key (activity_event_id, user_id)
);

create table if not exists public.activity_occurrences (
    id uuid primary key default extensions.uuid_generate_v4(),
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
    is_generated boolean not null default false,
    title_override text null,
    start_location_name text null,
    start_location_address text null,
    start_latitude double precision null,
    start_longitude double precision null,
    end_location_name text null,
    end_location_address text null,
    end_latitude double precision null,
    end_longitude double precision null,
    unique (activity_event_id, starts_at)
);

create table if not exists public.activity_recurrence_rules (
    activity_event_id uuid primary key references public.activity_events(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    frequency text not null check (frequency in ('weekly', 'monthly')),
    interval_count integer not null default 1 check (interval_count > 0),
    by_weekdays smallint[] not null default '{}'::smallint[],
    by_set_positions smallint[] null,
    starts_on date not null,
    until_on date null
);

create table if not exists public.activity_recurrence_exclusions (
    id uuid primary key default extensions.uuid_generate_v4(),
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    created_by_user_id uuid null references auth.users(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    starts_on date not null,
    ends_on date not null,
    note text null,
    check (ends_on >= starts_on)
);

create table if not exists public.activity_rsvps (
    id uuid primary key default extensions.uuid_generate_v4(),
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    activity_occurrence_id uuid not null references public.activity_occurrences(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    cancelled_at timestamptz null,
    status text not null default 'going' check (status in ('going', 'cancelled')),
    participant_name text not null,
    participant_email text not null,
    participant_phone text null,
    unique (activity_occurrence_id, user_id)
);

create table if not exists public.activity_email_templates (
    id uuid primary key default extensions.uuid_generate_v4(),
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    template_type text not null default 'reminder' check (template_type in ('reminder', 'custom')),
    name text not null,
    send_offset_minutes integer null,
    subject text not null,
    body text not null,
    is_active boolean not null default true,
    last_sent_at timestamptz null
);

create table if not exists public.activity_email_deliveries (
    id uuid primary key default extensions.uuid_generate_v4(),
    template_id uuid not null references public.activity_email_templates(id) on delete cascade,
    activity_occurrence_id uuid not null references public.activity_occurrences(id) on delete cascade,
    activity_rsvp_id uuid not null references public.activity_rsvps(id) on delete cascade,
    recipient_email text not null,
    sent_at timestamptz not null default timezone('utc', now()),
    unique (template_id, activity_occurrence_id, activity_rsvp_id)
);

create table if not exists public.ride_details (
    activity_event_id uuid primary key references public.activity_events(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    participant_visibility text not null default 'public' check (participant_visibility in ('public', 'private')),
    end_location_name text null,
    end_location_address text null,
    end_latitude double precision null,
    end_longitude double precision null,
    estimated_distance_miles numeric(7,2) null,
    estimated_duration_minutes integer null,
    elevation_gain_feet integer null,
    pace_notes text null,
    is_no_drop boolean not null default true,
    surface_types text[] not null default '{}'::text[],
    bike_suitability text[] not null default '{}'::text[],
    accessibility_notes text null,
    waiver_required boolean not null default false
);

create table if not exists public.ride_difficulty_levels (
    id integer generated by default as identity primary key,
    name text not null unique,
    slug text not null unique,
    sort_order integer not null default 0
);

create table if not exists public.activity_x_ride_difficulty_levels (
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    difficulty_level_id integer not null references public.ride_difficulty_levels(id) on delete cascade,
    primary key (activity_event_id, difficulty_level_id)
);

create table if not exists public.activity_x_riding_disciplines (
    activity_event_id uuid not null references public.activity_events(id) on delete cascade,
    riding_discipline_id integer not null references public.riding_disciplines(id) on delete cascade,
    primary key (activity_event_id, riding_discipline_id)
);

insert into public.ride_difficulty_levels (name, slug, sort_order)
values
    ('Beginner', 'beginner', 1),
    ('Casual', 'casual', 2),
    ('Challenging', 'challenging', 3),
    ('Expert', 'expert', 4),
    ('Uncategorized', 'uncategorized', 5)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

create index if not exists activity_events_type_status_next_occurrence_idx
    on public.activity_events (activity_type, status, next_occurrence_start);
create index if not exists activity_events_host_user_idx
    on public.activity_events (host_user_id, created_at desc);
create index if not exists activity_events_host_group_idx
    on public.activity_events (host_group_id, created_at desc);
create index if not exists activity_occurrences_event_start_idx
    on public.activity_occurrences (activity_event_id, starts_at);
create index if not exists activity_occurrences_status_start_idx
    on public.activity_occurrences (status, starts_at);
create index if not exists activity_rsvps_event_occurrence_status_idx
    on public.activity_rsvps (activity_event_id, activity_occurrence_id, status);
create index if not exists activity_rsvps_user_status_idx
    on public.activity_rsvps (user_id, status);
create index if not exists activity_email_templates_event_active_idx
    on public.activity_email_templates (activity_event_id, is_active, template_type);
create index if not exists activity_recurrence_exclusions_event_idx
    on public.activity_recurrence_exclusions (activity_event_id, starts_on, ends_on);

create or replace function public.can_manage_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.group_members gm
        where gm.group_id = target_group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner', 'admin')
    );
$$;

create or replace function public.can_manage_activity(target_activity_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.activity_events ae
        where ae.id = target_activity_event_id
          and (
              ae.host_user_id = auth.uid()
              or ae.created_by_user_id = auth.uid()
              or exists (
                  select 1
                  from public.activity_hosts ah
                  where ah.activity_event_id = ae.id
                    and ah.user_id = auth.uid()
              )
              or (
                  ae.host_group_id is not null
                  and exists (
                      select 1
                      from public.group_members gm
                      where gm.group_id = ae.host_group_id
                        and gm.user_id = auth.uid()
                        and gm.role in ('owner', 'admin')
                  )
              )
          )
    );
$$;

create or replace function public.activity_is_published(target_activity_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.activity_events ae
        where ae.id = target_activity_event_id
          and ae.status = 'published'
    );
$$;

create or replace function public.can_view_activity_participants(target_activity_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select (
        public.can_manage_activity(target_activity_event_id)
        or exists (
            select 1
            from public.ride_details rd
            where rd.activity_event_id = target_activity_event_id
              and rd.participant_visibility = 'public'
              and public.activity_is_published(target_activity_event_id)
        )
    );
$$;

create or replace function public.verify_internal_cron_secret(secret_name text, provided_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
    select exists (
        select 1
        from private.cron_secrets cs
        where cs.name = secret_name
          and cs.secret = provided_secret
    );
$$;

alter table public.activity_events enable row level security;
alter table public.activity_hosts enable row level security;
alter table public.activity_occurrences enable row level security;
alter table public.activity_recurrence_rules enable row level security;
alter table public.activity_recurrence_exclusions enable row level security;
alter table public.activity_rsvps enable row level security;
alter table public.activity_email_templates enable row level security;
alter table public.activity_email_deliveries enable row level security;
alter table public.ride_details enable row level security;
alter table public.ride_difficulty_levels enable row level security;
alter table public.activity_x_ride_difficulty_levels enable row level security;
alter table public.activity_x_riding_disciplines enable row level security;

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
for select using (
    public.activity_is_published(id)
    or public.can_manage_activity(id)
);

drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events
for insert with check (
    auth.uid() is not null
    and host_user_id = auth.uid()
    and created_by_user_id = auth.uid()
    and (host_group_id is null or public.can_manage_group(host_group_id))
);

drop policy if exists activity_events_update on public.activity_events;
create policy activity_events_update on public.activity_events
for update using (public.can_manage_activity(id))
with check (public.can_manage_activity(id));

drop policy if exists activity_events_delete on public.activity_events;
create policy activity_events_delete on public.activity_events
for delete using (public.can_manage_activity(id));

drop policy if exists activity_hosts_select on public.activity_hosts;
create policy activity_hosts_select on public.activity_hosts
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_hosts_manage on public.activity_hosts;
create policy activity_hosts_manage on public.activity_hosts
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_occurrences_select on public.activity_occurrences;
create policy activity_occurrences_select on public.activity_occurrences
for select using (
    (public.activity_is_published(activity_event_id) and status = 'scheduled')
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_occurrences_manage on public.activity_occurrences;
create policy activity_occurrences_manage on public.activity_occurrences
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_recurrence_rules_select on public.activity_recurrence_rules;
create policy activity_recurrence_rules_select on public.activity_recurrence_rules
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_recurrence_rules_manage on public.activity_recurrence_rules;
create policy activity_recurrence_rules_manage on public.activity_recurrence_rules
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_recurrence_exclusions_select on public.activity_recurrence_exclusions;
create policy activity_recurrence_exclusions_select on public.activity_recurrence_exclusions
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_recurrence_exclusions_manage on public.activity_recurrence_exclusions;
create policy activity_recurrence_exclusions_manage on public.activity_recurrence_exclusions
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists ride_details_select on public.ride_details;
create policy ride_details_select on public.ride_details
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists ride_details_manage on public.ride_details;
create policy ride_details_manage on public.ride_details
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists ride_difficulty_levels_select on public.ride_difficulty_levels;
create policy ride_difficulty_levels_select on public.ride_difficulty_levels
for select using (true);

drop policy if exists activity_x_ride_difficulty_levels_select on public.activity_x_ride_difficulty_levels;
create policy activity_x_ride_difficulty_levels_select on public.activity_x_ride_difficulty_levels
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_x_ride_difficulty_levels_manage on public.activity_x_ride_difficulty_levels;
create policy activity_x_ride_difficulty_levels_manage on public.activity_x_ride_difficulty_levels
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_x_riding_disciplines_select on public.activity_x_riding_disciplines;
create policy activity_x_riding_disciplines_select on public.activity_x_riding_disciplines
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_x_riding_disciplines_manage on public.activity_x_riding_disciplines;
create policy activity_x_riding_disciplines_manage on public.activity_x_riding_disciplines
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_rsvps_select on public.activity_rsvps;
create policy activity_rsvps_select on public.activity_rsvps
for select using (
    auth.uid() = user_id
    or public.can_view_activity_participants(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_rsvps_insert on public.activity_rsvps;
create policy activity_rsvps_insert on public.activity_rsvps
for insert with check (
    auth.uid() = user_id
    and exists (
        select 1
        from public.activity_occurrences ao
        join public.activity_events ae on ae.id = ao.activity_event_id
        where ao.id = activity_occurrence_id
          and ao.activity_event_id = activity_event_id
          and ao.status = 'scheduled'
          and ae.status = 'published'
    )
);

drop policy if exists activity_rsvps_update on public.activity_rsvps;
create policy activity_rsvps_update on public.activity_rsvps
for update using (
    auth.uid() = user_id
    or public.can_manage_activity(activity_event_id)
) with check (
    auth.uid() = user_id
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_rsvps_delete on public.activity_rsvps;
create policy activity_rsvps_delete on public.activity_rsvps
for delete using (
    auth.uid() = user_id
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_email_templates_select on public.activity_email_templates;
create policy activity_email_templates_select on public.activity_email_templates
for select using (
    public.activity_is_published(activity_event_id)
    or public.can_manage_activity(activity_event_id)
);

drop policy if exists activity_email_templates_manage on public.activity_email_templates;
create policy activity_email_templates_manage on public.activity_email_templates
for all using (public.can_manage_activity(activity_event_id))
with check (public.can_manage_activity(activity_event_id));

drop policy if exists activity_email_deliveries_select on public.activity_email_deliveries;
create policy activity_email_deliveries_select on public.activity_email_deliveries
for select using (
    exists (
        select 1
        from public.activity_email_templates aet
        where aet.id = template_id
          and public.can_manage_activity(aet.activity_event_id)
    )
);

revoke all on function public.verify_internal_cron_secret(text, text) from public, anon, authenticated;
grant execute on function public.verify_internal_cron_secret(text, text) to service_role;

do $$
declare
    existing_job_id bigint;
begin
    select jobid into existing_job_id
    from cron.job
    where jobname = 'ride-email-reminders'
    limit 1;

    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
        'ride-email-reminders',
        '*/10 * * * *',
        $job$
            select net.http_post(
                url := (select value from private.app_settings where key = 'site_origin') || '/api/cron/ride-emails',
                headers := jsonb_build_object(
                    'content-type', 'application/json',
                    'x-cron-secret', (select secret from private.cron_secrets where name = 'ride_emails')
                ),
                body := '{}'::jsonb
            );
        $job$
    );
end $$;;
