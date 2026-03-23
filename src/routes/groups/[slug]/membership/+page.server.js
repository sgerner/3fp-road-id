import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { error } from '@sveltejs/kit';

export const load = async ({ params, cookies }) => {
	const slug = params.slug;
	const { user: sessionUser, accessToken } = resolveSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;

	const serviceSupabase = createServiceSupabaseClient();
	const requestSupabase = sessionUserId ? createRequestSupabaseClient(accessToken) : null;

	// 1. Load group
	const { data: group, error: groupErr } = await serviceSupabase
		.from('groups')
		.select('id,name,slug,logo_url,cover_photo_url,city,state_region,country,tagline')
		.eq('slug', slug)
		.maybeSingle();

	if (groupErr) throw error(500, groupErr.message);
	if (!group) throw error(404, 'Group not found');

	// 2. Load membership program
	const { data: program, error: programErr } = await serviceSupabase
		.from('group_membership_programs')
		.select('id,enabled,access_mode,cta_label,contribution_mode,default_tier_id,policy_markdown')
		.eq('group_id', group.id)
		.maybeSingle();

	if (programErr) throw error(500, programErr.message);

	// No program means no membership page
	if (!program || !program.enabled) {
		return {
			group,
			program: null,
			tiers: [],
			membership: null,
			billing: null,
			pending_tier_change: null,
			user: sessionUser ?? null
		};
	}

	// 3. Load active tiers
	const { data: tiers, error: tiersErr } = await serviceSupabase
		.from('group_membership_tiers')
		.select(
			'id,name,description,amount_cents,currency,billing_type,interval_unit,interval_count,is_default,allow_custom_amount,min_amount_cents,stripe_price_id,annual_amount_cents,monthly_amount_cents,sort_order'
		)
		.eq('program_id', program.id)
		.eq('is_active', true)
		.order('sort_order', { ascending: true });

	if (tiersErr) throw error(500, tiersErr.message);

	// 4. If logged in, load user's membership
	let membership = null;
	let billing = null;
	let pendingTierChange = null;

	if (sessionUserId) {
		const { data: membershipRow } = await serviceSupabase
			.from('group_memberships')
			.select(
				'id,user_id,tier_id,status,source,started_at,renews_at,ends_at,cancel_at_period_end,interval_unit,contribution_amount_cents'
			)
			.eq('group_id', group.id)
			.eq('user_id', sessionUserId)
			.maybeSingle();

		membership = membershipRow ?? null;

		if (membership) {
			// Load billing info
			const { data: billingRow } = await serviceSupabase
				.from('group_membership_billing')
				.select('stripe_subscription_id,stripe_price_id,last_payment_status,next_billing_at')
				.eq('membership_id', membership.id)
				.maybeSingle();

			billing = billingRow ?? null;

			// Load pending tier change
			const { data: changeRow } = await serviceSupabase
				.from('group_membership_tier_change_requests')
				.select('id,requested_tier_id,effective_at_cycle_end,status,created_at')
				.eq('membership_id', membership.id)
				.eq('status', 'pending')
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			pendingTierChange = changeRow ?? null;
		}
	}

	return {
		group,
		program,
		tiers: tiers ?? [],
		membership,
		billing,
		pending_tier_change: pendingTierChange,
		user: sessionUser ?? null
	};
};
