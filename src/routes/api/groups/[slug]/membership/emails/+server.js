import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { createMembershipEmailCampaign } from '#lib/server/memberships';

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createMembershipEmailCampaign({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result, 201);
}
