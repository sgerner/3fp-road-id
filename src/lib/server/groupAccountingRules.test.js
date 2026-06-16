import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildFeedItemsWithMatchCandidates,
	centsFromAmount,
	centsFromAmountAndDirection,
	centsFromSignedAmount,
	parseCsvRows,
	slugify,
	uniquePublicReportSlug
} from './groupAccountingRules.js';

test('money parsers accept common bank export formats', () => {
	assert.equal(centsFromAmount('$1,234.56'), 123456);
	assert.equal(centsFromAmount('-1.00'), null);
	assert.equal(centsFromSignedAmount('($42.10)'), -4210);
	assert.equal(centsFromSignedAmount(' $1,000.05 '), 100005);
	assert.equal(centsFromSignedAmount('not money'), null);
	assert.equal(centsFromAmountAndDirection('10.13', 'Debit'), -1013);
	assert.equal(centsFromAmountAndDirection('10.13', 'Credit'), 1013);
	assert.equal(centsFromAmountAndDirection('($42.10)', 'Debit'), -4210);
	assert.equal(centsFromAmountAndDirection('not money', 'Debit'), null);
});

test('parseCsvRows handles quoted commas, escaped quotes, and blank rows', () => {
	assert.deepEqual(
		parseCsvRows('Date,Description,Amount\n2026-01-02,"Ride snacks, cups","(12.34)"\n\n'),
		[
			['Date', 'Description', 'Amount'],
			['2026-01-02', 'Ride snacks, cups', '(12.34)']
		]
	);
	assert.deepEqual(parseCsvRows('"Memo with ""quotes""",10\n'), [['Memo with "quotes"', '10']]);
});

test('slugify produces stable public report slugs', () => {
	assert.equal(slugify(' May 2026 P&L Snapshot! '), 'may-2026-pl-snapshot');
	assert.equal(slugify('___'), '');
});

test('uniquePublicReportSlug increments existing group report slugs', async () => {
	const existingSlugs = new Set(['monthly-report', 'monthly-report-2']);
	const supabase = {
		from(table) {
			assert.equal(table, 'group_accounting_public_reports');
			const filters = {};
			return {
				select() {
					return this;
				},
				eq(column, value) {
					filters[column] = value;
					return this;
				},
				maybeSingle() {
					assert.equal(filters.group_id, 'group_1');
					return {
						data: existingSlugs.has(filters.slug) ? { id: `report:${filters.slug}` } : null,
						error: null
					};
				}
			};
		}
	};

	assert.equal(
		await uniquePublicReportSlug(supabase, 'group_1', 'Monthly Report'),
		'monthly-report-3'
	);
});

test('bank feed match candidates rank exact amount matches and exclude already matched entries', () => {
	const [item] = buildFeedItemsWithMatchCandidates(
		[
			{
				id: 'feed_1',
				transaction_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				account_id: 'cash_1'
			}
		],
		[
			{
				id: 'entry_far',
				status: 'posted',
				entry_date: '2026-06-01',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				lines: [{ account_id: 'cash_1' }]
			},
			{
				id: 'entry_best',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				lines: [{ account_id: 'cash_1' }]
			},
			{
				id: 'entry_wrong_amount',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2600,
				lines: [{ account_id: 'cash_1' }]
			},
			{
				id: 'entry_already_used',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				lines: [{ account_id: 'cash_1' }]
			}
		],
		['entry_already_used']
	);

	assert.equal(item.match_candidates[0].id, 'entry_best');
	assert.deepEqual(
		item.match_candidates.map((candidate) => candidate.id),
		['entry_best', 'entry_far']
	);
});

test('bank feed match candidates keep the current matched entry selectable', () => {
	const [item] = buildFeedItemsWithMatchCandidates(
		[
			{
				id: 'feed_1',
				transaction_date: '2026-06-10',
				description: 'Permit fee',
				amount_cents: -4200,
				account_id: 'cash_1',
				matched_entry_id: 'entry_current'
			}
		],
		[
			{
				id: 'entry_current',
				status: 'posted',
				entry_date: '2026-06-12',
				description: 'Permit fee',
				amount_cents: 4200,
				lines: [{ account_id: 'cash_1' }]
			},
			{
				id: 'entry_used_elsewhere',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Permit fee',
				amount_cents: 4200,
				lines: [{ account_id: 'cash_1' }]
			}
		],
		['entry_current', 'entry_used_elsewhere']
	);

	assert.deepEqual(
		item.match_candidates.map((candidate) => candidate.id),
		['entry_current']
	);
});
