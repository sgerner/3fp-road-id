import { redirect } from '@sveltejs/kit';
import { requireGroupDonationManager, requireMainDonationManager } from '$lib/server/donations';
import {
	connectPrintfulForStore,
	getMerchStoreBySlug,
	getOrCreateGroupMerchStore
} from '$lib/server/merch';
import { exchangePrintfulAuthorizationCode, parsePrintfulStateToken } from '$lib/server/printful';

function buildReturnPath(target) {
	if (!target || target.type === 'main') return '/merch/manage';
	if (target.type === 'group') {
		return `/groups/${encodeURIComponent(target.slug || '')}/edit`;
	}
	return '/merch';
}

function buildReturnUrl(path, status, reason = '') {
	const params = new URLSearchParams();
	params.set('printful', status);
	if (reason) params.set('printful_reason', reason);
	return `${path}${path.includes('?') ? '&' : '?'}${params.toString()}`;
}

export const GET = async ({ url, cookies }) => {
	const stateToken = url.searchParams.get('state') || '';
	const code = url.searchParams.get('code') || '';
	const success = url.searchParams.get('success') || '';
	const oauthError =
		url.searchParams.get('error') || (success && success !== '1' ? 'authorization_failed' : '');

	const state = parsePrintfulStateToken(stateToken);
	if (!state) {
		throw redirect(303, buildReturnUrl('/merch/manage', 'error', 'invalid_state'));
	}

	const returnPath = buildReturnPath(
		state.type === 'group' ? { type: 'group', slug: state.slug } : { type: 'main' }
	);

	if (oauthError) {
		throw redirect(303, buildReturnUrl(returnPath, 'error', oauthError));
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

	let tokenSet = null;
	try {
		tokenSet = await exchangePrintfulAuthorizationCode({ code });
	} catch (error) {
		console.error('Printful OAuth token exchange failed', error);
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'oauth_exchange_failed'));
	}

	try {
		const store =
			state.type === 'group'
				? await getOrCreateGroupMerchStore(auth.group)
				: await getMerchStoreBySlug('main');
		await connectPrintfulForStore({ store, tokenSet });
	} catch (error) {
		console.error('Failed to persist Printful connection', error);
		throw redirect(303, buildReturnUrl(returnPath, 'error', 'save_failed'));
	}

	throw redirect(303, buildReturnUrl(returnPath, 'connected'));
};
