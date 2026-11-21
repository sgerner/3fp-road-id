import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { updateMembershipStatus } from '#lib/server/memberships';

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await updateMembershipStatus({
		cookies,
		groupSlug: params.slug,
		membershipId: params.id,
		payload
	});
	return respond(result);
}
