import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { createManualMembership } from '#lib/server/memberships';

export async function POST({ params, cookies, request, fetch, url }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createManualMembership({
		cookies,
		groupSlug: params.slug,
		payload,
		fetchImpl: fetch,
		requestUrl: url
	});
	return respond(result, 201);
}
