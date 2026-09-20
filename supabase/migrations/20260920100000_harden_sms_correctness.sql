-- Keep SMS ownership, dispatch eligibility, and inbox access aligned with the
-- current application state.

create unique index if not exists sms_subscriptions_phone_e164_unique_idx
  on public.sms_subscriptions(phone_e164);

alter table public.sms_threads
  drop constraint if exists sms_threads_phone_e164_context_key_key;
create unique index if not exists sms_threads_open_phone_context_unique_idx
  on public.sms_threads(phone_e164, context_key)
  where status = 'open';

create or replace function public.enqueue_sms_outbox(
    p_subscription_id uuid,
    p_thread_id uuid,
    p_user_id uuid,
    p_phone_e164 text,
    p_kind public.sms_message_kind,
    p_body text,
    p_dedupe_key text,
    p_created_by_user_id uuid default null,
    p_metadata jsonb default '{}'::jsonb
)
returns public.sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    queued_message public.sms_outbox;
begin
    -- Serialize the count and insert per destination so concurrent serverless
    -- requests cannot race past the cost cap.
    perform pg_advisory_xact_lock(hashtextextended(p_phone_e164, 0));

    if p_kind not in ('opt_in', 'opt_out', 'help') and (
        select count(*)
        from public.sms_outbox o
        where o.phone_e164 = p_phone_e164
          and o.created_at >= timezone('utc', now()) - interval '24 hours'
          and o.status in ('queued', 'sending', 'sent')
    ) >= 12 then
        raise exception using errcode = 'P0001', message = 'sms_daily_limit';
    end if;

    insert into public.sms_outbox (
        subscription_id,
        thread_id,
        user_id,
        phone_e164,
        kind,
        body,
        dedupe_key,
        created_by_user_id,
        metadata
    ) values (
        p_subscription_id,
        p_thread_id,
        p_user_id,
        p_phone_e164,
        p_kind,
        p_body,
        p_dedupe_key,
        p_created_by_user_id,
        coalesce(p_metadata, '{}'::jsonb)
    )
    returning * into queued_message;

    return queued_message;
end;
$function$;

revoke all on function public.enqueue_sms_outbox(uuid, uuid, uuid, text, public.sms_message_kind, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_sms_outbox(uuid, uuid, uuid, text, public.sms_message_kind, text, text, uuid, jsonb)
  to service_role;

create or replace function public.claim_sms_outbox(batch_limit integer default 50)
returns setof public.sms_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
    -- A provider request can succeed while the worker loses its connection
    -- before persisting the response. Never retry an ambiguous provider call.
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
          and exists (
              select 1
              from public.sms_subscriptions s
              where s.id = o.subscription_id
                and s.status = 'active'
                and s.phone_e164 = o.phone_e164
                and case o.kind
                    when 'ride_reminder' then s.ride_reminders
                    when 'volunteer_reminder' then s.volunteer_reminders
                    when 'admin' then s.admin_messages
                    when 'bike_valet' then s.bike_valet_messages
                    else true
                end
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

revoke all on function public.claim_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_outbox(integer) to service_role;

drop policy if exists sms_threads_select_access on public.sms_threads;
create policy sms_threads_select_access on public.sms_threads
for select to authenticated
using (
    user_id = (select auth.uid())
    or public.is_sms_admin()
    or (
        activity_event_id is not null
        and public.can_manage_activity(activity_event_id)
    )
    or (
        volunteer_event_id is not null
        and public.can_manage_volunteer_event(volunteer_event_id)
    )
    or (
        activity_event_id is null
        and volunteer_event_id is null
        and exists (
            select 1
            from public.sms_thread_members m
            where m.thread_id = public.sms_threads.id
              and m.user_id = (select auth.uid())
        )
    )
);

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
              or (
                  t.activity_event_id is not null
                  and public.can_manage_activity(t.activity_event_id)
              )
              or (
                  t.volunteer_event_id is not null
                  and public.can_manage_volunteer_event(t.volunteer_event_id)
              )
              or (
                  t.activity_event_id is null
                  and t.volunteer_event_id is null
                  and exists (
                      select 1
                      from public.sms_thread_members m
                      where m.thread_id = t.id
                        and m.user_id = (select auth.uid())
                  )
              )
          )
    )
);
