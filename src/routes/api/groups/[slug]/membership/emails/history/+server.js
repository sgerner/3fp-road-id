import { json } from '@sveltejs/kit';
import { listMembershipEmailHistory } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function GET({ params, cookies }) {
	const result = await listMembershipEmailHistory({
		cookies,
		groupSlug: params.slug
	});
	return respond(result);
}
