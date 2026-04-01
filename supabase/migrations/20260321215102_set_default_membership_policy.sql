-- Backfill default membership policy for any program missing policy text.

update public.group_membership_programs
set
	policy_markdown = 'By joining, you agree to this membership policy.

Cancellation:
- You can cancel anytime.
- Cancellation takes effect at the end of your current billing cycle.

Refunds:
- Payments are non-refundable unless required by law.

Questions:
- Contact group organizers through the group page.',
	policy_version = case when coalesce(policy_version, 0) <= 0 then 1 else policy_version end,
	policy_updated_at = timezone('utc', now()),
	updated_at = timezone('utc', now())
where coalesce(btrim(policy_markdown), '') = '';;
