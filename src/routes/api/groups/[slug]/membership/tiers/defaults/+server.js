import { json } from '@sveltejs/kit';
import { seedDefaultMembershipTiers } from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

export async function POST({ params, cookies }) {
	const result = await seedDefaultMembershipTiers({
		cookies,
		groupSlug: params.slug
	});
	return respond(result);
}
