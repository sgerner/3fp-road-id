import { respond } from '#lib/server/groupApiResponse';
import { listMembershipMembers } from '#lib/server/memberships';

export async function GET({ params, cookies, url }) {
	const result = await listMembershipMembers({
		cookies,
		groupSlug: params.slug,
		filters: {
			status: url.searchParams.get('status') || null,
			query: url.searchParams.get('query') || ''
		}
	});
	return respond(result);
}
