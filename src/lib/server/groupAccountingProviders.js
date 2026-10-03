import { cleanText } from './groupAccountingRules.js';

export function providerExternalAccountId(account = {}) {
	return cleanText(
		account.account_id ||
			account.accountId ||
			account.bankAccountId ||
			account.creditAccountId ||
			account.debitAccountId ||
			account.cardAccountId ||
			account.cardId ||
			account.account?.id ||
			account.account?.uuid ||
			account.id ||
			account.uuid
	);
}

export function feedTransactionId(transaction = {}) {
	return cleanText(
		transaction.source_transaction_id ||
			transaction.transaction_id ||
			transaction.transactionId ||
			transaction.id
	);
}

export function stripeBalanceTransactionFeedRows(item = {}, connectedAccountId = '') {
	if (item.amount === null || item.amount === undefined || item.amount === '') return [];
	const amount = Number(item.amount);
	if (
		item.fee === '' ||
		(item.fee !== undefined && item.fee !== null && !Number.isSafeInteger(Number(item.fee)))
	) {
		return [];
	}
	const fee = Number(item.fee ?? 0);
	const net = item.net === undefined || item.net === null ? amount - fee : Number(item.net);
	const id = cleanText(item.id);
	const date = providerTransactionDate(item.created);
	const currency = cleanText(item.currency).toLowerCase();
	if (
		!id ||
		!date ||
		!/^[a-z]{3}$/.test(currency) ||
		!Number.isSafeInteger(amount) ||
		!Number.isSafeInteger(fee) ||
		!Number.isSafeInteger(net)
	) {
		return [];
	}
	if (amount - fee !== net) {
		throw new Error(`Stripe balance transaction ${id} amount, fee, and net do not reconcile.`);
	}
	const description = item.description || item.type || 'Stripe balance activity';
	const rows = [];
	if (amount !== 0) {
		rows.push({
			id,
			account_id: connectedAccountId,
			date,
			description,
			amount_cents: amount,
			currency,
			raw: item
		});
	}
	if (fee !== 0) {
		rows.push({
			id: `${id}:fee`,
			account_id: connectedAccountId,
			date,
			description: `${description} · Stripe processing fee`,
			amount_cents: -fee,
			currency,
			raw: { component: 'fee', parent_transaction_id: id, balance_transaction: item }
		});
	}
	return rows;
}

export function dedupeRowsByKey(rows = [], key) {
	const deduped = new Map();
	for (const row of rows) {
		const value = row?.[key];
		if (!value) continue;
		deduped.set(value, row);
	}
	return Array.from(deduped.values());
}

function firstCleanText(values = [], limit = 200) {
	for (const value of values) {
		const cleaned = cleanText(value, limit);
		if (cleaned) return cleaned;
	}
	return '';
}

export function mercuryTransactionDescription(transaction = {}) {
	return (
		firstCleanText(
			[
				transaction.counterpartyName,
				transaction.counterparty_name,
				transaction.merchantName,
				transaction.merchant_name,
				transaction.bankDescription,
				transaction.bank_description,
				transaction.externalMemo,
				transaction.external_memo,
				transaction.note,
				transaction.memo,
				transaction.description,
				transaction.name
			],
			200
		) || 'Mercury activity'
	);
}

export function mercuryTransactionAccountId(transaction = {}) {
	return firstCleanText([
		transaction.accountId,
		transaction.account_id,
		transaction.bankAccountId,
		transaction.creditAccountId,
		transaction.debitAccountId,
		transaction.cardAccountId,
		transaction.account?.id,
		transaction.account?.uuid
	]);
}

