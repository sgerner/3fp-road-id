import { json } from '@sveltejs/kit';
import { sendMembershipEmailCampaignNow } from '$lib/server/memberships';
import { getConfiguredPublicOrigin } from '$lib/server/publicOrigin';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, fetch }) {
	const result = await sendMembershipEmailCampaignNow({
		cookies,
		groupSlug: params.slug,
		emailId: params.id,
		fetchImpl: fetch,
		originBaseUrl: getConfiguredPublicOrigin()
	});
	return respond(result);
}
