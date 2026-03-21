import { json } from '@sveltejs/kit';
import { listMembershipApplications } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function GET({ params, cookies, url }) {
	const status = url.searchParams.get('status');
	const result = await listMembershipApplications({
		cookies,
		groupSlug: params.slug,
		status
	});
	return respond(result);
}
