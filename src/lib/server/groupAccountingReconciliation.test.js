import assert from 'node:assert/strict';
import test from 'node:test';
import { closeReconciliation, saveReconciliationDraft } from './groupAccountingReconciliation.js';

const groupId = '8c1526c9-8409-4c99-afac-166f25b7f898';
const accountId = 'aafeb5b6-7cc1-458a-8f4a-b3b787692a34';
const reconciliationId = 'a3a5a49e-1bc3-45a8-b54a-4f0d2fb79342';

function authForReconciliation({ mode = 'balance_only', onRpc = () => ({}) } = {}) {
	const query = (data) => {
		const builder = {
			select: () => builder,
			eq: () => builder,
			maybeSingle: async () => ({ data, error: null })
		};
		return builder;
	};
	return {
		group: { id: groupId },
		userId: 'ec3101f2-1e0c-48c7-b85a-ef032486747e',
		serviceSupabase: {
			from(table) {
				if (table === 'group_accounting_accounts') {
					return query({ id: accountId, kind: 'asset', normal_side: 'debit' });
				}
				if (table === 'group_accounting_reconciliations') {
					return query({ id: reconciliationId, status: 'draft', verification_mode: mode });
				}
				if (table === 'group_accounting_settings') return query({ currency: 'USD' });
				throw new Error(`Unexpected table ${table}`);
			},
			rpc(name, args) {
				onRpc(name, args);
				return {
					data: {
						id: reconciliationId,
						status: name === 'group_accounting_close_reconciliation' ? 'completed' : 'draft',
						verification_mode: mode
					},
					error: null
				};
			}
		}
	};
}

function draftForm() {
	const form = new FormData();
	form.set('accountId', accountId);
	form.set('statementStartingDate', '2026-09-01');
	form.set('statementEndingDate', '2026-09-30');
	form.set('openingBalance', '100.00');
	form.set('statementEndingBalance', '125.00');
	form.set('statementCurrency', 'USD');
	form.set('statementLines', '[]');
	return form;
}

test('statement-line mode cannot save an empty extraction as verified', async () => {
	let called = false;
	const form = draftForm();
	form.set('verificationMode', 'statement_lines');
	form.set('statementLines', '[]');
	await assert.rejects(
		() => saveReconciliationDraft(authForReconciliation({ onRpc: () => (called = true) }), form),
		/Review or enter the statement lines/
	);
	assert.equal(called, false);
});

test('draft submission sends normalized cents and line evidence to the guarded RPC', async () => {
	let call;
	const form = draftForm();
	form.set('verificationMode', 'statement_lines');
	form.set(
		'statementLines',
		JSON.stringify([
			{
				transactionDate: '2026-09-10',
				description: 'Deposit',
				amountCents: 2500,
				resolution: 'pending'
			}
		])
	);
	await saveReconciliationDraft(
		authForReconciliation({ onRpc: (name, args) => (call = { name, args }) }),
		form
	);
	assert.equal(call.name, 'group_accounting_save_reconciliation_draft');
	assert.equal(call.args.p_opening_balance_cents, 10000);
	assert.equal(call.args.p_statement_balance_cents, 12500);
	assert.equal(call.args.p_statement_lines.length, 1);
	assert.equal(call.args.p_statement_lines[0].amountCents, 2500);
});

test('an uncertain extracted line can be preserved as an incomplete draft', async () => {
	let call;
	const form = draftForm();
	form.set('verificationMode', 'statement');
	form.set(
		'statementLines',
		JSON.stringify([
			{
				transactionDate: null,
				description: 'Unclear charge',
				amountCents: null,
				resolution: 'pending'
			}
		])
	);
	await saveReconciliationDraft(
		authForReconciliation({ onRpc: (name, args) => (call = { name, args }) }),
		form
	);
	assert.equal(call.args.p_statement_lines[0].transactionDate, null);
	assert.equal(call.args.p_statement_lines[0].amountCents, null);
});

