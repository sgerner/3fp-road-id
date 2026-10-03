import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildFeedItemsWithMatchCandidates,
	buildAccountingReportFromRows,
	buildBankFeedEntryLines,
	budgetActualWindow,
	fiscalYearStartYear,
	fiscalYearWindow,
	buildCsvSourceIds,
	centsFromAmount,
	centsFromAmountAndDirection,
	centsFromSignedAmount,
	csvEscape,
	fetchAllRows,
	isValidAccountingDate,
	normalizeBankDate,
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
	assert.equal(centsFromAmount('1,2,3.00'), null);
	assert.equal(centsFromAmount('1e3'), null);
	assert.equal(centsFromAmount('21,474,836.48'), null);
	assert.equal(centsFromAmount('1.005'), 101);
	assert.equal(centsFromSignedAmount(''), null);
	assert.equal(centsFromAmountAndDirection('10.00', 'DR'), -1000);
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
	assert.throws(() => parseCsvRows('Date,Description\n2026-01-01,"unfinished'), /unterminated/);
});

test('accounting dates and bank date normalization reject impossible dates', () => {
	assert.equal(isValidAccountingDate('2024-02-29'), true);
	assert.equal(isValidAccountingDate('2026-02-29'), false);
	assert.equal(normalizeBankDate('6/2/2026'), '2026-06-02');
	assert.equal(normalizeBankDate('2026-06-02T14:30:00Z'), '2026-06-02');
	assert.equal(normalizeBankDate('2026-13-02'), null);
});

test('CSV text fields are quoted and protected from spreadsheet formulas', () => {
	assert.equal(csvEscape('=1+1'), "'=1+1");
	assert.equal(csvEscape('  @SUM(A1:A2)'), "'  @SUM(A1:A2)");
	assert.equal(csvEscape('ride, "snacks"\r\nextra'), '"ride, ""snacks""\r\nextra"');
	assert.equal(csvEscape(-1234), '-1234');
});

test('bank-feed reversals post to contra income or expense accounts by sign', () => {
	assert.deepEqual(buildBankFeedEntryLines(-2500, 'cash', { id: 'donations', kind: 'income' }), [
		{ account_id: 'donations', debit_cents: 2500 },
		{ account_id: 'cash', credit_cents: 2500 }
	]);
	assert.deepEqual(buildBankFeedEntryLines(2500, 'cash', { id: 'events', kind: 'expense' }), [
		{ account_id: 'cash', debit_cents: 2500 },
		{ account_id: 'events', credit_cents: 2500 }
	]);
	assert.throws(
		() => buildBankFeedEntryLines(-2500, 'cash', { id: 'cash', kind: 'asset' }),
		/two different accounts/
	);
});

test('CSV import IDs remain stable across filenames, row order, and accounts', () => {
	const transaction = {
		date: '2026-06-02',
		description: 'Team snacks',
		amount_cents: -1250,
		currency: 'usd',
		raw: { row: ['2026-06-02', 'Team snacks', '-12.50'] }
	};
	const first = buildCsvSourceIds([transaction], [], 'account_a');
	const renamed = buildCsvSourceIds([transaction], [], 'account_a');
	assert.equal(first[0].id, renamed[0].id);
	assert.notEqual(first[0].id, buildCsvSourceIds([transaction], [], 'account_b')[0].id);

	const reordered = buildCsvSourceIds(
		[
			{ ...transaction, description: 'Fuel' },
			{ ...transaction, description: 'Parking' }
		],
		[],
		'account_a'
	);
	const reversed = buildCsvSourceIds(
		[
			{ ...transaction, description: 'Parking' },
			{ ...transaction, description: 'Fuel' }
		],
		[],
		'account_a'
	);
	assert.equal(reordered[0].id, reversed[1].id);
	assert.equal(reordered[1].id, reversed[0].id);
});

test('CSV occurrence IDs skip prior imports but preserve additional identical rows', () => {
	const transaction = {
		date: '2026-06-02',
		description: 'Duplicate merchant',
		amount_cents: -500,
		currency: 'usd',
		raw: { row: ['2026-06-02', 'Duplicate merchant', '-5.00'] }
	};
	const once = buildCsvSourceIds([transaction], [], 'cash');
	const legacy = {
		...transaction,
		account_id: 'cash',
		transaction_date: transaction.date,
		source_transaction_id: 'csv:old-file.csv:14:2026-06-02:Duplicate merchant:-500'
	};
	const reimport = buildCsvSourceIds([transaction, transaction], [legacy], 'cash');
	assert.equal(reimport.length, 1);
	assert.equal(reimport[0].id, 'csv:cash:row:' + once[0].id.split(':').at(-2) + ':2');
	assert.deepEqual(
		buildCsvSourceIds(
			[transaction],
			reimport.map((row) => ({
				...row,
				account_id: 'cash',
				transaction_date: row.date,
				source_transaction_id: row.id
			})),
			'cash'
		),
		[]
	);
	assert.equal(buildCsvSourceIds([transaction], [legacy], 'other-account').length, 1);
});

