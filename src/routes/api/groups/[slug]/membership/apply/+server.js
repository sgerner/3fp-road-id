import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { applyForMembership } from '#lib/server/memberships';

export async function POST({ params, cookies, request, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await applyForMembership({
		cookies,
		groupSlug: params.slug,
		payload,
		fetchImpl: fetch
	});
	return respond(result, 201);
}
