import { respond } from '#lib/server/groupApiResponse';
import { listMembershipEmailHistory } from '#lib/server/memberships';

export async function GET({ params, cookies }) {
	const result = await listMembershipEmailHistory({
		cookies,
		groupSlug: params.slug
	});
	return respond(result);
}
