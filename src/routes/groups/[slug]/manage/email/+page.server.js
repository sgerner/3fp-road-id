import { listGroupSiteDomains } from '$lib/server/groupSiteDomains';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { listGroupEmailSendingDomains } from '$lib/server/groupEmailDomains';
import { listMembershipEmailHistory } from '$lib/server/memberships';

async function loadAudienceSummary(serviceSupabase, groupId) {
	if (!serviceSupabase || !groupId) {
		return {
			active: 0,
			past_due: 0,
			cancelled: 0,
			total: 0
		};
	}

	const statuses = ['active', 'past_due', 'cancelled'];
	const entries = await Promise.all(
		statuses.map(async (status) => {
			const { count } = await serviceSupabase
				.from('group_memberships')
				.select('id', { count: 'exact', head: true })
				.eq('group_id', groupId)
				.eq('status', status);
			return [status, count ?? 0];
		})
	);

	const summary = Object.fromEntries(entries);
	return {
		...summary,
		total: (summary.active || 0) + (summary.past_due || 0) + (summary.cancelled || 0)
	};
}

export const load = async ({ parent, cookies }) => {
	const parentData = await parent();
	const serviceSupabase = createServiceSupabaseClient();
	const [senderDomainsResult, emailHistoryResult, audienceSummary, siteDomains] = await Promise.all(
		[
			listGroupEmailSendingDomains({
				cookies,
				groupSlug: parentData.group.slug
			}),
			listMembershipEmailHistory({
				cookies,
				groupSlug: parentData.group.slug
			}),
			loadAudienceSummary(serviceSupabase, parentData.group.id),
			serviceSupabase ? listGroupSiteDomains(serviceSupabase, parentData.group.id) : []
		]
	);

	return {
		group: parentData.group,
		senderDomains: senderDomainsResult?.ok ? senderDomainsResult.data : [],
		emailHistory: emailHistoryResult?.ok ? emailHistoryResult.data : [],
		siteDomains,
		audienceSummary
	};
};