test('bank transaction IDs take precedence over row fingerprints', () => {
	const first = buildCsvSourceIds(
		[{ date: '2026-06-02', description: 'Shop', amount_cents: -500, bank_transaction_id: 'TX-9' }],
		[],
		'cash'
	);
	const repeat = buildCsvSourceIds(
		[
			{
				date: '2026-06-03',
				description: 'Shop correction',
				amount_cents: -700,
				bank_transaction_id: 'TX-9'
			}
		],
		[
			{
				account_id: 'cash',
				source_transaction_id: first[0].id,
				transaction_date: '2026-06-02',
				date: '2026-06-02',
				description: 'Shop',
				amount_cents: -500,
				currency: 'usd'
			}
		],
		'cash'
	);
	assert.equal(repeat.length, 0);
});

test('fetchAllRows reads every page beyond the Supabase default row cap', async () => {
	const source = Array.from({ length: 2305 }, (_, id) => ({ id }));
	const requestedRanges = [];
	const rows = await fetchAllRows(async (from, to) => {
		requestedRanges.push([from, to]);
		return { data: source.slice(from, to + 1), error: null };
	});

	assert.equal(rows.length, source.length);
	assert.deepEqual(requestedRanges, [
		[0, 999],
		[1000, 1999],
		[2000, 2999]
	]);
});

test('report equity carries cumulative net activity and respects the selected period', () => {
	const accounts = [
		{ id: 'cash', kind: 'asset', normal_side: 'debit' },
		{ id: 'equity', kind: 'equity', normal_side: 'credit' },
		{ id: 'donations', kind: 'income', normal_side: 'credit' },
		{ id: 'events', kind: 'expense', normal_side: 'debit' }
	];
	const entries = [
		{ id: 'opening', status: 'posted', entry_date: '2025-12-31' },
		{ id: 'donation', status: 'void', entry_date: '2026-01-10' },
		{ id: 'expense', status: 'posted', entry_date: '2026-02-10' },
		{ id: 'reversal', status: 'posted', entry_date: '2026-04-01' },
		{ id: 'draft', status: 'draft', entry_date: '2026-02-15' },
		{ id: 'future', status: 'posted', entry_date: '2026-05-01' }
	];
	const lines = [
		{ entry_id: 'opening', account_id: 'cash', debit_cents: 10000, credit_cents: 0 },
		{ entry_id: 'opening', account_id: 'equity', debit_cents: 0, credit_cents: 10000 },
		{ entry_id: 'donation', account_id: 'cash', debit_cents: 5000, credit_cents: 0 },
		{ entry_id: 'donation', account_id: 'donations', debit_cents: 0, credit_cents: 5000 },
		{ entry_id: 'expense', account_id: 'events', debit_cents: 1000, credit_cents: 0 },
		{ entry_id: 'expense', account_id: 'cash', debit_cents: 0, credit_cents: 1000 },
		{ entry_id: 'reversal', account_id: 'donations', debit_cents: 5000, credit_cents: 0 },
		{ entry_id: 'reversal', account_id: 'cash', debit_cents: 0, credit_cents: 5000 },
		{ entry_id: 'draft', account_id: 'cash', debit_cents: 9000, credit_cents: 0 },
		{ entry_id: 'draft', account_id: 'equity', debit_cents: 0, credit_cents: 9000 },
		{ entry_id: 'future', account_id: 'cash', debit_cents: 7000, credit_cents: 0 },
		{ entry_id: 'future', account_id: 'equity', debit_cents: 0, credit_cents: 7000 }
	];

	const beforeReversal = buildAccountingReportFromRows(
		accounts,
		entries,
		lines,
		'2026-01-01',
		'2026-03-31'
	);
	assert.equal(beforeReversal.totals.income_cents, 5000);
	assert.equal(beforeReversal.totals.expense_cents, 1000);
	assert.equal(beforeReversal.totals.assets_cents, 14000);
	assert.equal(beforeReversal.totals.equity_cents, 14000);

	const afterReversal = buildAccountingReportFromRows(
		accounts,
		entries,
		lines,
		'2026-04-01',
		'2026-04-30'
	);
	assert.equal(afterReversal.totals.income_cents, -5000);
	assert.equal(afterReversal.totals.expense_cents, 0);
	assert.equal(afterReversal.totals.assets_cents, 9000);
	assert.equal(afterReversal.totals.equity_cents, 9000);
});

