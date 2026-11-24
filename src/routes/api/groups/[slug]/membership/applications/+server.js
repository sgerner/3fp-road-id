import { respond } from '#lib/server/groupApiResponse';
import { listMembershipApplications } from '#lib/server/memberships';

/**
 * @param {any} param0
 */
export async function GET({ params, cookies, url }) {
	const status = url.searchParams.get('status');
	const result = await listMembershipApplications({
		cookies,
		groupSlug: params.slug,
		status
	});
	return respond(result);
}
