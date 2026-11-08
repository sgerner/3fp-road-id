import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { cancelMembership } from '#lib/server/memberships';

export async function POST({ params, cookies, request, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await cancelMembership({
		cookies,
		groupSlug: params.slug,
		payload,
		fetchImpl: fetch
	});
	return respond(result);
}
