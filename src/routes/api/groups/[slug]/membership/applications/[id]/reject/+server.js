import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { rejectMembershipApplication } from '#lib/server/memberships';

export async function POST({ params, cookies, request, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await rejectMembershipApplication({
		cookies,
		groupSlug: params.slug,
		applicationId: params.id,
		payload,
		fetchImpl: fetch
	});
	return respond(result);
}
