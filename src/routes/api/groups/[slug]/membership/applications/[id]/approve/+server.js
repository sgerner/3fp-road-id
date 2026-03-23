import { json } from '@sveltejs/kit';
import { approveMembershipApplication } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, request, url, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await approveMembershipApplication({
		cookies,
		groupSlug: params.slug,
		applicationId: params.id,
		payload,
		requestUrl: url,
		fetchImpl: fetch
	});
	return respond(result);
}
