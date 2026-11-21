import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { updateMembershipEmailCampaign } from '#lib/server/memberships';

export async function PUT({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await updateMembershipEmailCampaign({
		cookies,
		groupSlug: params.slug,
		emailId: params.id,
		payload
	});
	return respond(result);
}
