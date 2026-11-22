export function buildProgramAndTiersPath(groupSlug) {
	const slug = String(groupSlug ?? '').trim();
	return slug ? `/groups/${encodeURIComponent(slug)}/manage/membership?view=program` : '';
}

export function evaluateStripeBillingGuard({
	program = null,
	tiers = [],
	memberships = [],
	billings = [],
	groupSlug = ''
} = {}) {
	const activeTiers = (Array.isArray(tiers) ? tiers : []).filter(
		(tier) => tier && tier.is_active !== false
	);
	const paidProgramActive =
		Boolean(program && program.enabled !== false) &&
		['paid', 'required_fee'].includes(String(program?.contribution_mode || '').toLowerCase());

	const activePaidTiers = activeTiers.filter((tier) => {
		const monthly = Number(tier?.monthly_amount_cents ?? 0);
		const annual = Number(tier?.annual_amount_cents ?? 0);
		const baseAmount = Number(tier?.amount_cents ?? 0);
		return monthly > 0 || annual > 0 || baseAmount > 0 || paidProgramActive;
	});

	const activeMembershipRows = (Array.isArray(memberships) ? memberships : []).filter((row) =>
		['active', 'past_due', 'paused'].includes(String(row?.status || ''))
	);
	const activeMembershipIds = new Set(activeMembershipRows.map((row) => row?.id).filter(Boolean));
	const pastDueCount = activeMembershipRows.filter((row) => row?.status === 'past_due').length;

	const subscriptionMembershipIds = new Set(
		(Array.isArray(billings) ? billings : [])
			.filter(
				(billing) =>
					billing?.membership_id &&
					activeMembershipIds.has(billing.membership_id) &&
					String(billing?.stripe_subscription_id || '').trim().length > 0
			)
			.map((billing) => billing.membership_id)
	);

	const activeTierCount = activeTiers.length;
	const activePaidTierCount = activePaidTiers.length;
	const activeSubscriptionCount = subscriptionMembershipIds.size;
	const canDisconnect = activePaidTierCount === 0 && activeSubscriptionCount === 0;
	const manageUrl = buildProgramAndTiersPath(groupSlug);

	let blockReason = '';
	if (!canDisconnect) {
		const reasons = [];
		if (activePaidTierCount > 0) {
			reasons.push(
				`${activePaidTierCount} active paid tier${activePaidTierCount === 1 ? '' : 's'}`
			);
		}
		if (activeSubscriptionCount > 0) {
			reasons.push(
				`${activeSubscriptionCount} active member subscription${activeSubscriptionCount === 1 ? '' : 's'}`
			);
		}
		blockReason = `Cannot disconnect Stripe while ${reasons.join(' and ')} exist. Update or archive paid tiers and cancel active subscriptions in Program and Tiers first.`;
	}

	return {
		active_tier_count: activeTierCount,
		active_paid_tier_count: activePaidTierCount,
		active_subscription_count: activeSubscriptionCount,
		past_due_count: pastDueCount,
		can_disconnect: canDisconnect,
		block_reason: blockReason,
		manage_url: manageUrl
	};
}

export async function getGroupStripeBillingGuard(serviceSupabase, groupId, groupSlug = '') {
	if (!serviceSupabase || !groupId) {
		return evaluateStripeBillingGuard({ groupSlug });
	}

	const [programRes, membershipsRes] = await Promise.all([
		serviceSupabase
			.from('group_membership_programs')
			.select('id, enabled, contribution_mode')
			.eq('group_id', groupId)
			.maybeSingle(),
		serviceSupabase
			.from('group_memberships')
			.select('id, status')
			.eq('group_id', groupId)
			.in('status', ['active', 'past_due', 'paused'])
	]);
	if (programRes.error) throw new Error(programRes.error.message);
	if (membershipsRes.error) throw new Error(membershipsRes.error.message);

	const program = programRes.data || null;
	const memberships = membershipsRes.data || [];
	const membershipIds = memberships.map((row) => row?.id).filter(Boolean);

	const [tiersRes, billingsRes] = await Promise.all([
		program?.id
			? serviceSupabase
					.from('group_membership_tiers')
					.select(
						'id, is_active, amount_cents, monthly_amount_cents, annual_amount_cents, allow_custom_amount'
					)
					.eq('program_id', program.id)
			: Promise.resolve({ data: [], error: null }),
		membershipIds.length
			? serviceSupabase
					.from('group_membership_billing')
					.select('membership_id, stripe_subscription_id')
					.in('membership_id', membershipIds)
			: Promise.resolve({ data: [], error: null })
	]);
	if (tiersRes.error) throw new Error(tiersRes.error.message);
	if (billingsRes.error) throw new Error(billingsRes.error.message);

	return evaluateStripeBillingGuard({
		program,
		tiers: tiersRes.data || [],
		memberships,
		billings: billingsRes.data || [],
		groupSlug
	});
}

export async function loadGroupStripeConnection(auth) {
	const { data: donationAccount, error } = await auth.serviceSupabase
		.from('donation_accounts')
		.select('stripe_account_id, charges_enabled')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return {
		connected: Boolean(donationAccount?.stripe_account_id),
		charges_enabled: Boolean(donationAccount?.charges_enabled),
		stripe_account_id: donationAccount?.stripe_account_id || null
	};
}
