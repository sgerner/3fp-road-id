import assert from 'node:assert/strict';
import test from 'node:test';
import { accountingHistoryFilters, loadAccountingHistory } from './groupAccountingHistory.js';

test('history filters bound pages and reject invalid dates and account ids', () => {
	const result = accountingHistoryFilters(
		new URLSearchParams(
			'ledger_page=-1&receipt_page=999999999&ledger_from=2026-02-30&ledger_to=2026-02-28&ledger_account=bad&ledger_q=%20hello%20'
		)
	);
	assert.equal(result.ledger.page, 1);
	assert.equal(result.receipts.page, 100000);
	assert.equal(result.ledger.from, null);
	assert.equal(result.ledger.to, '2026-02-28');
	assert.equal(result.ledger.account, null);
	assert.equal(result.ledger.q, 'hello');
});

test('history pages clamp to the last page and account filters preserve complete journal lines', async () => {
	const calls = [];
	const group = '00000000-0000-0000-0000-000000000001';
	const account = '00000000-0000-0000-0000-000000000002';
	const db = {
		from(table) {
			const state = { table };
			const query = {};
			for (const method of ['select', 'eq', 'ilike', 'gte', 'lte', 'order'])
				query[method] = (...args) => {
					calls.push([table, method, ...args]);
					if (method === 'select') state.select = args[0];
					return query;
				};
			query.range = async (from, to) => {
				calls.push([table, 'range', from, to]);
				return {
					count: table === 'group_accounting_entries' ? 26 : 0,
					data:
						table === 'group_accounting_entries' && from === 25
							? [
									{
										id: 'entry',
										lines: [{ account_id: account }, { account_id: 'balancing-account' }],
										filter_lines: [{ account_id: account }]
									}
								]
							: [],
					error: null
				};
			};
			return query;
		}
	};
	const history = await loadAccountingHistory(
		db,
		group,
		new URLSearchParams(`ledger_page=100&ledger_account=${account}&ledger_q=50%25_`)
	);
	assert.equal(history.entries.page, 2);
	assert.equal(history.entries.total_pages, 2);
	assert.equal(history.entries.data[0].lines.length, 2);
	assert.equal('filter_lines' in history.entries.data[0], false);
	assert.ok(
		calls.some(
			([table, method, value]) =>
				table === 'group_accounting_entries' &&
				method === 'select' &&
				value.includes('filter_lines:group_accounting_lines!inner')
		)
	);
	assert.ok(
		calls.some(
			([table, method, key, value]) =>
				table === 'group_accounting_entries' &&
				method === 'ilike' &&
				key === 'description' &&
				value === '%50\\%\\_%'
		)
	);
	for (const table of [
		'group_accounting_entries',
		'group_accounting_receipts',
		'group_accounting_audit_events'
	])
		assert.ok(
			calls.some(([t, m, k, v]) => t === table && m === 'eq' && k === 'group_id' && v === group)
		);
});