test('fiscal year windows use the configured start month and start-year budget key', () => {
	assert.deepEqual(fiscalYearWindow(2026, 7), {
		from: '2026-07-01',
		to: '2027-06-30',
		year: 2026
	});
	assert.equal(fiscalYearStartYear('2026-06-30', 7), 2025);
	assert.equal(fiscalYearStartYear('2026-07-01', 7), 2026);
	assert.deepEqual(budgetActualWindow(2025, '2026-06-30', 7), {
		from: '2025-07-01',
		to: '2026-06-30'
	});
	assert.deepEqual(budgetActualWindow(2026, '2026-10-02', 7), {
		from: '2026-07-01',
		to: '2026-10-02'
	});
	assert.equal(budgetActualWindow(2027, '2026-10-02', 7).to, null);
});

test('report aggregation handles more than one thousand ledger lines', () => {
	const entryCount = 1200;
	const entries = Array.from({ length: entryCount }, (_, id) => ({
		id: `entry-${id}`,
		status: 'posted',
		entry_date: '2026-06-01'
	}));
	const lines = entries.flatMap((entry) => [
		{ entry_id: entry.id, account_id: 'cash', debit_cents: 100, credit_cents: 0 },
		{ entry_id: entry.id, account_id: 'donations', debit_cents: 0, credit_cents: 100 }
	]);
	const report = buildAccountingReportFromRows(
		[
			{ id: 'cash', kind: 'asset', normal_side: 'debit' },
			{ id: 'donations', kind: 'income', normal_side: 'credit' },
			{ id: 'equity', kind: 'equity', normal_side: 'credit' }
		],
		entries,
		lines,
		'2026-01-01',
		'2026-12-31'
	);

	assert.equal(report.totals.income_cents, entryCount * 100);
	assert.equal(report.totals.assets_cents, entryCount * 100);
	assert.equal(report.totals.equity_cents, entryCount * 100);
});

test('budget actual windows always use the selected calendar year', () => {
	assert.deepEqual(budgetActualWindow(2025, '2026-06-15'), {
		from: '2025-01-01',
		to: '2025-12-31'
	});
	assert.deepEqual(budgetActualWindow(2026, '2026-06-15'), {
		from: '2026-01-01',
		to: '2026-06-15'
	});
	assert.deepEqual(budgetActualWindow(2027, '2026-06-15'), {
		from: '2027-01-01',
		to: null
	});
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
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 2500,
						credit_cents: 0,
						account: { kind: 'asset' }
					}
				]
			},
			{
				id: 'entry_best',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 2500,
						credit_cents: 0,
						account: { kind: 'asset' }
					}
				]
			},
			{
				id: 'entry_wrong_amount',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2600,
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 2600,
						credit_cents: 0,
						account: { kind: 'asset' }
					}
				]
			},
			{
				id: 'entry_already_used',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Coffee ride deposit',
				amount_cents: 2500,
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 2500,
						credit_cents: 0,
						account: { kind: 'asset' }
					}
				]
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
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 0,
						credit_cents: 4200,
						account: { kind: 'asset' }
					}
				]
			},
			{
				id: 'entry_used_elsewhere',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Permit fee',
				amount_cents: 4200,
				lines: [
					{
						account_id: 'cash_1',
						debit_cents: 0,
						credit_cents: 4200,
						account: { kind: 'asset' }
					}
				]
			}
		],
		['entry_current', 'entry_used_elsewhere']
	);

	assert.deepEqual(
		item.match_candidates.map((candidate) => candidate.id),
		['entry_current']
	);
});

test('a transfer entry remains a candidate for its other cash account', () => {
	const [item] = buildFeedItemsWithMatchCandidates(
		[
			{
				id: 'feed_savings',
				transaction_date: '2026-06-10',
				description: 'Transfer from checking',
				amount_cents: 5000,
				currency: 'usd',
				account_id: 'savings'
			}
		],
		[
			{
				id: 'transfer_1',
				status: 'posted',
				entry_date: '2026-06-10',
				description: 'Move to savings',
				amount_cents: 5000,
				currency: 'usd',
				lines: [
					{
						account_id: 'checking',
						debit_cents: 0,
						credit_cents: 5000,
						account: { kind: 'asset' }
					},
					{
						account_id: 'savings',
						debit_cents: 5000,
						credit_cents: 0,
						account: { kind: 'asset' }
					}
				]
			}
		],
		[{ matched_entry_id: 'transfer_1', account_id: 'checking' }]
	);

	assert.deepEqual(
		item.match_candidates.map((candidate) => candidate.id),
		['transfer_1']
	);
});
