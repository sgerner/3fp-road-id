-- The primary organization's donation page and its own group tenant may use
-- the same connected account. Every other group must connect its own account.
alter table public.donation_accounts drop constraint if exists donation_accounts_stripe_account_id_key;

create unique index donation_accounts_group_stripe_account_unique
	on public.donation_accounts(stripe_account_id)
	where recipient_type = 'group' and stripe_account_id is not null;
create unique index donation_accounts_organization_stripe_account_unique
	on public.donation_accounts(stripe_account_id)
	where recipient_type = 'organization' and stripe_account_id is not null;

create or replace function public.guard_donation_stripe_tenant()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
	if new.stripe_account_id is null then return new; end if;
	perform pg_advisory_xact_lock(hashtextextended(new.stripe_account_id, 7312));
	if new.recipient_type = 'group' and exists (
		select 1 from public.donation_accounts other
		where other.id <> new.id and other.stripe_account_id = new.stripe_account_id
		and other.recipient_type = 'organization'
		and (other.id <> 'main' or not exists (
			select 1 from public.groups g where g.id = new.group_id and g.slug = '3-feet-please'
		))
	) then
		raise exception 'Each group must connect its own Stripe account.';
	end if;
	if new.recipient_type = 'organization' and exists (
		select 1 from public.donation_accounts other
		join public.groups g on g.id = other.group_id
		where other.id <> new.id and other.stripe_account_id = new.stripe_account_id
		and other.recipient_type = 'group'
		and (new.id <> 'main' or g.slug <> '3-feet-please')
	) then
		raise exception 'The organization can share Stripe only with its 3 Feet Please tenant.';
	end if;
	return new;
end;
$$;
revoke all on function public.guard_donation_stripe_tenant() from public, anon, authenticated;
create trigger donation_stripe_tenant_guard
	before insert or update of stripe_account_id, recipient_type, group_id
	on public.donation_accounts for each row execute function public.guard_donation_stripe_tenant();

create or replace function public.guard_shared_stripe_group_slug()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
	if old.slug = '3-feet-please' and new.slug is distinct from old.slug and exists (
		select 1 from public.donation_accounts d join public.donation_accounts main
			on main.id = 'main' and main.stripe_account_id = d.stripe_account_id
		where d.group_id = old.id and d.stripe_account_id is not null
	) then
		raise exception 'Disconnect the shared organization Stripe account before changing this tenant slug.';
	end if;
	return new;
end;
$$;
revoke all on function public.guard_shared_stripe_group_slug() from public, anon, authenticated;
create trigger shared_stripe_group_slug_guard before update of slug on public.groups
	for each row execute function public.guard_shared_stripe_group_slug();
