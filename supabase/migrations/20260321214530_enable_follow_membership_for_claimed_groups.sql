-- Ensure groups with at least one owner/admin membership have starter membership enabled.
-- Sets CTA to Follow and creates a free default tier when a program has no active tiers.

with claimed_groups as (
	select distinct gm.group_id
	from public.group_members gm
	where gm.role::text in ('owner', 'admin')
)
update public.group_membership_programs p
set
	enabled = true,
	access_mode = 'public',
	cta_label = 'Follow',
	contribution_mode = 'none',
	updated_at = timezone('utc', now())
from claimed_groups cg
where p.group_id = cg.group_id;

with claimed_groups as (
	select distinct gm.group_id
	from public.group_members gm
	where gm.role::text in ('owner', 'admin')
)
insert into public.group_membership_programs (
	group_id,
	enabled,
	access_mode,
	cta_label,
	contribution_mode,
	created_at,
	updated_at
)
select
	cg.group_id,
	true,
	'public',
	'Follow',
	'none',
	timezone('utc', now()),
	timezone('utc', now())
from claimed_groups cg
where not exists (
	select 1 from public.group_membership_programs p where p.group_id = cg.group_id
);

with claimed_programs as (
	select p.id as program_id
	from public.group_membership_programs p
	where exists (
		select 1
		from public.group_members gm
		where gm.group_id = p.group_id
			and gm.role::text in ('owner', 'admin')
	)
),
programs_without_tiers as (
	select cp.program_id
	from claimed_programs cp
	where not exists (
		select 1
		from public.group_membership_tiers t
		where t.program_id = cp.program_id
			and t.is_active = true
	)
),
inserted_tiers as (
	insert into public.group_membership_tiers (
		program_id,
		name,
		description,
		amount_cents,
		monthly_amount_cents,
		annual_amount_cents,
		currency,
		billing_type,
		interval_unit,
		interval_count,
		is_default,
		is_active,
		sort_order,
		allow_custom_amount,
		min_amount_cents,
		created_at,
		updated_at
	)
	select
		pwt.program_id,
		'Follower',
		'Free follow membership',
		0,
		0,
		null,
		'usd',
		'one_time',
		null,
		null,
		true,
		true,
		0,
		false,
		null,
		timezone('utc', now()),
		timezone('utc', now())
	from programs_without_tiers pwt
	returning id, program_id
),
existing_default_tiers as (
	select distinct on (t.program_id)
		t.program_id,
		t.id
	from public.group_membership_tiers t
	join claimed_programs cp on cp.program_id = t.program_id
	where t.is_default = true
	order by t.program_id, t.sort_order asc, t.created_at asc
),
resolved_default_tiers as (
	select program_id, id from inserted_tiers
	union all
	select edt.program_id, edt.id
	from existing_default_tiers edt
	where not exists (select 1 from inserted_tiers it where it.program_id = edt.program_id)
)
update public.group_membership_programs p
set
	default_tier_id = rdt.id,
	updated_at = timezone('utc', now())
from resolved_default_tiers rdt
where p.id = rdt.program_id;;
