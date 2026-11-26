-- Scope club membership and application contact details to each group record
-- so riders can share club-specific names, emails, or phone numbers without
-- mutating their global profile.

alter table public.group_memberships
	add column if not exists contact_full_name text,
	add column if not exists contact_email text,
	add column if not exists contact_phone text;

alter table public.group_membership_applications
	add column if not exists contact_full_name text,
	add column if not exists contact_email text,
	add column if not exists contact_phone text;
