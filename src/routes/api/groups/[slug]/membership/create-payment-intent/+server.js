import { json } from '@sveltejs/kit';
import { createMembershipPaymentIntent } from '$lib/server/memberships';
import { getStripePublishableKey } from '$lib/server/stripe';

export async function POST({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createMembershipPaymentIntent({
		cookies,
		groupSlug: params.slug,
		payload,
		requestUrl: url
	});
	if (!result?.ok) {
		return json(
			{ error: result?.error || 'Unable to prepare payment.' },
			{ status: result?.status || 500 }
		);
	}
	return json({
		data: {
			...result.data,
			publishable_key: getStripePublishableKey()
		}
	});
}
