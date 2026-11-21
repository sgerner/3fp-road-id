import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { updateMembershipPolicy } from '#lib/server/memberships';

export async function PUT({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await updateMembershipPolicy({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result);
}
