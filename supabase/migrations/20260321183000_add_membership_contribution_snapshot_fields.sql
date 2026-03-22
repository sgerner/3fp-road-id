alter table public.group_memberships
	add column if not exists interval_unit text;

alter table public.group_memberships
	drop constraint if exists group_memberships_interval_unit_check;

alter table public.group_memberships
	add constraint group_memberships_interval_unit_check
	check (interval_unit is null or interval_unit in ('month', 'year'));

alter table public.group_memberships
	add column if not exists contribution_amount_cents integer not null default 0;

alter table public.group_memberships
	drop constraint if exists group_memberships_contribution_amount_cents_check;

alter table public.group_memberships
	add constraint group_memberships_contribution_amount_cents_check
	check (contribution_amount_cents >= 0);

update public.group_memberships as m
set
	interval_unit = case
		when t.billing_type = 'recurring' then coalesce(m.interval_unit, t.interval_unit, 'month')
		else null
	end,
	contribution_amount_cents = case
		when m.contribution_amount_cents > 0 then m.contribution_amount_cents
		when coalesce(m.interval_unit, t.interval_unit, 'month') = 'year' then coalesce(t.annual_amount_cents, 0)
		else coalesce(t.monthly_amount_cents, t.amount_cents, 0)
	end
from public.group_membership_tiers as t
where m.tier_id = t.id;
