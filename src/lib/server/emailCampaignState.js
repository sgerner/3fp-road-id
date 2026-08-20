export class CampaignNotClaimedError extends Error {
	constructor(message) {
		super(message);
		this.name = 'CampaignNotClaimedError';
		this.campaignNotClaimed = true;
	}
}

export const EMAIL_CAMPAIGN_CLAIM_LEASE_MS = 15 * 60 * 1000;

export function staleEmailCampaignCutoff(
	now = new Date(),
	leaseMs = EMAIL_CAMPAIGN_CLAIM_LEASE_MS
) {
	const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
	if (!Number.isFinite(timestamp)) throw new TypeError('A valid recovery time is required.');
	return new Date(timestamp - leaseMs).toISOString();
}

export async function recoverStaleEmailCampaignClaims({
	serviceSupabase,
	now = new Date(),
	leaseMs = EMAIL_CAMPAIGN_CLAIM_LEASE_MS
}) {
	const recoveryTime = now instanceof Date ? now : new Date(now);
	const updatedAt = recoveryTime.toISOString();
	const staleBefore = staleEmailCampaignCutoff(recoveryTime, leaseMs);
	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.update({ status: 'failed', updated_at: updatedAt })
		.eq('status', 'sending')
		.lt('updated_at', staleBefore)
		.select('id');
	if (error) throw new Error(error.message);
	return data || [];
}

export async function renewEmailCampaignClaim({ serviceSupabase, campaignId, groupId, updatedAt }) {
	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.update({ updated_at: updatedAt })
		.eq('id', campaignId)
		.eq('group_id', groupId)
		.eq('status', 'sending')
		.select('id')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('Campaign delivery claim expired.');
	return data;
}

export function resolveEmailCampaignFinalStatus({ sentCount = 0, failedCount = 0 }) {
	if (failedCount > 0) return sentCount > 0 ? 'partially_failed' : 'failed';
	return 'sent';
}

export async function claimEmailCampaign({
	serviceSupabase,
	campaignId,
	groupId,
	expectedStatus,
	updatedAt
}) {
	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.update({ status: 'sending', updated_at: updatedAt })
		.eq('id', campaignId)
		.eq('group_id', groupId)
		.eq('status', expectedStatus)
		.select('id')
		.maybeSingle();
	if (error) throw new CampaignNotClaimedError(error.message);
	if (!data) throw new CampaignNotClaimedError('This campaign is already being processed.');
	return data;
}
