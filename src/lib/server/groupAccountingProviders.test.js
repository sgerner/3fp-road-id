import assert from 'node:assert/strict';
import test from 'node:test';
import {
	assertFinancialConnectionsSessionOwnership,
	dedupeRowsByKey,
	feedItemAmountCents,
	forEachStripeListItem,
	mercuryAccountPages,
	mercuryProviderAccountsFromTransactions,
	mercuryTransactionDate,
	mercuryTransactionPages,
	providerExternalAccountId,
	providerTransactionDate,
	redactMercurySensitiveFields,
	shouldImportFinancialConnectionsTransaction,
	shouldImportMercuryTransaction,
	shouldSyncBankProvider,
	stripeBalanceTransactionFeedRows
} from './groupAccountingProviders.js';

test('Mercury account mapping uses the owning account ID and never transaction kind', () => {
	const [account] = mercuryProviderAccountsFromTransactions([
		{
			id: 'txn-1',
			accountId: 'account-1234',
			kind: 'externalTransfer',
			currency: 'usd'
		}
	]);

	assert.equal(account.id, 'account-1234');
	assert.equal(account.type, null);
	assert.match(account.name, /1234$/);
	assert.equal(mercuryProviderAccountsFromTransactions([{ id: 'txn-without-account' }]).length, 0);
});

test('Mercury account metadata uses bank account kind over Mercury resource type', () => {
	const [account] = mercuryProviderAccountsFromTransactions([
		{
			id: 'txn-1',
			accountId: 'account-1',
			kind: 'debitCardTransaction',
			account: { id: 'account-1', type: 'mercury', kind: 'checking', name: 'Operating' }
		}
	]);

	assert.equal(account.type, 'checking');
	assert.equal(account.name, 'Operating');
});

test('provider transaction amounts preserve provider-specific polarity and cents', () => {
	assert.equal(feedItemAmountCents('mercury', { amount: -12.34 }), -1234);
	assert.equal(feedItemAmountCents('stripe_financial_connections', { amount_cents: -1234 }), -1234);
	assert.equal(feedItemAmountCents('stripe', { amount_cents: 2450 }), 2450);
});

test('Stripe balance feed splits fees into deterministic signed rows that reconcile to net', () => {
	const charge = {
		id: 'txn_charge_1',
		amount: 1050,
		fee: 50,
		net: 1000,
		created: 1_757_088_000,
		currency: 'usd',
		description: 'Donation'
	};
	const rows = stripeBalanceTransactionFeedRows(charge, 'acct_1');
	assert.deepEqual(
		rows.map((row) => [row.id, row.amount_cents]),
		[
			['txn_charge_1', 1050],
			['txn_charge_1:fee', -50]
		]
	);
	assert.equal(
		rows.reduce((sum, row) => sum + row.amount_cents, 0),
		charge.net
	);
	assert.equal(rows[0].account_id, 'acct_1');
	assert.equal(rows[1].raw.parent_transaction_id, charge.id);
	assert.deepEqual(stripeBalanceTransactionFeedRows(charge, 'acct_1'), rows);

	const refund = stripeBalanceTransactionFeedRows(
		{ ...charge, id: 'txn_refund_1', amount: -1050, fee: 0, net: -1050 },
		'acct_1'
	);
	assert.deepEqual(
		refund.map((row) => row.amount_cents),
		[-1050]
	);
	const payout = stripeBalanceTransactionFeedRows(
		{ ...charge, id: 'txn_payout_1', amount: -1000, fee: 0, net: -1000 },
		'acct_1'
	);
	assert.deepEqual(
		payout.map((row) => row.amount_cents),
		[-1000]
	);
	const feeRefund = stripeBalanceTransactionFeedRows(
		{ ...charge, id: 'txn_fee_refund', amount: 0, fee: -25, net: 25 },
		'acct_1'
	);
	assert.deepEqual(
		feeRefund.map((row) => [row.id, row.amount_cents]),
		[['txn_fee_refund:fee', 25]]
	);
	assert.equal(feeRefund[0].amount_cents, feeRefund[0].raw.balance_transaction.net);
	assert.throws(
		() => stripeBalanceTransactionFeedRows({ ...charge, net: 999 }, 'acct_1'),
		/amount, fee, and net do not reconcile/
	);
	assert.deepEqual(stripeBalanceTransactionFeedRows({ ...charge, amount: null }, 'acct_1'), []);
	assert.deepEqual(stripeBalanceTransactionFeedRows({ ...charge, created: null }, 'acct_1'), []);
	assert.deepEqual(stripeBalanceTransactionFeedRows({ ...charge, currency: null }, 'acct_1'), []);
});

test('provider transaction dates reject missing or malformed values instead of inventing today', () => {
	assert.equal(providerTransactionDate('2026-09-05T23:30:00-07:00'), '2026-09-05');
	assert.equal(providerTransactionDate(1_757_088_000), '2025-09-05');
	assert.equal(mercuryTransactionDate({ postedAt: '2026-04-12T10:00:00Z' }), '2026-04-12');
	assert.equal(providerTransactionDate('not-a-date'), null);
	assert.equal(mercuryTransactionDate({}), null);
});

