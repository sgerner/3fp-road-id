import { json, error } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export const POST = async ({ params, cookies, request }) => {
	const { user: sessionUser } = resolveSession(cookies);
	if (!sessionUser?.id) throw error(401, 'Authentication required');

	const slug = params.slug;
	const body = await request.json().catch(() => ({}));
	const { tier_id, interval_unit } = body;

	if (!tier_id) throw error(400, 'tier_id is required');

	const serviceSupabase = createServiceSupabaseClient();

	// Load group
	const { data: group } = await serviceSupabase
		.from('groups')
		.select('id,slug')
		.eq('slug', slug)
		.maybeSingle();
	if (!group) throw error(404, 'Group not found');

	// Load program
	const { data: program } = await serviceSupabase
		.from('group_membership_programs')
		.select('id,enabled')
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
	const { data: existing } = await serviceSupabase
		.from('group_memberships')
		.select('id,tier_id,status,renews_at')
		.eq('group_id', group.id)
		.eq('user_id', sessionUser.id)
		.maybeSingle();

	// Determine if this tier is free
	const isFree = tier.amount_cents === 0 && !tier.monthly_amount_cents && !tier.annual_amount_cents;

	if (!existing) {
		// New membership
		if (isFree) {
			// Create membership immediately
			const { data: newMembership, error: insertErr } = await serviceSupabase
				.from('group_memberships')
				.insert({
					group_id: group.id,
					user_id: sessionUser.id,
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
		} else {
			// Paid tier — return a checkout redirect signal
			// The client will redirect to the Stripe checkout flow
			return json({
				success: false,
				requires_payment: true,
				tier_id: tier.id,
				tier_name: tier.name,
				interval_unit: interval_unit || tier.interval_unit
			});
		}
	} else {
		// Existing membership — schedule tier change
		if (existing.tier_id === tier_id) {
			return json({ success: true, action: 'no_change' });
		}

		// Clear any existing pending change requests
		await serviceSupabase
			.from('group_membership_tier_change_requests')
			.update({ status: 'cancelled' })
			.eq('membership_id', existing.id)
			.eq('status', 'pending');

		if (isFree || !existing.renews_at) {
			// Apply free tier change immediately or if no renewal date
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
		} else {
			// Schedule at renewal
			const { error: changeErr } = await serviceSupabase
				.from('group_membership_tier_change_requests')
				.insert({
					membership_id: existing.id,
					requested_tier_id: tier.id,
					effective_at_cycle_end: true,
					status: 'pending',
					requested_by: sessionUser.id
				});

			if (changeErr) throw error(500, changeErr.message);
			return json({ success: true, action: 'scheduled_at_renewal' });
		}
	}
};
