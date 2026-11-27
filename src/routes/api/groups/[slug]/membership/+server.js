import { json, error } from '@sveltejs/kit';
import {
	applyZeroPaymentMembership,
	membershipTierRequiresPayment,
	requireMembershipUser,
	requestMembershipTierChange
} from '#lib/server/memberships';

export const POST = async ({ params, cookies, request }) => {
	const auth = await requireMembershipUser(cookies, params.slug);
	if (!auth.ok) throw error(auth.status, auth.error);
	const { serviceSupabase, group, userId } = auth;

	const body = await request.json().catch(() => null);
	const { tier_id, interval_unit, custom_amount_cents } = body ?? {};
	if (!tier_id) throw error(400, 'tier_id is required');

	// Load program
	const { data: program } = await serviceSupabase
		.from('group_membership_programs')
		.select('id,enabled,access_mode,contribution_mode')
		.eq('group_id', group.id)
		.maybeSingle();
	if (!program || !program.enabled) throw error(404, 'No membership program');

	// Load tier
	const { data: tier } = await serviceSupabase
		.from('group_membership_tiers')
		.select(
			'id,name,amount_cents,billing_type,interval_unit,interval_count,monthly_amount_cents,annual_amount_cents,stripe_price_id,allow_custom_amount,min_amount_cents'
		)
		.eq('id', tier_id)
		.eq('program_id', program.id)
		.eq('is_active', true)
		.maybeSingle();
	if (!tier) throw error(404, 'Tier not found');

	// Check for existing active/past_due/paused membership
	const { data: existing, error: membershipError } = await serviceSupabase
		.from('group_memberships')
		.select('id,tier_id,status,renews_at,interval_unit,contribution_amount_cents')
		.eq('group_id', group.id)
		.eq('user_id', userId)
		.in('status', ['active', 'past_due', 'paused'])
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (membershipError) throw error(500, 'Unable to load the current membership.');

	// Intentional: only existing active members bypass the private_request application gate.
	if (program.access_mode === 'private_request' && existing?.status !== 'active') {
		throw error(403, 'This group requires an approved application before joining.');
	}

	const hasExplicitCustomAmount =
		tier.allow_custom_amount &&
		custom_amount_cents !== undefined &&
		custom_amount_cents !== null &&
		custom_amount_cents !== '';
	const customAmount = tier.allow_custom_amount ? Number(custom_amount_cents || 0) : 0;
	const sameInterval =
		tier.billing_type === 'one_time'
			? !existing?.interval_unit
			: !interval_unit || !existing?.interval_unit || interval_unit === existing.interval_unit;
	const sameCustomAmount = !tier.allow_custom_amount
		? true
		: hasExplicitCustomAmount
			? customAmount === Number(existing?.contribution_amount_cents || 0)
			: customAmount <= 0 && Number(existing?.contribution_amount_cents || 0) === 0;
	if (existing?.tier_id === tier_id && sameInterval && sameCustomAmount) {
		return json({ success: true, action: 'no_change' });
	}

	const requiresPayment =
		membershipTierRequiresPayment(program, tier) ||
		(tier.allow_custom_amount && (customAmount > 0 || Number(tier.min_amount_cents || 0) > 0));

	if (requiresPayment) {
		const effectiveInterval =
			tier.billing_type === 'one_time'
				? null
				: interval_unit || existing?.interval_unit || tier.interval_unit || 'month';
		if (
			existing?.renews_at &&
			existing.tier_id !== tier.id &&
			tier.billing_type === 'recurring' &&
			!tier.allow_custom_amount &&
			sameInterval
		) {
			/** @type {any} */
			const result = await requestMembershipTierChange({
				cookies,
				groupSlug: params.slug,
				payload: { membership_id: existing.id, requested_tier_id: tier.id }
			});
			if (!result.ok && result.status !== 409) throw error(result.status, result.error);
			if (result.ok) return json({ success: true, action: 'scheduled_at_renewal' });
		}

		return json({
			success: false,
			requires_payment: true,
			tier_id: tier.id,
			tier_name: tier.name,
			interval_unit: effectiveInterval
		});
	}

	const freeResult = await applyZeroPaymentMembership({
		serviceSupabase,
		groupId: group.id,
		userId,
		tier,
		billingInterval:
			tier.billing_type === 'one_time' ? null : interval_unit || tier.interval_unit || null,
		source: 'online',
		status: 'active'
	});
	if (!freeResult.ok) {
		throw error(freeResult.status || 500, freeResult.error);
	}
	if (freeResult.action === 'joined') {
		return json({ success: true, membership_id: freeResult.membership.id, action: 'joined' });
	}
	return json({ success: true, action: 'changed_immediately' });
};
