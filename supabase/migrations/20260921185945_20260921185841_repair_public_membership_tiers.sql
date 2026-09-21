-- Every enabled public membership program must have a tier so members can join.
-- Some legacy donation programs were enabled without one, leaving the join flow
-- with no selectable tier and no valid membership to create.

with programs_without_active_tiers as (
	select p.id
	from public.group_membership_programs p
	where p.enabled = true
		and p.access_mode = 'public'
		and not exists (
			select 1
			from public.group_membership_tiers t
			where t.program_id = p.id
				and t.is_active = true
		)
), inserted_tiers as (
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
		p.id,
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
	from programs_without_active_tiers p
	returning id, program_id
)
update public.group_membership_programs p
set
	default_tier_id = inserted.id,
	updated_at = timezone('utc', now())
from inserted_tiers inserted
where p.id = inserted.program_id;
