import { json } from '@sveltejs/kit';
import { MAIN_ORG_DONATION_ACCOUNT_ID } from '$lib/donations/constants';
import {
	buildGroupDonationAccountId,
	clearDonationAccountConnection,
	requireGroupDonationManager,
	requireMainDonationManager
} from '$lib/server/donations';

export const POST = async ({ request, cookies }) => {
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
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Not authorized.' }, { status: auth?.status || 403 });
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
			{ error: error?.message || 'Failed to disconnect Stripe account.' },
			{ status: 500 }
		);
	}
};
