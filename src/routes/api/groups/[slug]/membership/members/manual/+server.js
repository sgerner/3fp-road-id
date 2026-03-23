import { json } from '@sveltejs/kit';
import { createManualMembership } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, request, fetch, url }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createManualMembership({
		cookies,
		groupSlug: params.slug,
		payload,
		fetchImpl: fetch,
		requestUrl: url
	});
	return respond(result, 201);
}
