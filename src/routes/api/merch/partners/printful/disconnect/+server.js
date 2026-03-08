import { json } from '@sveltejs/kit';
import { requireGroupDonationManager, requireMainDonationManager } from '$lib/server/donations';
import {
	disconnectPrintfulForStore,
	getExistingGroupMerchStore,
	getMerchStoreBySlug
} from '$lib/server/merch';

export const POST = async ({ request, cookies }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	const recipientType = (payload?.recipient || 'main').toString().toLowerCase();
	const groupSlug = (payload?.group || '').toString().trim();

	let store = null;
	if (recipientType === 'group') {
		const auth = await requireGroupDonationManager(cookies, groupSlug);
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Not authorized.' }, { status: auth?.status || 403 });
		}
		store = await getExistingGroupMerchStore(auth.group.id);
		if (!store?.id) return json({ ok: true });
	} else {
		const auth = await requireMainDonationManager(cookies);
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Not authorized.' }, { status: auth?.status || 403 });
		}
		store = await getMerchStoreBySlug('main');
	}

	try {
		await disconnectPrintfulForStore(store.id);
		return json({ ok: true });
	} catch (error) {
		return json(
			{ error: error?.message || 'Failed to disconnect Printful account.' },
			{ status: 500 }
		);
	}
};
