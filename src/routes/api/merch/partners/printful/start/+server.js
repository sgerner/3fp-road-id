import { json, redirect } from '@sveltejs/kit';
import { requireGroupDonationManager, requireMainDonationManager } from '$lib/server/donations';
import { buildPrintfulAuthorizeUrl, createPrintfulStateToken } from '$lib/server/printful';
import { resolvePublicBaseUrl } from '$lib/server/stripe';

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

	let authorizeUrl = '';
	try {
		const redirectUrl = `${baseUrl}/api/merch/partners/printful/callback`;
		const state = createPrintfulStateToken({
			type: target.type,
			slug: target.slug || null,
			userId: auth.userId
		});
		authorizeUrl = buildPrintfulAuthorizeUrl({ redirectUrl, state });
	} catch (error) {
		return json({ error: error?.message || 'Printful OAuth is not configured.' }, { status: 500 });
	}

	throw redirect(303, authorizeUrl);
};
