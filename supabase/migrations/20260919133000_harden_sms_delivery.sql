-- Harden the SMS stack after the repository-wide relation grant lockdown.
-- Browser clients may read only the rows needed by the authenticated UI;
-- service-role server routes own all SMS writes and provider credentials.

alter table public.sms_subscriptions
  add column if not exists phone_verified_at timestamptz,
  add column if not exists verification_code_hash text,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_last_sent_at timestamptz;

alter table public.sms_subscriptions
  drop constraint if exists sms_subscriptions_verification_attempts_check;
alter table public.sms_subscriptions
  add constraint sms_subscriptions_verification_attempts_check
  check (verification_attempts between 0 and 5);

create index if not exists sms_subscriptions_phone_verified_idx
  on public.sms_subscriptions(phone_e164, phone_verified_at);

create or replace function public.claim_sms_outbox(batch_limit integer default 50)
returns setof public.sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
    -- A provider request can succeed while the worker loses its connection
    -- before persisting the response. Do not retry an ambiguous sending row;
    -- this is deliberately biased toward preventing duplicate paid messages.
    update public.sms_outbox
    set status = 'failed',
        locked_at = null,
        last_error = 'Provider result was ambiguous; automatic retry suppressed for cost safety.',
        updated_at = timezone('utc', now())
    where status = 'sending'
      and locked_at < timezone('utc', now()) - interval '10 minutes';

    return query
    with candidates as (
        select o.id
        from public.sms_outbox o
        where o.status = 'queued'
          and o.scheduled_at <= timezone('utc', now())
          and (
              exists (
                  select 1
                  from public.sms_subscriptions s
                  where s.id = o.subscription_id
                    and s.status = 'active'
              )
              or exists (
                  select 1
                  from public.sms_subscriptions s
                  where s.id = o.subscription_id
                    and s.status = 'paused'
                    and o.kind = 'system'
                    and o.metadata ->> 'purpose' = 'sms_verification'
              )
          )
        order by o.scheduled_at asc, o.created_at asc
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

revoke all on table public.sms_subscriptions from public, anon, authenticated;
grant select on table public.sms_subscriptions to authenticated;
grant all on table public.sms_subscriptions to service_role;

revoke all on table public.sms_consent_events from public, anon, authenticated;
grant all on table public.sms_consent_events to service_role;

revoke all on table public.sms_threads from public, anon, authenticated;
grant select on table public.sms_threads to authenticated;
grant all on table public.sms_threads to service_role;

revoke all on table public.sms_thread_members from public, anon, authenticated;
grant select on table public.sms_thread_members to authenticated;
grant all on table public.sms_thread_members to service_role;

revoke all on table public.sms_messages from public, anon, authenticated;
grant select on table public.sms_messages to authenticated;
grant all on table public.sms_messages to service_role;

revoke all on table public.sms_outbox from public, anon, authenticated;
grant select on table public.sms_outbox to authenticated;
grant all on table public.sms_outbox to service_role;

revoke all on table public.sms_provider_events from public, anon, authenticated;
grant all on table public.sms_provider_events to service_role;

revoke all on function public.claim_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_outbox(integer) to service_role;
