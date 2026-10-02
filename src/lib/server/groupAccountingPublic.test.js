import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicAccountingSnapshot, publicAccountingReport } from './groupAccountingPublic.js';

const account = {
	id: 'private-id',
	code: '1000',
	name: 'Bank',
	kind: 'asset',
	balance_cents: 500,
	period_balance_cents: 100,
	description: 'private description'
};
const report = {
	from: '2026-01-01',
	to: '2026-10-01',
	accounts: [account],
	income: [account],
	expenses: [account],
	assets: [account],
	liabilities: [],
	equity: [],
	monthly: [{ month: '2026-01', net_cents: 10 }],
	totals: {
		income_cents: 100,
		expense_cents: 90,
		net_cents: 10,
		assets_cents: 500,
		liabilities_cents: 50,
		equity_cents: 450
	}
};

test('hidden public sections are absent from the serialized payload', () => {
	const snapshot = buildPublicAccountingSnapshot(
		report,
		[{ notes: 'private budget', amount_cents: 123 }],
		{ activity: false, position: false, cash: false, budgets: false }
	);
	assert.deepEqual(snapshot, { report: { from: report.from, to: report.to, totals: {} } });
});

test('cash-only publication reveals aggregates without account or activity detail', () => {
	const snapshot = buildPublicAccountingSnapshot(report, [], {
		activity: false,
		position: false,
		cash: true
	});
	assert.deepEqual(snapshot.report.totals, { assets_cents: 500, liabilities_cents: 50 });
	assert.equal(JSON.stringify(snapshot).includes('private'), false);
	assert.equal(snapshot.report.income, undefined);
});

test('public activity omits lifetime balances and internal account fields', () => {
	const snapshot = buildPublicAccountingSnapshot(report, [], { position: false, cash: false });
	assert.deepEqual(snapshot.report.income[0], {
		code: '1000',
		name: 'Bank',
		kind: 'asset',
		period_balance_cents: 100
	});
	assert.equal(snapshot.report.accounts, undefined);
});

test('legacy public reports are redacted on read, including private notes and publisher identifiers', () => {
	const row = publicAccountingReport({
		snapshot: { report, budgets: [], generated_at: 'date', secret: 'hidden' },
		visibility: { activity: false, notes: false },
		notes: 'private note',
		published_by_user_id: 'private user',
		share_token: 'private token'
	});
	assert.equal(row.notes, null);
	assert.equal(row.snapshot.report.income, undefined);
	assert.equal(row.published_by_user_id, undefined);
	assert.equal(row.share_token, undefined);
	assert.equal(row.snapshot.generated_at, 'date');
});
