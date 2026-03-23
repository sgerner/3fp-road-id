import { json } from '@sveltejs/kit';
import { lookupMembershipUserByEmail } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function GET({ params, cookies, url }) {
	const result = await lookupMembershipUserByEmail({
		cookies,
		groupSlug: params.slug,
		email: url.searchParams.get('email') || ''
	});
	return respond(result);
}
