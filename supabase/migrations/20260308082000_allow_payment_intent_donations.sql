alter table public.donations
	alter column stripe_checkout_session_id drop not null;

create unique index if not exists donations_stripe_payment_intent_id_unique
	on public.donations (stripe_payment_intent_id)
	where stripe_payment_intent_id is not null;
