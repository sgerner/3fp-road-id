import { respond } from '#lib/server/groupApiResponse';
import { verifyGroupEmailSendingDomain } from '#lib/server/groupEmailDomains';

export async function POST({ params, cookies }) {
	const result = await verifyGroupEmailSendingDomain({
		cookies,
		groupSlug: params.slug,
		domainId: params.id
	});
	return respond(result);
}
