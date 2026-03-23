import { json } from '@sveltejs/kit';
import { rejectMembershipApplication } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, request, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await rejectMembershipApplication({
		cookies,
		groupSlug: params.slug,
		applicationId: params.id,
		payload,
		fetchImpl: fetch
	});
	return respond(result);
}
