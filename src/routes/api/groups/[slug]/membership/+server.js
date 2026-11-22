import { json, error } from '@sveltejs/kit';
import {
	membershipTierRequiresPayment,
	requireMembershipUser,
	requestMembershipTierChange
} from '#lib/server/memberships';

export const POST = async ({ params, cookies, request }) => {
	const auth = await requireMembershipUser(cookies, params.slug);
	if (!auth.ok) throw error(auth.status, auth.error);
	const { serviceSupabase, group, userId } = auth;

	const body = await request.json().catch(() => null);
	const { tier_id, interval_unit } = body ?? {};
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
			'id,name,amount_cents,billing_type,interval_unit,monthly_amount_cents,annual_amount_cents,stripe_price_id,allow_custom_amount'
		)
		.eq('id', tier_id)
		.eq('program_id', program.id)
		.eq('is_active', true)
		.maybeSingle();
	if (!tier) throw error(404, 'Tier not found');

	// Check for existing membership
	const { data: existing, error: membershipError } = await serviceSupabase
		.from('group_memberships')
		.select('id,tier_id,status,renews_at')
		.eq('group_id', group.id)
		.eq('user_id', userId)
		.maybeSingle();
	if (membershipError) throw error(500, 'Unable to load the current membership.');

	if (
		program.access_mode === 'private_request' &&
		!['active', 'past_due', 'paused'].includes(existing?.status)
	) {
		throw error(403, 'This group requires an approved application before joining.');
	}
	if (existing?.tier_id === tier_id) {
		return json({ success: true, action: 'no_change' });
	}

	if (membershipTierRequiresPayment(program, tier)) {
		if (existing?.renews_at && tier.billing_type === 'recurring' && !tier.allow_custom_amount) {
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
			interval_unit: interval_unit || tier.interval_unit
		});
	}

	if (!existing) {
		const { data: newMembership, error: insertErr } = await serviceSupabase
			.from('group_memberships')
			.insert({
				group_id: group.id,
				user_id: userId,
				tier_id: tier.id,
				status: 'active',
				source: 'online',
				interval_unit: interval_unit || tier.interval_unit || null,
				contribution_amount_cents: 0,
				started_at: new Date().toISOString()
			})
			.select('id')
			.single();

		if (insertErr) throw error(500, insertErr.message);
		return json({ success: true, membership_id: newMembership.id, action: 'joined' });
	}

	const { error: cancelError } = await serviceSupabase
		.from('group_membership_tier_change_requests')
		.update({ status: 'cancelled' })
		.eq('membership_id', existing.id)
		.eq('status', 'pending');
	if (cancelError) throw error(500, 'Unable to cancel the previous tier change.');

	const { error: updateErr } = await serviceSupabase
		.from('group_memberships')
		.update({
			tier_id: tier.id,
			contribution_amount_cents: 0,
			interval_unit: interval_unit || tier.interval_unit || null
		})
		.eq('id', existing.id);

	if (updateErr) throw error(500, updateErr.message);
	return json({ success: true, action: 'changed_immediately' });
};
