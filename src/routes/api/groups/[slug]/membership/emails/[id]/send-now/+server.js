import { respond } from '#lib/server/groupApiResponse';
import { sendMembershipEmailCampaignNow } from '#lib/server/memberships';
import { getConfiguredPublicOrigin } from '#lib/server/publicOrigin';

export async function POST({ params, cookies, fetch }) {
	const result = await sendMembershipEmailCampaignNow({
		cookies,
		groupSlug: params.slug,
		emailId: params.id,
		fetchImpl: fetch,
		originBaseUrl: getConfiguredPublicOrigin()
	});
	return respond(result);
}
