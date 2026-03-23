import { json } from '@sveltejs/kit';
import { listMembershipMembers } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function GET({ params, cookies, url }) {
	const result = await listMembershipMembers({
		cookies,
		groupSlug: params.slug,
		filters: {
			status: url.searchParams.get('status') || null,
			query: url.searchParams.get('query') || ''
		}
	});
	return respond(result);
}