test('balance-only draft preserves proposed feed and ledger selections for resume', async () => {
	let call;
	const feedId = 'fa9fe87d-4fe3-42f6-9836-4ca95d328ca1';
	const entryId = 'c7d67a30-f7ec-4e1d-a0f4-d7ab6e331649';
	const form = draftForm();
	form.set('verificationMode', 'balance_only');
	form.set('selectedFeedItemIds', `${feedId},${feedId}`);
	form.set('selectedLedgerEntryIds', entryId);
	await saveReconciliationDraft(
		authForReconciliation({ onRpc: (name, args) => (call = { name, args }) }),
		form
	);
	assert.deepEqual(call.args.p_selected_feed_item_ids, [feedId]);
	assert.deepEqual(call.args.p_selected_ledger_entry_ids, [entryId]);
});

test('a mislabeled uploaded statement is rejected before storage or database writes', async () => {
	let called = false;
	const form = draftForm();
	form.set('verificationMode', 'balance_only');
	form.set('statementFile', new File(['not-a-pdf'], 'statement.pdf', { type: 'application/pdf' }));
	await assert.rejects(
		() => saveReconciliationDraft(authForReconciliation({ onRpc: () => (called = true) }), form),
		/content does not match/
	);
	assert.equal(called, false);
});

test('balance-only close requires explicit attestation and cannot call the RPC without it', async () => {
	let called = false;
	const form = new FormData();
	form.set('reconciliationId', reconciliationId);
	await assert.rejects(
		() => closeReconciliation(authForReconciliation({ onRpc: () => (called = true) }), form),
		/balance-only reconciliation/
	);
	assert.equal(called, false);
});

test('verified close sends selected evidence only to the explicit close RPC', async () => {
	const calls = [];
	const feedId = 'fa9fe87d-4fe3-42f6-9836-4ca95d328ca1';
	const entryId = 'c7d67a30-f7ec-4e1d-a0f4-d7ab6e331649';
	const form = draftForm();
	form.set('reconciliationId', reconciliationId);
	form.set('verificationMode', 'statement');
	form.set(
		'statementLines',
		JSON.stringify([
			{
				transactionDate: '2026-09-10',
				description: 'Deposit',
				amountCents: 2500,
				resolution: 'matched',
				feedItemId: feedId,
				entryId
			}
		])
	);
	form.set('selectedFeedItemIds', feedId);
	form.set('selectedLedgerEntryIds', `${entryId},${entryId}`);
	await closeReconciliation(
		authForReconciliation({ mode: 'statement', onRpc: (name, args) => calls.push({ name, args }) }),
		form
	);
	const call = calls[1];
	assert.equal(calls[0].name, 'group_accounting_save_reconciliation_draft');
	assert.equal(call.name, 'group_accounting_close_reconciliation');
	assert.deepEqual(call.args.p_selected_feed_item_ids, [feedId]);
	assert.deepEqual(call.args.p_selected_ledger_entry_ids, [entryId]);
});

test('a statement line in another currency cannot be saved or closed', async () => {
	let called = false;
	const form = draftForm();
	form.set('verificationMode', 'statement');
	form.set(
		'statementLines',
		JSON.stringify([
			{ transactionDate: '2026-09-10', description: 'Deposit', amountCents: 2500, currency: 'EUR' }
		])
	);
	await assert.rejects(
		() => saveReconciliationDraft(authForReconciliation({ onRpc: () => (called = true) }), form),
		/currencies must match/
	);
	assert.equal(called, false);
});

test('close rejects an RPC result that is still a draft', async () => {
	const form = draftForm();
	form.set('reconciliationId', reconciliationId);
	form.set('verificationMode', 'statement');
	form.set(
		'statementLines',
		JSON.stringify([
			{
				transactionDate: '2026-09-10',
				description: 'Deposit',
				amountCents: 2500,
				resolution: 'matched'
			}
		])
	);
	const auth = authForReconciliation({ mode: 'statement' });
	const original = auth.serviceSupabase.rpc;
	auth.serviceSupabase.rpc = (name, args) =>
		name === 'group_accounting_close_reconciliation'
			? { data: { id: reconciliationId, status: 'draft' }, error: null }
			: original(name, args);
	await assert.rejects(() => closeReconciliation(auth, form), /remains a draft/);
});
