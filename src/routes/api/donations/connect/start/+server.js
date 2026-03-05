import { json, redirect } from '@sveltejs/kit';
import {
	createConnectStateToken,
	requireGroupDonationManager,
	requireMainDonationManager
} from '$lib/server/donations';
import { getStripeConnectClientId, resolvePublicBaseUrl } from '$lib/server/stripe';

export const GET = async ({ url, cookies }) => {
	const recipientType = (url.searchParams.get('recipient') || 'main').toLowerCase();
	const groupSlug = (url.searchParams.get('group') || '').trim();

	let auth = null;
	let target = null;
	if (recipientType === 'group') {
		auth = await requireGroupDonationManager(cookies, groupSlug);
		target = { type: 'group', slug: groupSlug };
	} else {
		auth = await requireMainDonationManager(cookies);
		target = { type: 'main' };
	}

	if (!auth?.ok) {
		return json(
			{ error: auth?.error || 'Authentication failed.' },
			{ status: auth?.status || 401 }
		);
	}

	const baseUrl = resolvePublicBaseUrl(url);
	if (!baseUrl) {
		return json({ error: 'PUBLIC_URL_BASE is not configured.' }, { status: 500 });
	}

	let clientId = '';
	try {
		clientId = getStripeConnectClientId();
	} catch (error) {
		return json(
			{ error: error?.message || 'Stripe Connect client id is missing.' },
			{ status: 500 }
		);
	}

	const redirectUri = `${baseUrl}/api/donations/connect/callback`;
	const state = createConnectStateToken(target, auth.userId);
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		scope: 'read_write',
		redirect_uri: redirectUri,
		state
	});

	throw redirect(303, `https://connect.stripe.com/oauth/authorize?${params.toString()}`);
};