export function mercuryProviderAccountsFromTransactions(transactions = []) {
	const accounts = new Map();
	for (const transaction of transactions) {
		const externalAccountId = mercuryTransactionAccountId(transaction);
		if (!externalAccountId || accounts.has(externalAccountId)) continue;
		const account =
			transaction.account && typeof transaction.account === 'object' ? transaction.account : {};
		const mask = firstCleanText([
			account.mask,
			transaction.mask,
			transaction.lastFour,
			transaction.last_four,
			transaction.lastFourDigits
		]);
		const displayName = firstCleanText([
			account.name,
			account.nickname,
			transaction.accountName,
			transaction.account_name,
			transaction.cardName,
			transaction.card_name,
			transaction.creditAccountName,
			transaction.credit_account_name
		]);
		accounts.set(externalAccountId, {
			...account,
			id: externalAccountId,
			name:
				displayName ||
				(mask
					? `Mercury account ending ${mask}`
					: `Mercury account · ${externalAccountId.slice(-4)}`),
			// Transaction `kind` describes the transaction (for example, externalTransfer),
			// not the bank account. Keep the account type unknown unless account metadata says otherwise.
			type:
				firstCleanText([account.kind, account.accountType, account.account_type, account.type]) ||
				null,
			subtype:
				firstCleanText([account.subtype, account.accountSubtype, account.account_subtype]) || null,
			mask: mask || null,
			currency: account.currency || transaction.currency
		});
	}
	return Array.from(accounts.values());
}

export function feedItemAmountCents(provider, transaction = {}) {
	if (Number.isInteger(transaction.amount_cents)) return transaction.amount_cents;
	const amount = Number(transaction.amount ?? 0);
	if (provider === 'mercury') return Math.round(amount * 100);
	return Math.round(amount * -100);
}

export function feedItemDescription(provider, transaction = {}) {
	if (provider === 'mercury') return mercuryTransactionDescription(transaction);
	return cleanText(
		transaction.name || transaction.description || transaction.memo || 'Imported activity',
		200
	);
}

export function stripeFinancialConnectionsBalance(account = {}) {
	const current = account.balance?.current;
	const currencies = current && typeof current === 'object' ? Object.keys(current) : [];
	const currency =
		currencies.length === 1
			? currencies[0].toLowerCase()
			: cleanText(account.currency || 'usd').toLowerCase();
	if (currencies.length !== 1) {
		return { currency, currentBalanceCents: null, availableBalanceCents: null };
	}
	const currentCents = current[currencies[0]];
	const availableCents = account.balance?.cash?.available?.[currencies[0]];
	return {
		currency,
		currentBalanceCents:
			Number.isSafeInteger(currentCents) && Math.abs(currentCents) <= 2_147_483_647
				? currentCents
				: null,
		availableBalanceCents:
			Number.isSafeInteger(availableCents) && Math.abs(availableCents) <= 2_147_483_647
				? availableCents
				: null
	};
}

