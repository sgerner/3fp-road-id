alter table public.group_membership_emails
	drop constraint if exists group_membership_emails_status_check;

alter table public.group_membership_emails
	add constraint group_membership_emails_status_check
	check (status in ('draft', 'scheduled', 'sending', 'sent', 'partially_failed', 'cancelled', 'failed'));
