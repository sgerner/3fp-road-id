import { json } from '@sveltejs/kit';
import { scheduleMembershipEmailCampaign } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

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
