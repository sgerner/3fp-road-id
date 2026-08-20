import { json } from '@sveltejs/kit';
import { updateMembershipEmailCampaign } from '$lib/server/memberships';

function respond(result) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data });
}

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
