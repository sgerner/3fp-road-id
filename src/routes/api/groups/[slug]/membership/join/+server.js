import { json } from '@sveltejs/kit';
import { joinMembership } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await joinMembership({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result);
}
