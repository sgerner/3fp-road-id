import { json } from '@sveltejs/kit';
import { finalizeMembershipPaymentIntent } from '$lib/server/memberships';

export async function POST({ params, cookies, request, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await finalizeMembershipPaymentIntent({
		cookies,
		groupSlug: params.slug,
		payload,
		fetchImpl: fetch
	});
	if (!result?.ok) {
		return json(
			{ error: result?.error || 'Unable to finalize payment.' },
			{ status: result?.status || 500 }
		);
	}
	return json({ data: result.data });
}
