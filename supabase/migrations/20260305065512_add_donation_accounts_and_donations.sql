create table if not exists public.donation_accounts (
	id text primary key,
	recipient_type text not null check (recipient_type in ('organization', 'group')),
	group_id uuid unique references public.groups(id) on delete cascade,
	display_name text not null,
	stripe_account_id text unique,
	stripe_account_email text,
	charges_enabled boolean not null default false,
	payouts_enabled boolean not null default false,
	connected_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	check (
		(recipient_type = 'organization' and group_id is null)
		or (recipient_type = 'group' and group_id is not null)
	)
);

insert into public.donation_accounts (id, recipient_type, display_name)
values ('main', 'organization', '3 Feet Please')
on conflict (id) do nothing;

create table if not exists public.donations (
	id uuid primary key default extensions.uuid_generate_v4(),
	stripe_checkout_session_id text not null unique,
	stripe_payment_intent_id text,
	donation_account_id text not null references public.donation_accounts(id) on delete restrict,
	recipient_type text not null check (recipient_type in ('organization', 'group')),
	recipient_group_id uuid references public.groups(id) on delete set null,
	recipient_display_name text not null,
	recipient_contact_email text,
	connected_account_id text not null,
	amount_total_cents integer not null check (amount_total_cents > 0),
	currency text not null default 'usd',
	donor_name text,
	donor_email text,
	donor_message text,
	donor_requested_anonymity boolean not null default false,
	status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
	paid_at timestamptz,
	donor_receipt_sent_at timestamptz,
	recipient_notice_sent_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists donations_recipient_group_id_idx on public.donations (recipient_group_id);
create index if not exists donations_created_at_idx on public.donations (created_at desc);;
