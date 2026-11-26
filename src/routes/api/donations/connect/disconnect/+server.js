import { json } from '@sveltejs/kit';
import { MAIN_ORG_DONATION_ACCOUNT_ID } from '#lib/donations/constants';
import {
	buildGroupDonationAccountId,
	checkGroupStripeDisconnectAllowed,
	clearDonationAccountConnection,
	requireGroupDonationManager,
	requireMainDonationManager
} from '#lib/server/donations';

export const POST = async ({ request, cookies }) => {
	/** @type {Record<string, any>} */
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	const recipientType = (payload?.recipient || 'main').toString().toLowerCase();
	const groupSlug = (payload?.group || '').toString().trim();

	let accountId = MAIN_ORG_DONATION_ACCOUNT_ID;
	if (recipientType === 'group') {
		const auth = await requireGroupDonationManager(cookies, groupSlug);
		if (!auth?.ok || !('group' in auth)) {
			return json({ error: auth?.error || 'Not authorized.' }, { status: auth?.status || 403 });
		}
		try {
			const guard = await checkGroupStripeDisconnectAllowed(auth.group);
			if (!guard.can_disconnect) {
				return json(
					{
						error:
							guard.block_reason ||
							'Cannot disconnect Stripe while active paid tiers or subscriptions exist.',
						code: 'active_membership_billing',
						active_paid_tier_count: guard.active_paid_tier_count,
						active_subscription_count: guard.active_subscription_count,
						manage_url: guard.manage_url
					},
					{ status: 409 }
				);
			}
		} catch (guardError) {
			return json(
				{
					error:
						guardError instanceof Error
							? guardError.message
							: 'Unable to verify membership billing state.'
				},
				{ status: 500 }
			);
		}
		accountId = buildGroupDonationAccountId(auth.group.id);
	} else {
		const auth = await requireMainDonationManager(cookies);
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Not authorized.' }, { status: auth?.status || 403 });
		}
	}

	try {
		await clearDonationAccountConnection(accountId);
		return json({ ok: true });
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : 'Failed to disconnect Stripe account.'
			},
			{ status: 500 }
		);
	}
};
