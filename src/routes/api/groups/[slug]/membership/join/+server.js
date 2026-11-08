import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { joinMembership } from '#lib/server/memberships';

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await joinMembership({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result);
}
