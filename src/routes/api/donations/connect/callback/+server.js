import { redirect } from '@sveltejs/kit';
import {
	buildConnectReturnPath,
	parseConnectStateToken,
	requireGroupDonationManager,
	requireMainDonationManager,
	upsertDonationAccountForGroup,
	upsertDonationAccountForMain
} from '$lib/server/donations';
import { getStripeClient } from '$lib/server/stripe';

function buildReturnUrl(path, status, reason = '') {
	const qp = new URLSearchParams();
	qp.set('stripe', status);
	if (reason) qp.set('reason', reason);
	return `${path}${path.includes('?') ? '&' : '?'}${qp.toString()}`;
}

export const GET = async ({ url, cookies }) => {
	const stateToken = url.searchParams.get('state') || '';
	const code = url.searchParams.get('code') || '';
	const oauthError = url.searchParams.get('error') || '';
	const oauthErrorDescription = url.searchParams.get('error_description') || '';

	const state = parseConnectStateToken(stateToken);
	if (!state) {
		throw redirect(303, buildReturnUrl('/donate?manage=1', 'error', 'invalid_state'));
	}

	const returnPath = buildConnectReturnPath(
		state.type === 'group' ? { type: 'group', slug: state.slug } : { type: 'main' }
	);

	if (oauthError) {
		const reason = oauthErrorDescription ? `${oauthError}:${oauthErrorDescription}` : oauthError;
		throw redirect(303, buildReturnUrl(returnPath, 'error', reason));
	}
	if (!code) {
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'missing_code'));
	}

	let auth = null;
	if (state.type === 'group') {
		auth = await requireGroupDonationManager(cookies, state.slug || '');
	} else {
		auth = await requireMainDonationManager(cookies);
	}
	if (!auth?.ok) {
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'unauthorized'));
	}
	if (state.userId && state.userId !== auth.userId) {
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'session_mismatch'));
	}

	const stripe = getStripeClient();
	let tokenResponse = null;
	try {
		tokenResponse = await stripe.oauth.token({
			grant_type: 'authorization_code',
			code
		});
	} catch (error) {
		console.error('Stripe OAuth token exchange failed', error);
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'oauth_exchange_failed'));
	}

	const stripeAccountId = tokenResponse?.stripe_user_id;
	if (!stripeAccountId) {
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'missing_account'));
	}

	let stripeAccount = null;
	try {
		stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
	} catch (error) {
		console.error('Failed to retrieve Stripe account after OAuth', error);
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'account_lookup_failed'));
	}

	try {
		if (state.type === 'group') {
			await upsertDonationAccountForGroup(auth.group, stripeAccount);
		} else {
			await upsertDonationAccountForMain(stripeAccount);
		}
	} catch (error) {
		console.error('Failed to persist Stripe donation account', error);
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'save_failed'));
	}

	throw redirect(303, buildReturnUrl(returnPath, 'connected'));
};