test('provider status filters omit cancelled Mercury and non-posted Financial Connections rows', () => {
	assert.equal(shouldImportMercuryTransaction({ status: 'sent' }), true);
	assert.equal(shouldImportMercuryTransaction({ status: 'pending' }), false);
	assert.equal(shouldImportMercuryTransaction({ status: 'reversed' }), false);
	assert.equal(shouldImportMercuryTransaction({}), true);
	assert.equal(shouldImportFinancialConnectionsTransaction({ status: 'posted' }), true);
	assert.equal(shouldImportFinancialConnectionsTransaction({ status: 'pending' }), false);
	assert.equal(shouldImportFinancialConnectionsTransaction({ status: 'void' }), false);
});

test('sync all honors disabled and not-yet-connected provider connections', () => {
	assert.equal(shouldSyncBankProvider(null), false);
	assert.equal(shouldSyncBankProvider({ status: 'disabled' }), false);
	assert.equal(shouldSyncBankProvider({ status: 'setup_needed' }), false);
	assert.equal(shouldSyncBankProvider({ status: 'connected' }), true);
	assert.equal(shouldSyncBankProvider({ status: 'error' }), true);
});

test('provider account IDs do not fall back to exposing full bank account numbers', () => {
	assert.equal(providerExternalAccountId({ id: 'account-1', number: '123456789012' }), 'account-1');
	assert.equal(providerExternalAccountId({ number: '123456789012' }), '');
});

test('Mercury raw account data redacts full account and routing numbers while retaining masks', () => {
	assert.deepEqual(
		redactMercurySensitiveFields({
			id: 'account-1',
			accountNumber: '123456789012',
			routingNumber: '021000021',
			mask: '•••• 9012',
			details: [{ iban: 'GB00SECRET' }]
		}),
		{
			id: 'account-1',
			accountNumber: null,
			routingNumber: null,
			mask: '•••• 9012',
			details: [{ iban: null }]
		}
	);
});

test('Financial Connections completion rejects another group’s session or stale Stripe account', () => {
	const pendingConnection = {
		group_id: 'group-a',
		provider: 'stripe_financial_connections',
		external_id: 'fcsess-a',
		config: { connected_account_id: 'acct-a' }
	};
	const validInput = {
		pendingConnection,
		sessionId: 'fcsess-a',
		groupId: 'group-a',
		connectedAccountId: 'acct-a',
		sessionHolderAccountId: 'acct-a'
	};

	assert.doesNotThrow(() => assertFinancialConnectionsSessionOwnership(validInput));
	assert.throws(
		() => assertFinancialConnectionsSessionOwnership({ ...validInput, groupId: 'group-b' }),
		/session is not pending for this group/
	);
	assert.throws(
		() => assertFinancialConnectionsSessionOwnership({ ...validInput, sessionId: 'fcsess-b' }),
		/session is not pending for this group/
	);
	assert.throws(
		() =>
			assertFinancialConnectionsSessionOwnership({ ...validInput, connectedAccountId: 'acct-b' }),
		/Stripe account changed/
	);
	assert.throws(
		() =>
			assertFinancialConnectionsSessionOwnership({
				...validInput,
				sessionHolderAccountId: 'acct-b'
			}),
		/belongs to a different Stripe account/
	);
});

test('Mercury account and transaction pagination follows cursors across every page', async () => {
	const accountQueries = [];
	const accounts = [];
	for await (const page of mercuryAccountPages(async (query) => {
		accountQueries.push(query);
		if (!query.start_after) {
			return {
				accounts: [{ id: 'account-1' }, { id: 'account-2' }],
				page: { nextPage: 'account-2' }
			};
		}
		return { accounts: [{ id: 'account-3' }], page: { nextPage: null } };
	}, 2)) {
		accounts.push(...page);
	}
	assert.deepEqual(
		accounts.map((row) => row.id),
		['account-1', 'account-2', 'account-3']
	);
	assert.deepEqual(accountQueries, [
		{ limit: 2, order: 'asc' },
		{ limit: 2, order: 'asc', start_after: 'account-2' }
	]);

	const transactionQueries = [];
	const transactions = [];
	for await (const page of mercuryTransactionPages(async (query) => {
		transactionQueries.push(query);
		if (!query.start_after) {
			return {
				transactions: [{ id: 'txn-1' }, { id: 'txn-2' }],
				page: { nextPage: 'txn-2' }
			};
		}
		return { transactions: [{ id: 'txn-3' }], page: { nextPage: null } };
	}, 2)) {
		transactions.push(...page);
	}
	assert.deepEqual(
		transactions.map((row) => row.id),
		['txn-1', 'txn-2', 'txn-3']
	);
	assert.deepEqual(transactionQueries, [
		{ limit: 2, order: 'asc' },
		{ limit: 2, order: 'asc', start_after: 'txn-2' }
	]);
});

test('Stripe API list sync iterates beyond the first page', async () => {
	const seen = [];
	const listPromise = {
		async autoPagingEach(handler) {
			for (const item of [{ id: 'txn-1' }, { id: 'txn-2' }, { id: 'txn-3' }]) {
				await handler(item);
			}
		}
	};
	await forEachStripeListItem(listPromise, (item) => seen.push(item.id));
	assert.deepEqual(seen, ['txn-1', 'txn-2', 'txn-3']);
});

test('duplicate provider rows dedupe by transaction identity', () => {
	assert.deepEqual(
		dedupeRowsByKey(
			[
				{ source_transaction_id: 'same', amount_cents: 100 },
				{ source_transaction_id: 'same', amount_cents: 200 },
				{ source_transaction_id: 'other', amount_cents: 300 }
			],
			'source_transaction_id'
		),
		[
			{ source_transaction_id: 'same', amount_cents: 200 },
			{ source_transaction_id: 'other', amount_cents: 300 }
		]
	);
});
