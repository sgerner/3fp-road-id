import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { scheduleMembershipEmailCampaign } from '#lib/server/memberships';

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await scheduleMembershipEmailCampaign({
		cookies,
		groupSlug: params.slug,
		emailId: params.id,
		payload
	});
	return respond(result);
}
