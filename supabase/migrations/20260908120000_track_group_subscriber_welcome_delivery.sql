alter table public.group_email_subscribers
	add column if not exists welcome_email_status text not null default 'pending' check (
		welcome_email_status in ('pending', 'sending', 'sent', 'failed')
	),
	add column if not exists welcome_email_error text,
	add column if not exists welcome_email_attempts integer not null default 0 check (welcome_email_attempts >= 0),
	add column if not exists welcome_email_last_attempt_at timestamptz,
	add column if not exists welcome_email_claimed_at timestamptz;

-- Rows created before delivery tracking existed were already backfilled with a
-- sent timestamp. Mark them sent so this migration cannot trigger retroactive
-- welcome messages.
update public.group_email_subscribers
set welcome_email_status = 'sent'
where welcome_email_sent_at is not null
	and welcome_email_status = 'pending';

create index if not exists group_email_subscribers_welcome_delivery_idx
	on public.group_email_subscribers (group_id, welcome_email_status, welcome_email_last_attempt_at desc)
where status = 'subscribed';
