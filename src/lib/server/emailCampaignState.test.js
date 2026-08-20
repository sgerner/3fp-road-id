import assert from 'node:assert/strict';
import test from 'node:test';
import {
	claimEmailCampaign,
	recoverStaleEmailCampaignClaims,
	renewEmailCampaignClaim,
	resolveEmailCampaignFinalStatus,
	staleEmailCampaignCutoff
} from './emailCampaignState.js';

function createCampaignStore(initialRow) {
	const row = { ...initialRow };
	return {
		row,
		from() {
			let update = {};
			const filters = [];
			const builder = {
				update(value) {
					update = value;
					return builder;
				},
				eq(key, value) {
					filters.push([key, value]);
					return builder;
				},
				select() {
					return builder;
				},
				async maybeSingle() {
					if (!filters.every(([key, value]) => row[key] === value)) {
						return { data: null, error: null };
					}
					Object.assign(row, update);
					return { data: { id: row.id }, error: null };
				}
			};
			return builder;
		}
	};
}

test('only one concurrent caller can atomically claim a campaign', async () => {
	const store = createCampaignStore({ id: 'campaign', group_id: 'group', status: 'draft' });
	const claim = () =>
		claimEmailCampaign({
			serviceSupabase: store,
			campaignId: 'campaign',
			groupId: 'group',
			expectedStatus: 'draft',
			updatedAt: '2026-08-12T00:00:00.000Z'
		});
	const results = await Promise.allSettled([claim(), claim()]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
	assert.equal(
		results.find((result) => result.status === 'rejected').reason.campaignNotClaimed,
		true
	);
	assert.equal(store.row.status, 'sending');
});

test('an active campaign claim can renew its lease', async () => {
	const store = createCampaignStore({ id: 'campaign', group_id: 'group', status: 'sending' });
	await renewEmailCampaignClaim({
		serviceSupabase: store,
		campaignId: 'campaign',
		groupId: 'group',
		updatedAt: '2026-08-12T12:00:00.000Z'
	});
	assert.equal(store.row.updated_at, '2026-08-12T12:00:00.000Z');
});

test('campaign completion distinguishes partial and total delivery failures', () => {
	assert.equal(resolveEmailCampaignFinalStatus({ sentCount: 10, failedCount: 0 }), 'sent');
	assert.equal(
		resolveEmailCampaignFinalStatus({ sentCount: 9, failedCount: 1 }),
		'partially_failed'
	);
	assert.equal(resolveEmailCampaignFinalStatus({ sentCount: 0, failedCount: 10 }), 'failed');
});

test('stale campaign claims expire into a recoverable failed state', async () => {
	const rows = [
		{ id: 'stale', status: 'sending', updated_at: '2026-08-12T11:00:00.000Z' },
		{ id: 'fresh', status: 'sending', updated_at: '2026-08-12T11:55:00.000Z' },
		{ id: 'draft', status: 'draft', updated_at: '2026-08-12T10:00:00.000Z' }
	];
	const serviceSupabase = {
		from() {
			let update = {};
			let status = '';
			let staleBefore = '';
			const builder = {
				update(value) {
					update = value;
					return builder;
				},
				eq(key, value) {
					if (key === 'status') status = value;
					return builder;
				},
				lt(key, value) {
					if (key === 'updated_at') staleBefore = value;
					return builder;
				},
				async select() {
					const recovered = rows.filter(
						(row) => row.status === status && row.updated_at < staleBefore
					);
					for (const row of recovered) Object.assign(row, update);
					return { data: recovered.map(({ id }) => ({ id })), error: null };
				}
			};
			return builder;
		}
	};
	const now = new Date('2026-08-12T12:00:00.000Z');
	assert.equal(staleEmailCampaignCutoff(now), '2026-08-12T11:45:00.000Z');
	const recovered = await recoverStaleEmailCampaignClaims({ serviceSupabase, now });
	assert.deepEqual(recovered, [{ id: 'stale' }]);
	assert.equal(rows[0].status, 'failed');
	assert.equal(rows[1].status, 'sending');
	assert.equal(rows[2].status, 'draft');
});
