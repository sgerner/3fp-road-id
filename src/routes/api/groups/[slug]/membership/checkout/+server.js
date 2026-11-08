import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { createMembershipCheckout } from '#lib/server/memberships';

export async function POST({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createMembershipCheckout({
		cookies,
		groupSlug: params.slug,
		payload,
		requestUrl: url
	});
	return respond(result);
}
