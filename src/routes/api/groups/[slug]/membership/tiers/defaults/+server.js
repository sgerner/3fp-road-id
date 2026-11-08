import { respond } from '#lib/server/groupApiResponse';
import { seedDefaultMembershipTiers } from '#lib/server/memberships';

export async function POST({ params, cookies }) {
	const result = await seedDefaultMembershipTiers({
		cookies,
		groupSlug: params.slug
	});
	return respond(result);
}
