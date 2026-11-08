import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { approveMembershipApplication } from '#lib/server/memberships';

export async function POST({ params, cookies, request, url, fetch }) {
	const payload = await request.json().catch(() => ({}));
	const result = await approveMembershipApplication({
		cookies,
		groupSlug: params.slug,
		applicationId: params.id,
		payload,
		requestUrl: url,
		fetchImpl: fetch
	});
	return respond(result);
}
