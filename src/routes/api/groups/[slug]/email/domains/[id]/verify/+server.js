import { json } from '@sveltejs/kit';
import { verifyGroupEmailSendingDomain } from '$lib/server/groupEmailDomains';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies }) {
	const result = await verifyGroupEmailSendingDomain({
		cookies,
		groupSlug: params.slug,
		domainId: params.id
	});
	return respond(result);
}
