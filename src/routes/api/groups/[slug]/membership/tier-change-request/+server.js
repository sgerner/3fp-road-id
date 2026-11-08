import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { requestMembershipTierChange } from '#lib/server/memberships';

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await requestMembershipTierChange({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result, 201);
}
