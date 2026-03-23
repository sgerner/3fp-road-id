import { json } from '@sveltejs/kit';
import { sendMembershipEmailCampaignNow } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, fetch, url }) {
	const result = await sendMembershipEmailCampaignNow({
		cookies,
		groupSlug: params.slug,
		emailId: params.id,
		fetchImpl: fetch,
		originBaseUrl: url.origin || null
	});
	return respond(result);
}
