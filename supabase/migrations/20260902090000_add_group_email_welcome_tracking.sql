alter table public.group_email_subscribers
	add column if not exists welcome_email_sent_at timestamptz;

-- Existing subscribers already completed the signup flow before welcome
-- delivery existed. Treat their original signup time as the historical
-- delivery marker so a repeat form submission does not send an unexpected
-- retroactive welcome message.
update public.group_email_subscribers
set welcome_email_sent_at = created_at
where welcome_email_sent_at is null;
