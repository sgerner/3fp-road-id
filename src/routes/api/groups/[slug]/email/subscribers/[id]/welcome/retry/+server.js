import { respond } from '#lib/server/groupApiResponse';
import { retryGroupSubscriberWelcome } from '#lib/server/groupSubscriberWelcome';
import { getConfiguredPublicOrigin } from '#lib/server/publicOrigin';

export async function POST({ params, cookies, fetch: fetchImpl }) {
	return respond(
		await retryGroupSubscriberWelcome({
			cookies,
			groupSlug: params.slug,
			subscriberId: params.id,
			origin: getConfiguredPublicOrigin(),
			fetchImpl
		})
	);
}
