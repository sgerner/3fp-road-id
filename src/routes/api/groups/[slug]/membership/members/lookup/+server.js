import { respond } from '#lib/server/groupApiResponse';
import { lookupMembershipUserByEmail } from '#lib/server/memberships';

export async function GET({ params, cookies, url }) {
	const result = await lookupMembershipUserByEmail({
		cookies,
		groupSlug: params.slug,
		email: url.searchParams.get('email') || ''
	});
	return respond(result);
}
