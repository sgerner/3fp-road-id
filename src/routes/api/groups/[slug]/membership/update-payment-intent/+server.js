import { json } from '@sveltejs/kit';
import { updateMembershipPaymentIntent } from '$lib/server/memberships';
import { getStripePublishableKey } from '$lib/server/stripe';

export async function POST({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const result = await updateMembershipPaymentIntent({
		cookies,
		groupSlug: params.slug,
		payload,
		requestUrl: url
	});
	if (!result?.ok) {
		return json({ error: result?.error || 'Unable to refresh payment.' }, { status: result?.status || 500 });
	}
	return json({
		data: {
			...result.data,
			publishable_key: getStripePublishableKey()
		}
	});
}

