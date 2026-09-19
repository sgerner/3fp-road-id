-- Low-volume, opt-in SMS for ride reminders, volunteer shifts, and managed
-- conversations. Provider calls are always made by the server-side dispatcher;
-- authenticated clients never receive SignalWire credentials or write access to
-- the delivery queue.

create schema if not exists private;

do $$
begin
    if not exists (select 1 from pg_type where typname = 'sms_subscription_status') then
        create type public.sms_subscription_status as enum ('active', 'paused', 'unsubscribed', 'blocked');
    end if;
    if not exists (select 1 from pg_type where typname = 'sms_message_direction') then
        create type public.sms_message_direction as enum ('inbound', 'outbound');
    end if;
    if not exists (select 1 from pg_type where typname = 'sms_outbox_status') then
        create type public.sms_outbox_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled');
    end if;
    if not exists (select 1 from pg_type where typname = 'sms_message_kind') then
        create type public.sms_message_kind as enum (
            'opt_in',
            'opt_out',
            'help',
            'ride_reminder',
            'volunteer_reminder',
            'admin',
            'bike_valet',
            'system'
        );
    end if;
end $$;

insert into private.cron_secrets (name, secret)
values ('sms_dispatch', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create table if not exists public.sms_subscriptions (
    id uuid primary key default extensions.uuid_generate_v4(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    phone_e164 text not null check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
    status public.sms_subscription_status not null default 'paused',
    ride_reminders boolean not null default false,
    volunteer_reminders boolean not null default false,
    admin_messages boolean not null default false,
    bike_valet_messages boolean not null default false,
    consent_version text,
    consent_text text,
    consent_source text,
    opted_in_at timestamptz,
    opted_out_at timestamptz,
    last_inbound_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (status <> 'active' or (ride_reminders or volunteer_reminders or admin_messages or bike_valet_messages))
);

create table if not exists public.sms_consent_events (
    id uuid primary key default extensions.uuid_generate_v4(),
    subscription_id uuid references public.sms_subscriptions(id) on delete set null,
    user_id uuid references auth.users(id) on delete set null,
    phone_e164 text not null check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
    event_type text not null check (event_type in ('web_opt_in', 'web_pause', 'stop', 'start', 'blocked')),
    status public.sms_subscription_status not null,
    consent_version text,
    consent_text text,
    source text,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sms_threads (
    id uuid primary key default extensions.uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete set null,
    phone_e164 text not null check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
    context_key text not null,
    subject text not null default '3FP SMS conversation',
    activity_event_id uuid references public.activity_events(id) on delete set null,
    activity_occurrence_id uuid references public.activity_occurrences(id) on delete set null,
    volunteer_event_id uuid references public.volunteer_events(id) on delete set null,
    volunteer_signup_id uuid references public.volunteer_signups(id) on delete set null,
    bike_valet_reference text,
    status text not null default 'open' check (status in ('open', 'closed')),
    last_message_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (phone_e164, context_key)
);

create table if not exists public.sms_thread_members (
    thread_id uuid not null references public.sms_threads(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now()),
    primary key (thread_id, user_id)
);

create table if not exists public.sms_messages (
    id uuid primary key default extensions.uuid_generate_v4(),
    thread_id uuid not null references public.sms_threads(id) on delete cascade,
    direction public.sms_message_direction not null,
    kind public.sms_message_kind not null default 'system',
    from_phone text check (from_phone is null or from_phone ~ '^\\+[1-9][0-9]{7,14}$'),
    to_phone text check (to_phone is null or to_phone ~ '^\\+[1-9][0-9]{7,14}$'),
    body text not null check (char_length(body) between 1 and 480),
    provider_message_id text,
    provider_status text,
    media_count integer not null default 0 check (media_count >= 0),
    segments integer not null default 1 check (segments > 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    sent_at timestamptz,
    unique (provider_message_id)
);

create table if not exists public.sms_outbox (
    id uuid primary key default extensions.uuid_generate_v4(),
    subscription_id uuid references public.sms_subscriptions(id) on delete set null,
    thread_id uuid references public.sms_threads(id) on delete set null,
    user_id uuid references auth.users(id) on delete set null,
    phone_e164 text not null check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
    kind public.sms_message_kind not null,
    body text not null check (char_length(body) between 1 and 480),
    dedupe_key text not null unique,
    scheduled_at timestamptz not null default timezone('utc', now()),
    status public.sms_outbox_status not null default 'queued',
    attempts integer not null default 0 check (attempts >= 0),
    locked_at timestamptz,
    sent_at timestamptz,
    provider_message_id text,
    provider_status text,
    last_error text,
    created_by_user_id uuid references auth.users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sms_provider_events (
    id uuid primary key default extensions.uuid_generate_v4(),
    provider text not null default 'signalwire',
    event_type text not null,
    external_event_id text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    unique (provider, external_event_id)
);

create index if not exists sms_subscriptions_status_phone_idx
    on public.sms_subscriptions(status, phone_e164);
create index if not exists sms_threads_user_last_message_idx
    on public.sms_threads(user_id, last_message_at desc);
create index if not exists sms_threads_phone_last_message_idx
    on public.sms_threads(phone_e164, last_message_at desc);
create index if not exists sms_thread_members_user_idx
    on public.sms_thread_members(user_id, thread_id);
create index if not exists sms_messages_thread_created_idx
    on public.sms_messages(thread_id, created_at desc);
create index if not exists sms_outbox_due_idx
    on public.sms_outbox(status, scheduled_at, created_at);
create index if not exists sms_outbox_phone_created_idx
    on public.sms_outbox(phone_e164, created_at desc);

create or replace function public.is_sms_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.profiles p
        where p.user_id = (select auth.uid())
          and p.admin = true
    );
$$;

create or replace function public.claim_sms_outbox(batch_limit integer default 50)
returns setof public.sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
    return query
    with candidates as (
        select id
        from public.sms_outbox
        where (
            status = 'queued'
            and scheduled_at <= timezone('utc', now())
        ) or (
            status = 'sending'
            and locked_at < timezone('utc', now()) - interval '10 minutes'
            and attempts < 3
        )
        order by scheduled_at asc, created_at asc
        for update skip locked
        limit greatest(1, least(coalesce(batch_limit, 50), 100))
    )
    update public.sms_outbox o
    set status = 'sending',
        attempts = o.attempts + 1,
        locked_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from candidates c
    where o.id = c.id
    returning o.*;
end;
$function$;

revoke all on function public.is_sms_admin() from public, anon, authenticated;
grant execute on function public.is_sms_admin() to authenticated, service_role;
revoke all on function public.claim_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_outbox(integer) to service_role;

alter table public.sms_subscriptions enable row level security;
alter table public.sms_consent_events enable row level security;
alter table public.sms_threads enable row level security;
alter table public.sms_thread_members enable row level security;
alter table public.sms_messages enable row level security;
alter table public.sms_outbox enable row level security;
alter table public.sms_provider_events enable row level security;

drop policy if exists sms_subscriptions_select_own on public.sms_subscriptions;
create policy sms_subscriptions_select_own on public.sms_subscriptions
for select to authenticated
using (user_id = (select auth.uid()) or public.is_sms_admin());

drop policy if exists sms_subscriptions_insert_own on public.sms_subscriptions;
create policy sms_subscriptions_insert_own on public.sms_subscriptions
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists sms_subscriptions_update_own on public.sms_subscriptions;
create policy sms_subscriptions_update_own on public.sms_subscriptions
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists sms_threads_select_access on public.sms_threads;
create policy sms_threads_select_access on public.sms_threads
for select to authenticated
using (
    user_id = (select auth.uid())
    or public.is_sms_admin()
    or exists (
        select 1
        from public.sms_thread_members m
        where m.thread_id = public.sms_threads.id
          and m.user_id = (select auth.uid())
    )
);

drop policy if exists sms_thread_members_select_access on public.sms_thread_members;
create policy sms_thread_members_select_access on public.sms_thread_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_sms_admin());

drop policy if exists sms_messages_select_access on public.sms_messages;
create policy sms_messages_select_access on public.sms_messages
for select to authenticated
using (
    exists (
        select 1
        from public.sms_threads t
        where t.id = public.sms_messages.thread_id
          and (
              t.user_id = (select auth.uid())
              or public.is_sms_admin()
              or exists (
                  select 1
                  from public.sms_thread_members m
                  where m.thread_id = t.id
                    and m.user_id = (select auth.uid())
              )
          )
    )
);

drop policy if exists sms_outbox_select_access on public.sms_outbox;
create policy sms_outbox_select_access on public.sms_outbox
for select to authenticated
using (created_by_user_id = (select auth.uid()) or public.is_sms_admin());

revoke all on table public.sms_consent_events from public, anon, authenticated;
revoke all on table public.sms_thread_members from public, anon, authenticated;
revoke all on table public.sms_messages from public, anon, authenticated;
revoke all on table public.sms_outbox from public, anon, authenticated;
revoke all on table public.sms_provider_events from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname in ('sms-dispatch-1m', 'sms-reminders-15m');

select cron.schedule(
    'sms-dispatch-1m',
    '* * * * *',
    $$
        select net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/sms-dispatch',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', (select secret from private.cron_secrets where name = 'sms_dispatch')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 120000
        )
    $$
);

select cron.schedule(
    'sms-reminders-15m',
    '*/15 * * * *',
    $$
        select net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/sms-reminders',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', (select secret from private.cron_secrets where name = 'sms_dispatch')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 120000
        )
    $$
);;