export function providerTransactionDate(value) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
		const date = new Date(milliseconds);
		return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
	}
	const raw = cleanText(value);
	if (!raw) return null;
	const dateString = raw.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
	const date = new Date(`${dateString}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateString
		? null
		: dateString;
}

const SENSITIVE_MERCURY_FIELD = /account.?number|routing.?number|iban|swift.?code|token|secret/i;

export function redactMercurySensitiveFields(value) {
	if (Array.isArray(value)) return value.map(redactMercurySensitiveFields);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, fieldValue]) => [
			key,
			SENSITIVE_MERCURY_FIELD.test(key) ? null : redactMercurySensitiveFields(fieldValue)
		])
	);
}

export function mercuryTransactionDate(transaction = {}) {
	return providerTransactionDate(
		transaction.postedAt ||
			transaction.posted_at ||
			transaction.date ||
			transaction.createdAt ||
			transaction.created_at ||
			transaction.created
	);
}

export function shouldImportMercuryTransaction(transaction = {}) {
	const status = cleanText(transaction.status).toLowerCase();
	return !['pending', 'cancelled', 'failed', 'reversed', 'blocked'].includes(status);
}

export function shouldImportFinancialConnectionsTransaction(transaction = {}) {
	return cleanText(transaction.status).toLowerCase() === 'posted';
}

export function shouldSyncBankProvider(connection) {
	return Boolean(
		connection && !['disabled', 'setup_needed'].includes(cleanText(connection.status))
	);
}

export function shouldScheduleMercurySync(settings, connection) {
	return Boolean(
		settings?.mercury_sync_enabled === true &&
		cleanText(settings?.mercury_api_key_ciphertext) &&
		connection?.status !== 'disabled'
	);
}

export function financialConnectionsRefreshState(account = {}) {
	const refresh = account.transaction_refresh ?? account.transactionRefresh ?? null;
	const status = cleanText(refresh?.status).toLowerCase();
	const asIsoTime = (value) => {
		const seconds = Number(value);
		return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
	};
	const nextRefreshAt = asIsoTime(
		refresh?.next_refresh_available_at ?? refresh?.nextRefreshAvailableAt
	);
	if (status === 'pending') return { status: 'pending', refreshAt: null, nextRefreshAt };
	if (status === 'failed') return { status: 'failed', refreshAt: null, nextRefreshAt };
	if (status === 'succeeded') {
		const refreshAt = asIsoTime(refresh?.last_attempted_at ?? refresh?.lastAttemptedAt);
		return { status: 'succeeded', refreshAt, nextRefreshAt };
	}
	return { status: 'not_requested', refreshAt: null, nextRefreshAt };
}

export function providerFeedFactsChanged(existing = {}, incoming = {}) {
	return (
		existing.transaction_date !== incoming.transaction_date ||
		existing.description !== incoming.description ||
		existing.amount_cents !== incoming.amount_cents ||
		cleanText(existing.currency).toLowerCase() !== cleanText(incoming.currency).toLowerCase()
	);
}

export function assertFinancialConnectionsSessionOwnership({
	pendingConnection,
	sessionId,
	groupId,
	connectedAccountId,
	sessionHolderAccountId = ''
}) {
	if (
		!pendingConnection ||
		pendingConnection.group_id !== groupId ||
		pendingConnection.provider !== 'stripe_financial_connections' ||
		pendingConnection.external_id !== sessionId
	) {
		throw new Error(
			'This Financial Connections session is not pending for this group. Start a new connection.'
		);
	}
	if (
		!connectedAccountId ||
		pendingConnection.config?.connected_account_id !== connectedAccountId
	) {
		throw new Error(
			'The group’s Stripe account changed during bank linking. Start a new connection.'
		);
	}
	if (sessionHolderAccountId && sessionHolderAccountId !== connectedAccountId) {
		throw new Error('The selected bank-link session belongs to a different Stripe account.');
	}
}

export async function* mercuryAccountPages(fetchPage, pageSize = 1000) {
	let cursor = null;
	const seenCursors = new Set();
	while (true) {
		const query = { limit: pageSize, order: 'asc' };
		if (cursor) query.start_after = cursor;
		const payload = await fetchPage(query);
		const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
		yield accounts;
		if (accounts.length < pageSize) return;
		const nextCursor = cleanText(
			payload?.page?.nextPage || payload?.page?.next_page || accounts.at(-1)?.id
		);
		if (!nextCursor || seenCursors.has(nextCursor)) {
			throw new Error('Mercury account pagination did not advance.');
		}
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
}

export async function* mercuryTransactionPages(fetchPage, pageSize = 1000) {
	let cursor = null;
	const seenCursors = new Set();
	while (true) {
		const query = { limit: pageSize, order: 'asc' };
		if (cursor) query.start_after = cursor;
		const payload = await fetchPage(query);
		const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
		yield transactions;
		if (transactions.length < pageSize) return;
		const nextCursor = cleanText(
			payload?.page?.nextPage || payload?.page?.next_page || feedTransactionId(transactions.at(-1))
		);
		if (!nextCursor || seenCursors.has(nextCursor)) {
			throw new Error('Mercury transaction pagination did not advance.');
		}
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
}

export async function forEachStripeListItem(listPromise, handler) {
	if (typeof listPromise?.autoPagingEach === 'function') {
		await listPromise.autoPagingEach(handler);
		return;
	}
	const page = await listPromise;
	for (const item of page?.data ?? []) await handler(item);
}
