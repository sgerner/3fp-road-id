alter table public.group_membership_tiers
	add column if not exists annual_amount_cents integer;

alter table public.group_membership_tiers
	add column if not exists monthly_amount_cents integer;

update public.group_membership_tiers
set monthly_amount_cents = amount_cents
where monthly_amount_cents is null;

alter table public.group_membership_tiers
	drop constraint if exists group_membership_tiers_annual_amount_cents_check;

alter table public.group_membership_tiers
	add constraint group_membership_tiers_annual_amount_cents_check
	check (annual_amount_cents is null or annual_amount_cents >= 0);

alter table public.group_membership_tiers
	drop constraint if exists group_membership_tiers_monthly_amount_cents_check;

alter table public.group_membership_tiers
	add constraint group_membership_tiers_monthly_amount_cents_check
	check (monthly_amount_cents is null or monthly_amount_cents >= 0);

-- Weekly is no longer supported for membership billing cadence.
update public.group_membership_tiers
set
	interval_unit = case when billing_type = 'recurring' then 'month' else null end,
	interval_count = case when billing_type = 'recurring' then 1 else null end
where interval_unit = 'week';

alter table public.group_membership_tiers
	drop constraint if exists group_membership_tiers_interval_unit_check;

alter table public.group_membership_tiers
	add constraint group_membership_tiers_interval_unit_check
	check (interval_unit in ('month', 'year'));;
