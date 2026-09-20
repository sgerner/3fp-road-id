-- Keep the E.164 constraints aligned with the application normalizer.
alter table public.sms_subscriptions
  drop constraint if exists sms_subscriptions_phone_e164_check;
alter table public.sms_subscriptions
  add constraint sms_subscriptions_phone_e164_check
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.sms_consent_events
  drop constraint if exists sms_consent_events_phone_e164_check;
alter table public.sms_consent_events
  add constraint sms_consent_events_phone_e164_check
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.sms_threads
  drop constraint if exists sms_threads_phone_e164_check;
alter table public.sms_threads
  add constraint sms_threads_phone_e164_check
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.sms_messages
  drop constraint if exists sms_messages_from_phone_check;
alter table public.sms_messages
  add constraint sms_messages_from_phone_check
  check (from_phone is null or from_phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.sms_messages
  drop constraint if exists sms_messages_to_phone_check;
alter table public.sms_messages
  add constraint sms_messages_to_phone_check
  check (to_phone is null or to_phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.sms_outbox
  drop constraint if exists sms_outbox_phone_e164_check;
alter table public.sms_outbox
  add constraint sms_outbox_phone_e164_check
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
