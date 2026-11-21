import { respond } from '#lib/server/groupApiResponse';
import { listGroupSubscriberWelcomeFailures } from '#lib/server/groupSubscriberWelcome';

export async function GET({ params, cookies }) {
	return respond(
		await listGroupSubscriberWelcomeFailures({
			cookies,
			groupSlug: params.slug
		})
	);
}
