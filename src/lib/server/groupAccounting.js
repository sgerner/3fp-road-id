import path from 'node:path';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { decryptSocialToken, encryptSocialToken } from '$lib/server/social/crypto';
import { getStripeClient, getStripePublishableKey } from '$lib/server/stripe';
import {
	centsFromAmount,
	centsFromAmountAndDirection,
	centsFromSignedAmount,
	cleanText,
	csvEscape,
	buildBankFeedEntryLines,
	buildFeedItemsWithMatchCandidates,
	buildAccountingReportFromRows,
	budgetActualWindow,
	buildCsvSourceIds,
	dateDeltaDays,
	fetchAllRows,
	fiscalYearStartYear,
	fiscalYearWindow,
	isValidAccountingDate,
	normalizedMatchText,
	normalizeBankDate,
	parseCsvRows,
	slugify,
	uniquePublicReportSlug
} from './groupAccountingRules.js';
import { loadGroupStripeConnection } from './groupStripeConnection.js';
import { loadAccountingHistory, loadAccountingSetupProgress } from './groupAccountingHistory.js';
import {
	assertFinancialConnectionsSessionOwnership,
	dedupeRowsByKey,
	feedItemAmountCents,
	feedItemDescription,
	feedTransactionId,
	forEachStripeListItem,
	mercuryAccountPages,
	mercuryProviderAccountsFromTransactions,
	mercuryTransactionDate,
	mercuryTransactionAccountId,
	mercuryTransactionPages,
	providerExternalAccountId,
	providerTransactionDate,
	redactMercurySensitiveFields,
	shouldImportFinancialConnectionsTransaction,
	shouldImportMercuryTransaction,
	shouldSyncBankProvider,
	shouldScheduleMercurySync,
	financialConnectionsRefreshState,
	stripeBalanceTransactionFeedRows,
	stripeFinancialConnectionsBalance
} from './groupAccountingProviders.js';
import { withProviderSync } from './groupAccountingSync.js';
import { buildPublicAccountingSnapshot } from './groupAccountingPublic.js';
import { fetchPublicHttp } from './security.js';

export const GROUP_ACCOUNTING_RECEIPT_BUCKET = 'group-accounting-receipts';

const DEFAULT_ACCOUNTS = [
	[
		'1000',
		'Checking',
		'asset',
		'bank',
		'debit',
		'Where money lives',
		'Primary bank account',
		true,
		10
	],
	['1010', 'Savings', 'asset', 'bank', 'debit', 'Where money lives', 'Reserve account', true, 20],
	['1020', 'Cash Box', 'asset', 'cash', 'debit', 'Where money lives', 'Cash on hand', true, 30],
	[
		'1030',
		'Stripe Balance',
		'asset',
		'processor_balance',
		'debit',
		'Where money lives',
		'Funds waiting to pay out from Stripe',
		true,
		40
	],
	[
		'2000',
		'Reimbursements Owed',
		'liability',
		'reimbursement',
		'credit',
		'What we owe',
		'Approved reimbursements not yet paid',
		true,
		100
	],
	[
		'2010',
		'Credit Card',
		'liability',
		'credit_card',
		'credit',
		'What we owe',
		'Group credit card balance',
		true,
		110
	],
	[
		'3000',
		'Opening Balance',
		'equity',
		'opening_balance',
		'credit',
		'Group balance',
		'Starting money entered when setup begins',
		true,
		150
	],
	[
		'4000',
		'Donations',
		'income',
		'donations',
		'credit',
		'Money in',
		'General donations',
		true,
		200
	],
	['4010', 'Membership Dues', 'income', 'dues', 'credit', 'Money in', 'Member payments', true, 210],
	['4020', 'Grants', 'income', 'grants', 'credit', 'Money in', 'Grant funding', true, 220],
	[
		'4030',
		'Sponsorships',
		'income',
		'sponsorships',
		'credit',
		'Money in',
		'Sponsor support',
		true,
		230
	],
	[
		'4040',
		'Merch Sales',
		'income',
		'merch',
		'credit',
		'Money in',
		'Merchandise revenue',
		true,
		240
	],
	[
		'4050',
		'Event Income',
		'income',
		'events',
		'credit',
		'Money in',
		'Ride or event income',
		true,
		250
	],
	['5000', 'Events', 'expense', 'events', 'debit', 'Money out', 'Event costs', true, 300],
	['5010', 'Supplies', 'expense', 'supplies', 'debit', 'Money out', 'General supplies', true, 310],
	[
		'5020',
		'Insurance',
		'expense',
		'insurance',
		'debit',
		'Money out',
		'Insurance and filings',
		true,
		320
	],
	[
		'5030',
		'Software',
		'expense',
		'software',
		'debit',
		'Money out',
		'Online tools and subscriptions',
		true,
		330
	],
	[
		'5040',
		'Printing',
		'expense',
		'printing',
		'debit',
		'Money out',
		'Flyers, signs, and printed materials',
		true,
		340
	],
	[
		'5050',
		'Advocacy',
		'expense',
		'advocacy',
		'debit',
		'Money out',
		'Campaign and outreach costs',
		true,
		350
	],
	[
		'5060',
		'Bank Fees',
		'expense',
		'fees',
		'debit',
		'Money out',
		'Bank and processor fees',
		true,
		360
	],
	[
		'5090',
		'Other Expenses',
		'expense',
		'other',
		'debit',
		'Money out',
		'Anything that does not fit elsewhere',
		true,
		390
	]
];

function currentYear() {
	return new Date().getFullYear();
}

function dateOnly(value) {
	const raw = cleanText(value);
	if (!raw) return new Date().toISOString().slice(0, 10);
	const date = raw.slice(0, 10);
	if (!isValidAccountingDate(date)) throw new Error('Enter a valid date.');
	return date;
}

function requiredDateOnly(value, label) {
	if (!cleanText(value)) throw new Error(`${label} is required.`);
	return dateOnly(value);
}

function isoDateFromParts(year, monthIndex, day) {
	return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isoDateFromDate(date) {
	return isoDateFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonthIso(date) {
	return isoDateFromParts(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonthIso(date) {
	return isoDateFromDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

const ACCOUNTING_REPORT_PERIOD_LABELS = {
	this_month: 'This month',
	last_month: 'Last month',
	this_quarter: 'This quarter',
	last_quarter: 'Last quarter',
	this_year: 'This fiscal year',
	last_year: 'Last fiscal year',
	custom: 'Custom range'
};

export function resolveAccountingReportWindow(url, now = new Date(), fiscalYearStartMonth = 1) {
	const period = cleanText(url?.searchParams?.get('period'), 40) || 'this_year';
	const today = isoDateFromDate(now);
	const currentDate = new Date(`${today}T12:00:00`);
	const currentYear = currentDate.getFullYear();
	const currentMonth = currentDate.getMonth();
	const currentFiscalYear = fiscalYearStartYear(today, fiscalYearStartMonth);
	const currentFiscalWindow = fiscalYearWindow(currentFiscalYear, fiscalYearStartMonth);
	const previousFiscalWindow = fiscalYearWindow(currentFiscalYear - 1, fiscalYearStartMonth);
	const quarterOffset = (currentMonth - (fiscalYearStartMonth - 1) + 12) % 12;
	const quarterMonth = (fiscalYearStartMonth - 1 + Math.floor(quarterOffset / 3) * 3) % 12;
	const quarterYear = quarterMonth > currentMonth ? currentYear - 1 : currentYear;
	const currentQuarterStart = new Date(quarterYear, quarterMonth, 1);
	const previousQuarterStart = new Date(quarterYear, quarterMonth - 3, 1);

	switch (period) {
		case 'this_month':
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: startOfMonthIso(currentDate),
				to: today
			};
		case 'last_month': {
			const lastMonth = new Date(currentYear, currentMonth, 0);
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: startOfMonthIso(lastMonth),
				to: endOfMonthIso(lastMonth)
			};
		}
		case 'this_quarter':
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: isoDateFromParts(
					currentQuarterStart.getFullYear(),
					currentQuarterStart.getMonth(),
					1
				),
				to: today
			};
		case 'last_quarter': {
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: isoDateFromParts(
					previousQuarterStart.getFullYear(),
					previousQuarterStart.getMonth(),
					1
				),
				to: isoDateFromDate(
					new Date(previousQuarterStart.getFullYear(), previousQuarterStart.getMonth() + 3, 0)
				)
			};
		}
		case 'last_year': {
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: previousFiscalWindow.from,
				to: previousFiscalWindow.to
			};
		}
		case 'custom': {
			const fromValue = cleanText(url?.searchParams?.get('from'));
			const toValue = cleanText(url?.searchParams?.get('to'));
			const from = fromValue ? dateOnly(fromValue) : currentFiscalWindow.from;
			const to = toValue ? dateOnly(toValue) : today;
			if (from > to) throw new Error('The report start date must be on or before the end date.');
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from,
				to
			};
		}
		case 'this_year':
		default:
			return {
				period: 'this_year',
				label: ACCOUNTING_REPORT_PERIOD_LABELS.this_year,
				from: currentFiscalWindow.from,
				to: today
			};
	}
}

function normalizeCurrency(value) {
	return cleanText(value || 'usd').toLowerCase() || 'usd';
}

function requireGroupCurrency(value, groupCurrency) {
	const currency = normalizeCurrency(value || groupCurrency);
	const baseCurrency = normalizeCurrency(groupCurrency);
	if (!/^[a-z]{3}$/.test(baseCurrency))
		throw new Error('The group accounting currency is invalid.');
	if (!/^[a-z]{3}$/.test(currency)) throw new Error('Choose a valid three-letter currency code.');
	if (currency !== baseCurrency) {
		throw new Error(
			`This group's books use ${baseCurrency.toUpperCase()}; currency conversion is not supported.`
		);
	}
	return baseCurrency;
}

function feedAccountForMatchedEntry(item, entry, accounts, requestedAccountId = '') {
	const expectedAmount = Number(item.amount_cents);
	const matchingLines = (entry.lines ?? []).filter((line) => {
		const account = accounts.find((candidate) => candidate.id === line.account_id);
		return (
			account &&
			['asset', 'liability'].includes(account.kind) &&
			Number(line.debit_cents || 0) - Number(line.credit_cents || 0) === expectedAmount
		);
	});
	const accountId = requestedAccountId || item.account_id;
	if (accountId) {
		if (!matchingLines.some((line) => line.account_id === accountId)) {
			throw new Error('Choose the cash account that matches this bank activity.');
		}
		return accountId;
	}
	if (matchingLines.length !== 1)
		throw new Error('Choose the cash account that matches this bank activity.');
	return matchingLines[0].account_id;
}

function normalizeVisibility(value = {}) {
	return {
		activity: value.activity !== false,
		position: value.position !== false,
		budgets: value.budgets === true,
		cash: value.cash !== false,
		notes: value.notes !== false
	};
}

async function auditEvent(
	auth,
	eventType,
	entityType,
	entityId,
	beforeJson,
	afterJson,
	metadata = {}
) {
	await auth.serviceSupabase.from('group_accounting_audit_events').insert({
		group_id: auth.group.id,
		actor_user_id: auth.userId ?? null,
		event_type: eventType,
		entity_type: entityType,
		entity_id: entityId ?? null,
		before_json: beforeJson ?? null,
		after_json: afterJson ?? null,
		metadata
	});
}

async function fetchJson(url, options = {}) {
	const target = new URL(url);
	const response = await fetchPublicHttp(
		target.toString(),
		{
			...options,
			headers: {
				'content-type': 'application/json',
				...(options.headers ?? {})
			}
		},
		{
			timeoutMs: 20_000,
			maxRedirects: 0,
			maxResponseBytes: 8 * 1024 * 1024,
			allowedHosts: [target.hostname]
		}
	);
	if (!response) throw new Error('Mercury relay request was blocked or timed out.');
	const raw = await response.text().catch(() => '');
	let payload = {};
	try {
		payload = raw ? JSON.parse(raw) : {};
	} catch {
		payload = {};
	}
	if (!response.ok) {
		throw new Error(
			payload?.error_message || payload?.message || `Request failed (${response.status})`
		);
	}
	return payload;
}

function encryptMercuryRelayKey(apiKey) {
	const key = Buffer.from(env.MERCURY_RELAY_ENCRYPTION_KEY_B64 || '', 'base64');
	if (key.length !== 32) {
		throw new Error('MERCURY_RELAY_ENCRYPTION_KEY_B64 must be a base64 encoded 32-byte key.');
	}
	const iv = randomBytes(16);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	let encrypted = cipher.update(apiKey, 'utf8', 'base64');
	encrypted += cipher.final('base64');
	return Buffer.from(
		JSON.stringify({
			iv: iv.toString('base64'),
			authTag: cipher.getAuthTag().toString('base64'),
			data: encrypted
		})
	).toString('base64');
}

async function mercuryRelayRequest(auth, connection, apiKey, mercury) {
	const relayUrl = cleanText(env.MERCURY_RELAY_URL, 500);
	const sharedSecret = env.MERCURY_RELAY_SHARED_SECRET;
	if (!relayUrl) throw new Error('MERCURY_RELAY_URL is not configured.');
	if (!sharedSecret) throw new Error('MERCURY_RELAY_SHARED_SECRET is not configured.');

	const url = new URL(relayUrl);
	if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
		throw new Error('MERCURY_RELAY_URL must be a public HTTPS endpoint.');
	}
	const timestamp = String(Date.now());
	const nonce = randomBytes(16).toString('hex');
	const body = JSON.stringify({
		company_id: auth.group.id,
		connection_id: connection?.id ?? null,
		encrypted_key: encryptMercuryRelayKey(apiKey),
		mercury
	});
	const signaturePayload = `${timestamp}.${nonce}.POST.${url.pathname}.${body}`;
	const signature = createHmac('sha256', sharedSecret).update(signaturePayload).digest('hex');

	return fetchJson(url.toString(), {
		method: 'POST',
		headers: {
			'x-relay-timestamp': timestamp,
			'x-relay-nonce': nonce,
			'x-relay-signature': signature
		},
		body
	});
}

function classifyReceipt(fileName = '', mimeType = '') {
	const name = fileName.toLowerCase();
	const classification = {
		document_type: 'receipt',
		confidence: 0.45,
		source: 'filename'
	};
	if (name.includes('invoice')) {
		classification.document_type = 'invoice';
		classification.confidence = 0.6;
	}
	if (name.includes('insurance')) classification.suggested_subtype = 'insurance';
	if (name.includes('software') || name.includes('subscription'))
		classification.suggested_subtype = 'software';
	if (name.includes('print') || name.includes('flyer'))
		classification.suggested_subtype = 'printing';
	if (name.includes('event') || name.includes('ride')) classification.suggested_subtype = 'events';
	if (mimeType.includes('pdf')) classification.file_kind = 'pdf';
	if (mimeType.includes('image')) classification.file_kind = 'image';
	return classification;
}

function slugFileName(value) {
	const ext = path.extname(value || '').toLowerCase();
	const base = path.basename(value || 'receipt', ext);
	const slug = base
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return `${slug || 'receipt'}${ext || ''}`;
}

export function formatCents(cents, currency = 'usd') {
	const amount = Number(cents || 0) / 100;
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency.toUpperCase()
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

export async function requireGroupAccountingManager(cookies, groupSlug) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return { ok: false, status: 500, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
	}

	const slug = cleanText(groupSlug);
	const { data: group, error: groupError } = await requestSupabase
		.from('groups')
		.select('id,slug,name')
		.eq('slug', slug)
		.maybeSingle();

	if (groupError) return { ok: false, status: 500, error: groupError.message };
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const { data: profile } = await requestSupabase
		.from('profiles')
		.select('admin')
		.eq('user_id', user.id)
		.maybeSingle();

	const isAdmin = profile?.admin === true;
	if (!isAdmin) {
		const { data: rows, error } = await requestSupabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.in('role', ['owner', 'admin'])
			.limit(1);
		if (error) return { ok: false, status: 500, error: error.message };
		if (!rows?.length)
			return {
				ok: false,
				status: 403,
				error: 'Only group owners and admins can manage accounting.'
			};
	}

	return { ok: true, user, userId: user.id, group, isAdmin, requestSupabase, serviceSupabase };
}

export async function ensureGroupAccountingSetup(supabase, group, userId = null) {
	const { error: settingsError } = await supabase.from('group_accounting_settings').upsert(
		{
			group_id: group.id,
			enabled: true,
			currency: 'usd'
		},
		{ onConflict: 'group_id', ignoreDuplicates: true }
	);
	if (settingsError) throw new Error(settingsError.message);

	const { data: settings, error: settingsLoadError } = await supabase
		.from('group_accounting_settings')
		.select('*')
		.eq('group_id', group.id)
		.maybeSingle();
	if (settingsLoadError) throw new Error(settingsLoadError.message);
	if (!settings) throw new Error('Failed to load group accounting settings.');

	const rows = DEFAULT_ACCOUNTS.map(
		([
			code,
			name,
			kind,
			subtype,
			normal_side,
			display_group,
			description,
			is_system,
			sort_order
		]) => ({
			group_id: group.id,
			code,
			name,
			kind,
			subtype,
			normal_side,
			display_group,
			description,
			is_system,
			sort_order
		})
	);

	const { error: accountsError } = await supabase
		.from('group_accounting_accounts')
		.upsert(rows, { onConflict: 'group_id,code', ignoreDuplicates: true });
	if (accountsError) throw new Error(accountsError.message);

	const { data: accounts, error: loadError } = await supabase
		.from('group_accounting_accounts')
		.select('*')
		.eq('group_id', group.id)
		.order('sort_order', { ascending: true })
		.order('code', { ascending: true });
	if (loadError) throw new Error(loadError.message);

	if (userId) {
		await supabase.from('group_accounting_bank_connections').upsert(
			[
				{
					group_id: group.id,
					provider: 'stripe',
					display_name: 'Stripe payouts',
					status: 'setup_needed',
					config: { kind: 'processor' }
				},
				{
					group_id: group.id,
					provider: 'stripe_financial_connections',
					display_name: 'Linked bank accounts and cards',
					status: 'setup_needed',
					config: {
						kind: 'bank_feed',
						provider_note:
							'Stripe Financial Connections costs $0.30/month per linked bank for transactions.'
					}
				},
				{
					group_id: group.id,
					provider: 'mercury',
					display_name: 'Mercury',
					status: 'setup_needed',
					config: { kind: 'bank_feed' }
				}
			],
			{ onConflict: 'group_id,provider', ignoreDuplicates: true }
		);
	}

	return { settings, accounts: accounts ?? [] };
}

function accountByCode(accounts, code) {
	const account = accounts.find((candidate) => candidate.code === code);
	if (!account) throw new Error(`Missing accounting account ${code}.`);
	return account;
}

function requiredPostingRequestId(formData) {
	const requestId = cleanText(formData.get('requestId'));
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
	) {
		throw new Error('Refresh the form before posting this transaction.');
	}
	return requestId;
}

async function insertBalancedEntry(supabase, groupId, entry, lines, requestId = null) {
	const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0);
	const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit_cents || 0), 0);
	if (debitTotal !== creditTotal) throw new Error('This entry does not balance.');
	if (debitTotal <= 0) throw new Error('Amount must be greater than zero.');
	if (
		lines.some(
			(line) =>
				!Number.isSafeInteger(Number(line.debit_cents || 0)) ||
				!Number.isSafeInteger(Number(line.credit_cents || 0)) ||
				Number(line.debit_cents || 0) < 0 ||
				Number(line.credit_cents || 0) < 0
		)
	) {
		throw new Error('Entry lines must use non-negative whole cents.');
	}
	if (debitTotal > 2_147_483_647) throw new Error('Entry total exceeds the supported amount.');
	const entryRow = {
		...entry,
		amount_cents: entry.amount_cents ?? debitTotal,
		posted_at: entry.status === 'draft' ? null : new Date().toISOString()
	};
	const lineRows = lines.map((line) => ({
		account_id: line.account_id,
		description: line.description || entry.description,
		debit_cents: Number(line.debit_cents || 0),
		credit_cents: Number(line.credit_cents || 0)
	}));
	const { data, error } = requestId
		? await supabase.rpc('group_accounting_post_entry_idempotent', {
				p_group_id: groupId,
				p_request_id: requestId,
				p_entry: entryRow,
				p_lines: lineRows
			})
		: await supabase.rpc('group_accounting_post_entry', {
				p_group_id: groupId,
				p_entry: entryRow,
				p_lines: lineRows
			});
	if (error) throw new Error(error.message);
	const inserted = Array.isArray(data) ? data[0] : data;
	if (!inserted?.id) throw new Error('Accounting entry was not returned after posting.');
	return inserted;
}

export async function postSimpleEntry(auth, formData) {
	const requestId = requiredPostingRequestId(formData);
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const flow = cleanText(formData.get('flow'));
	const amountCents = centsFromAmount(formData.get('amount'));
	const cashAccountId = cleanText(formData.get('cashAccountId'));
	const categoryAccountId = cleanText(formData.get('categoryAccountId'));
	const description = cleanText(formData.get('description'), 200);
	const memo = cleanText(formData.get('memo'), 1000) || null;
	const currency = requireGroupCurrency(formData.get('currency'), settings.currency);
	const receiptFile = formData.get('receipt');
	validateReceiptFile(receiptFile);

	if (!['income', 'expense'].includes(flow)) throw new Error('Choose money in or money out.');
	if (!amountCents || amountCents <= 0) throw new Error('Enter an amount greater than zero.');
	if (!description) throw new Error('Add a short description.');

	const cashAccount = accounts.find(
		(account) =>
			account.id === cashAccountId &&
			!account.is_archived &&
			['asset', 'liability'].includes(account.kind)
	);
	const categoryAccount = accounts.find(
		(account) => account.id === categoryAccountId && !account.is_archived && account.kind === flow
	);
	if (!cashAccount) throw new Error('Choose where the money moved.');
	if (!categoryAccount) throw new Error('Choose a category.');

	const entry = await insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate')),
			entry_type: flow,
			source: 'manual',
			description,
			memo,
			amount_cents: amountCents,
			currency,
			created_by_user_id: auth.userId,
			metadata: { simple_flow: flow }
		},
		flow === 'income'
			? [
					{ account_id: cashAccount.id, debit_cents: amountCents },
					{ account_id: categoryAccount.id, credit_cents: amountCents }
				]
			: [
					{ account_id: categoryAccount.id, debit_cents: amountCents },
					{ account_id: cashAccount.id, credit_cents: amountCents }
				],
		requestId
	);

	const idempotentReplay = entry._idempotent_replay === true;
	delete entry._idempotent_replay;
	let receiptAlreadyStored = false;
	if (idempotentReplay && receiptFile instanceof File && receiptFile.size > 0) {
		const { data: existingReceipt, error: receiptLookupError } = await auth.serviceSupabase
			.from('group_accounting_receipts')
			.select('id')
			.eq('group_id', auth.group.id)
			.eq('entry_id', entry.id)
			.limit(1)
			.maybeSingle();
		if (receiptLookupError) {
			entry.receipt_warning = `Transaction saved, but the existing receipt could not be checked. Do not record the transaction again. (${receiptLookupError.message})`;
			return entry;
		}
		receiptAlreadyStored = Boolean(existingReceipt?.id);
	}
	if (!receiptAlreadyStored) {
		try {
			await maybeStoreReceipt(auth, entry.id, receiptFile);
		} catch (error) {
			entry.receipt_warning = `Transaction saved, but the receipt upload failed. Do not record the transaction again. You can attach the receipt from the receipts section. (${error.message})`;
		}
	}
	return entry;
}

export async function postTransfer(auth, formData) {
	const requestId = requiredPostingRequestId(formData);
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const amountCents = centsFromAmount(formData.get('amount'));
	const fromAccountId = cleanText(formData.get('fromAccountId'));
	const toAccountId = cleanText(formData.get('toAccountId'));
	const description = cleanText(formData.get('description'), 200) || 'Transfer';
	if (!amountCents || amountCents <= 0) throw new Error('Enter an amount greater than zero.');
	if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
		throw new Error('Choose two different accounts.');
	}
	const fromAccount = accounts.find(
		(account) =>
			account.id === fromAccountId &&
			!account.is_archived &&
			['asset', 'liability'].includes(account.kind)
	);
	const toAccount = accounts.find(
		(account) =>
			account.id === toAccountId &&
			!account.is_archived &&
			['asset', 'liability'].includes(account.kind)
	);
	if (!fromAccount || !toAccount) throw new Error('Account not found.');

	return insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate')),
			entry_type: 'transfer',
			source: 'manual',
			description,
			memo: cleanText(formData.get('memo'), 1000) || null,
			amount_cents: amountCents,
			currency: requireGroupCurrency(formData.get('currency'), settings.currency),
			created_by_user_id: auth.userId
		},
		[
			{ account_id: toAccount.id, debit_cents: amountCents },
			{ account_id: fromAccount.id, credit_cents: amountCents }
		],
		requestId
	);
}

export async function postJournal(auth, formData) {
	const requestId = requiredPostingRequestId(formData);
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	let rows;
	try {
		rows = JSON.parse(cleanText(formData.get('linesJson')) || '[]');
	} catch {
		throw new Error('Invalid journal lines.');
	}
	const description = cleanText(formData.get('description'), 200);
	if (!description) throw new Error('Add a journal description.');
	if (!Array.isArray(rows) || rows.length < 2) throw new Error('Add at least two lines.');

	const lines = rows.map((row) => {
		const account = accounts.find(
			(candidate) => candidate.id === cleanText(row.account_id) && !candidate.is_archived
		);
		if (!account) return null;
		return {
			account_id: account.id,
			description: cleanText(row.description, 200) || description,
			debit_cents: centsFromAmount(row.debit || 0) || 0,
			credit_cents: centsFromAmount(row.credit || 0) || 0
		};
	});
	if (lines.some((line) => !line))
		throw new Error('Choose a valid account for every journal line.');
	const validLines = lines.filter((line) => line.debit_cents > 0 || line.credit_cents > 0);
	if (validLines.length !== rows.length) {
		throw new Error('Every journal line must contain a valid amount.');
	}
	if (validLines.some((line) => line.debit_cents > 0 && line.credit_cents > 0)) {
		throw new Error('Each journal line must be either a debit or a credit.');
	}

	return insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate')),
			entry_type: 'journal',
			source: 'manual',
			description,
			memo: cleanText(formData.get('memo'), 1000) || null,
			currency: requireGroupCurrency(formData.get('currency'), settings.currency),
			created_by_user_id: auth.userId,
			metadata: { advanced: true }
		},
		validLines,
		requestId
	);
}

export async function postOpeningBalance(auth, formData) {
	const requestId = requiredPostingRequestId(formData);
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const amountCents = centsFromAmount(formData.get('amount'));
	const accountId = cleanText(formData.get('accountId'));
	const cashAccount = accounts.find(
		(account) => account.id === accountId && !account.is_archived && account.kind === 'asset'
	);
	const equity = accountByCode(accounts, '3000');
	if (!amountCents || amountCents <= 0)
		throw new Error('Enter a starting balance greater than zero.');
	if (!cashAccount) throw new Error('Choose an asset account.');
	return insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate')),
			entry_type: 'opening_balance',
			source: 'manual',
			description: cleanText(formData.get('description'), 200) || 'Starting balance',
			amount_cents: amountCents,
			currency: requireGroupCurrency(formData.get('currency'), settings.currency),
			created_by_user_id: auth.userId
		},
		[
			{ account_id: cashAccount.id, debit_cents: amountCents },
			{ account_id: equity.id, credit_cents: amountCents }
		],
		requestId
	);
}

export async function createAccount(auth, formData) {
	const kind = cleanText(formData.get('kind'));
	const normalSide = ['asset', 'expense'].includes(kind) ? 'debit' : 'credit';
	const name = cleanText(formData.get('name'), 120);
	const code = cleanText(formData.get('code'), 20);
	const sortOrderValue = cleanText(formData.get('sortOrder'));
	const sortOrder = sortOrderValue ? Number(sortOrderValue) : 900;
	if (!name || !code) throw new Error('Name and code are required.');
	if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(kind))
		throw new Error('Choose a valid account type.');
	if (!Number.isSafeInteger(sortOrder) || sortOrder < 0)
		throw new Error('Sort order must be a non-negative whole number.');
	const { error } = await auth.serviceSupabase.from('group_accounting_accounts').insert({
		group_id: auth.group.id,
		code,
		name,
		kind,
		subtype: cleanText(formData.get('subtype'), 40) || 'custom',
		normal_side: normalSide,
		display_group:
			cleanText(formData.get('displayGroup'), 80) ||
			(kind === 'income' ? 'Money in' : kind === 'expense' ? 'Money out' : 'Other'),
		description: cleanText(formData.get('description'), 500) || null,
		is_system: false,
		sort_order: sortOrder
	});
	if (error) throw new Error(error.message);
}

export async function updateAccount(auth, formData) {
	const accountId = cleanText(formData.get('accountId'));
	const name = cleanText(formData.get('name'), 120);
	const code = cleanText(formData.get('code'), 20);
	const displayGroup = cleanText(formData.get('displayGroup'), 80);
	if (!accountId) throw new Error('Account is required.');
	if (!name || !code) throw new Error('Name and code are required.');

	const { data: account, error: loadError } = await auth.serviceSupabase
		.from('group_accounting_accounts')
		.select('id')
		.eq('group_id', auth.group.id)
		.eq('id', accountId)
		.maybeSingle();
	if (loadError) throw new Error(loadError.message);
	if (!account) throw new Error('Account not found.');

	const { error } = await auth.serviceSupabase
		.from('group_accounting_accounts')
		.update({
			name,
			code,
			...(displayGroup ? { display_group: displayGroup } : {})
		})
		.eq('group_id', auth.group.id)
		.eq('id', accountId);
	if (error) throw new Error(error.message);
}

export async function updateAccountGroup(auth, formData) {
	const kind = cleanText(formData.get('kind'));
	const currentDisplayGroup = cleanText(formData.get('currentDisplayGroup'), 80) || 'Other';
	const displayGroup = cleanText(formData.get('displayGroup'), 80);
	if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(kind)) {
		throw new Error('Choose a valid account type.');
	}
	if (!displayGroup) throw new Error('Group label is required.');

	const { error } = await auth.serviceSupabase
		.from('group_accounting_accounts')
		.update({ display_group: displayGroup })
		.eq('group_id', auth.group.id)
		.eq('kind', kind)
		.eq('display_group', currentDisplayGroup);
	if (error) throw new Error(error.message);
}

export async function updateBudget(auth, formData) {
	const { data: settings, error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('fiscal_year_start_month')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (settingsError) throw new Error(settingsError.message);
	const fiscalYearStartMonth = Number(settings?.fiscal_year_start_month || 1);
	const yearText = cleanText(formData.get('year'));
	const year = yearText
		? Number(yearText)
		: fiscalYearStartYear(new Date().toISOString().slice(0, 10), fiscalYearStartMonth);
	const accountId = cleanText(formData.get('accountId'));
	const amountValue = cleanText(formData.get('amount'));
	const amountCents = amountValue ? centsFromAmount(amountValue) : 0;
	if (!Number.isInteger(year) || year < 2000 || year > 2200)
		throw new Error('Choose a valid budget year.');
	if (!accountId) throw new Error('Choose a budget account.');
	if (amountCents === null) throw new Error('Enter a valid budget amount.');
	const { data: account, error: accountError } = await auth.serviceSupabase
		.from('group_accounting_accounts')
		.select('id,kind')
		.eq('group_id', auth.group.id)
		.eq('id', accountId)
		.maybeSingle();
	if (accountError) throw new Error(accountError.message);
	if (!account || !['income', 'expense'].includes(account.kind)) {
		throw new Error('Choose an income or expense account from this group.');
	}
	const monthly = {};
	for (let i = 1; i <= 12; i += 1) {
		const value = cleanText(formData.get(`month_${i}`));
		if (!value) continue;
		const cents = centsFromAmount(value);
		if (cents === null) throw new Error(`Enter a valid budget for month ${i}.`);
		if (cents > 0) monthly[String(i).padStart(2, '0')] = cents;
	}
	const { error } = await auth.serviceSupabase.from('group_accounting_budgets').upsert(
		{
			group_id: auth.group.id,
			account_id: accountId,
			year,
			amount_cents: amountCents,
			monthly_amounts: monthly,
			notes: cleanText(formData.get('notes'), 500) || null
		},
		{ onConflict: 'group_id,account_id,year' }
	);
	if (error) throw new Error(error.message);
}

export async function saveConnections(auth, formData) {
	const mercuryKey = cleanText(formData.get('mercuryApiKey'));
	const updates = {};
	if (formData.has('mercurySyncEnabled')) {
		const values =
			typeof formData.getAll === 'function'
				? formData.getAll('mercurySyncEnabled')
				: [formData.get('mercurySyncEnabled')];
		updates.mercury_sync_enabled = values.some((value) =>
			['true', 'on', '1'].includes(String(value).toLowerCase())
		);
	}
	let encryptedKey = null;
	if (mercuryKey) {
		encryptedKey = encryptSocialToken(mercuryKey);
		updates.mercury_api_key_ciphertext = encryptedKey;
		updates.mercury_api_key_hint = mercuryKey
			.slice(-4)
			.padStart(Math.min(mercuryKey.length, 8), '*');
		updates.mercury_connected_at = new Date().toISOString();
	}
	if (!Object.keys(updates).length) return;
	const { error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.update(updates)
		.eq('group_id', auth.group.id);
	if (settingsError) throw new Error(settingsError.message);
	if (!encryptedKey) return;
	const { error: connectionError } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.upsert(
			{
				group_id: auth.group.id,
				provider: 'mercury',
				display_name: 'Mercury',
				status: 'connected',
				access_token_ciphertext: encryptedKey,
				config: { api_key_hint: updates.mercury_api_key_hint }
			},
			{ onConflict: 'group_id,provider' }
		);
	if (connectionError) throw new Error(connectionError.message);
}

export async function addManualFeedItem(auth, formData) {
	const { settings } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const amountCents = centsFromSignedAmount(formData.get('amount'));
	const description = cleanText(formData.get('description'), 200);
	if (!amountCents || !description) throw new Error('Amount and description are required.');
	if (Math.abs(amountCents) > 2_147_483_647)
		throw new Error('Bank activity exceeds the supported amount.');
	const { error } = await auth.serviceSupabase.from('group_accounting_bank_feed_items').insert({
		group_id: auth.group.id,
		provider: 'manual',
		source_transaction_id: `manual:${randomUUID()}`,
		transaction_date: dateOnly(formData.get('transactionDate')),
		description,
		amount_cents: amountCents,
		currency: requireGroupCurrency(formData.get('currency'), settings.currency),
		status: 'needs_review',
		raw: { entered_by: auth.userId }
	});
	if (error) throw new Error(error.message);
}

export async function importBankCsv(auth, formData) {
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const accountId = cleanText(formData.get('accountId'));
	const selectedAccount = accounts.find(
		(account) =>
			account.id === accountId &&
			!account.is_archived &&
			['asset', 'liability'].includes(account.kind)
	);
	if (!selectedAccount) {
		throw new Error('Choose a bank account to associate with this upload.');
	}
	const currency = requireGroupCurrency(formData.get('currency'), settings.currency);
	const file = formData.get('csvFile');
	if (!(file instanceof File) || file.size <= 0) throw new Error('Choose a CSV file.');
	if (file.size > 20 * 1024 * 1024) throw new Error('CSV file must be smaller than 20 MB.');
	const textValue = await file.text();
	const rows = parseCsvRows(textValue);
	if (rows.length < 2)
		throw new Error('CSV must include a header row and at least one transaction.');
	const headers = rows[0].map((header) =>
		cleanText(header)
			.replace(/^\uFEFF/, '')
			.toLowerCase()
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
	);
	const findIndex = (...names) => headers.findIndex((header) => names.includes(header));
	const dateIndex = findIndex(
		'date',
		'processed date',
		'transaction date',
		'posted date',
		'post date'
	);
	const descriptionIndex = findIndex('description', 'name', 'memo', 'payee');
	const amountIndex = findIndex('amount', 'transaction amount');
	const debitIndex = findIndex('debit', 'withdrawal', 'withdrawals');
	const creditIndex = findIndex('credit', 'deposit', 'deposits');
	const signIndex = findIndex('credit or debit', 'debit or credit', 'transaction type', 'type');
	const bankTransactionIdIndex = findIndex(
		'transaction id',
		'transaction identifier',
		'bank transaction id',
		'bank transaction identifier',
		'fitid',
		'transaction reference'
	);
	if (
		dateIndex < 0 ||
		descriptionIndex < 0 ||
		(amountIndex < 0 && debitIndex < 0 && creditIndex < 0)
	) {
		throw new Error('CSV needs date, description/name, and amount or debit/credit columns.');
	}
	const transactions = rows.slice(1).flatMap((row, index) => {
		if (!row.some((cell) => cleanText(cell))) return [];
		const description = cleanText(row[descriptionIndex], 200);
		const dateValue = cleanText(row[dateIndex]);
		if (!description || !dateValue) return [];
		const date = normalizeBankDate(dateValue);
		if (!date) throw new Error(`CSV row ${index + 2} has an invalid date.`);
		let amount = null;
		if (amountIndex >= 0) {
			amount = centsFromAmountAndDirection(row[amountIndex], row[signIndex]);
		} else {
			const creditValue = cleanText(row[creditIndex]);
			const debitValue = cleanText(row[debitIndex]);
			const creditCents = creditValue ? centsFromAmount(creditValue) : 0;
			const debitCents = debitValue ? centsFromAmount(debitValue) : 0;
			if (creditCents === null || debitCents === null) {
				throw new Error(`CSV row ${index + 2} has an invalid credit or debit amount.`);
			}
			if (creditCents > 0 && debitCents > 0) {
				throw new Error(`CSV row ${index + 2} has both a credit and a debit amount.`);
			}
			amount = creditCents - debitCents;
			if (!Number.isSafeInteger(amount) || amount < -2_147_483_648 || amount > 2_147_483_647) {
				throw new Error(`CSV row ${index + 2} exceeds the supported amount.`);
			}
		}
		if (amount === null) throw new Error(`CSV row ${index + 2} has an invalid amount.`);
		if (Math.abs(amount) > 2_147_483_647) {
			throw new Error(`CSV row ${index + 2} exceeds the supported amount.`);
		}
		if (amount === 0) return [];
		return [
			{
				bank_transaction_id:
					bankTransactionIdIndex >= 0 ? cleanText(row[bankTransactionIdIndex]) || null : null,
				date,
				description,
				amount_cents: amount,
				currency,
				raw: { row, headers }
			}
		];
	});
	if (!transactions.length) throw new Error('CSV did not contain any valid transaction rows.');
	const existingCsvRows = await fetchAllRows((fromRow, toRow) =>
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select(
				'source_transaction_id,account_id,transaction_date,description,amount_cents,currency,raw'
			)
			.eq('group_id', auth.group.id)
			.eq('provider', 'manual')
			.eq('account_id', selectedAccount.id)
			.like('source_transaction_id', 'csv:%')
			.order('id', { ascending: true })
			.range(fromRow, toRow)
	);
	const identifiedTransactions = buildCsvSourceIds(
		transactions,
		existingCsvRows,
		selectedAccount.id
	);
	if (!identifiedTransactions.length) {
		await auditEvent(auth, 'import_csv', 'bank_feed_item', null, null, null, {
			file_name: file.name,
			rows: transactions.length,
			inserted: 0,
			duplicates: transactions.length
		});
		return 0;
	}
	const { data: connection, error } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.upsert(
			{
				group_id: auth.group.id,
				provider: 'manual',
				display_name: 'CSV imports',
				status: 'connected'
			},
			{ onConflict: 'group_id,provider' }
		)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	const feedCounts = await upsertFeedItems(auth, connection, 'manual', identifiedTransactions, {
		defaultAccountId: selectedAccount.id
	});
	await autoMatchFeedItems(auth);
	await auditEvent(auth, 'import_csv', 'bank_feed_item', null, null, null, {
		file_name: file.name,
		rows: identifiedTransactions.length,
		inserted: feedCounts.inserted,
		updated: feedCounts.updated
	});
	return feedCounts.inserted;
}

export async function postFeedItem(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const accountId = cleanText(formData.get('accountId'));
	const categoryAccountId = cleanText(formData.get('categoryAccountId'));
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const { data: item, error } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('id', feedItemId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!item) throw new Error('Bank activity not found.');
	if (
		item.provider_correction_pending ||
		['pending', 'void', 'cancelled', 'failed', 'reversed', 'blocked'].includes(item.provider_status)
	)
		throw new Error('Review the provider status or correction before posting this activity.');
	if (!['needs_review', 'matched'].includes(item.status)) {
		throw new Error('This bank activity has already been handled.');
	}
	requireGroupCurrency(item.currency, settings.currency);
	if (item.matched_entry_id) {
		const { data: matchedEntry, error: matchedEntryError } = await auth.serviceSupabase
			.from('group_accounting_entries')
			.select(
				'id,entry_date,amount_cents,currency,status,lines:group_accounting_lines(account_id,debit_cents,credit_cents)'
			)
			.eq('group_id', auth.group.id)
			.eq('id', item.matched_entry_id)
			.maybeSingle();
		if (matchedEntryError) throw new Error(matchedEntryError.message);
		if (!matchedEntry || matchedEntry.status !== 'posted') {
			throw new Error('The matched transaction is no longer available. Choose another match.');
		}
		if (Math.abs(Number(matchedEntry.amount_cents)) !== Math.abs(Number(item.amount_cents))) {
			throw new Error('Matched transactions must have the same amount.');
		}
		if (normalizeCurrency(matchedEntry.currency) !== normalizeCurrency(item.currency)) {
			throw new Error('Matched transactions must use the same currency.');
		}
		const matchedAccountId = feedAccountForMatchedEntry(item, matchedEntry, accounts, accountId);
		const suggestedAccount = categoryAccountId || item.suggested_account_id;
		if (suggestedAccount && !accounts.some((account) => account.id === suggestedAccount)) {
			throw new Error('Choose a valid category.');
		}
		const { error: confirmError } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				status: 'posted',
				account_id: matchedAccountId,
				suggested_account_id: suggestedAccount
			})
			.eq('group_id', auth.group.id)
			.eq('id', item.id)
			.in('status', ['needs_review', 'matched']);
		if (confirmError) throw new Error(confirmError.message);
		return;
	}
	const amount = Number(item.amount_cents || 0);
	if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 2_147_483_647) {
		throw new Error('Bank activity exceeds the supported amount.');
	}
	const cashAccount = accounts.find(
		(account) =>
			account.id === accountId &&
			!account.is_archived &&
			['asset', 'liability'].includes(account.kind)
	);
	const categoryAccount = accounts.find(
		(account) =>
			account.id === categoryAccountId &&
			!account.is_archived &&
			['income', 'expense', 'asset', 'liability'].includes(account.kind)
	);
	if (!cashAccount) throw new Error('Choose where the money moved.');
	if (!categoryAccount) throw new Error('Choose a category or transfer account.');
	const amountCents = Math.abs(amount);
	const isTransferAccount = ['asset', 'liability'].includes(categoryAccount.kind);
	const entryLines = buildBankFeedEntryLines(amount, cashAccount.id, categoryAccount);
	const { data: existingEntry, error: existingEntryError } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select(
			'id,entry_date,amount_cents,currency,status,lines:group_accounting_lines(account_id,debit_cents,credit_cents)'
		)
		.eq('group_id', auth.group.id)
		.eq('source', 'bank_feed')
		.eq('source_id', item.id)
		.maybeSingle();
	if (existingEntryError) throw new Error(existingEntryError.message);
	if (existingEntry) {
		if (existingEntry.status !== 'posted')
			throw new Error('The existing transaction is not posted.');
		if (Math.abs(Number(existingEntry.amount_cents)) !== amountCents) {
			throw new Error('The existing transaction has a different amount.');
		}
		if (normalizeCurrency(existingEntry.currency) !== normalizeCurrency(item.currency)) {
			throw new Error('The existing transaction uses a different currency.');
		}
		const matchedAccountId = feedAccountForMatchedEntry(item, existingEntry, accounts, accountId);
		const { error: existingUpdateError } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				status: 'posted',
				matched_entry_id: existingEntry.id,
				account_id: matchedAccountId,
				suggested_account_id: categoryAccountId
			})
			.eq('group_id', auth.group.id)
			.eq('id', item.id);
		if (existingUpdateError) throw new Error(existingUpdateError.message);
		return;
	}
	const entry = await insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(item.transaction_date),
			entry_type: isTransferAccount ? 'transfer' : 'bank_feed',
			source: 'bank_feed',
			source_id: item.id,
			description: item.description,
			memo: `Imported from ${item.provider}`,
			amount_cents: amountCents,
			currency: item.currency || 'usd',
			created_by_user_id: auth.userId,
			metadata: {
				provider: item.provider,
				source_transaction_id: item.source_transaction_id,
				feed_account_id: cashAccount.id,
				feed_category_account_id: categoryAccount.id,
				...(isTransferAccount ? { transfer_account_id: categoryAccount.id } : {})
			}
		},
		entryLines
	);
	return entry;
}

export async function matchFeedItemToEntry(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const entryId = cleanText(formData.get('entryId'));
	const accountId = cleanText(formData.get('accountId'));
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	if (!feedItemId || !entryId) throw new Error('Choose a transaction to match.');
	const [{ data: item, error: itemError }, { data: entry, error: entryError }] = await Promise.all([
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('id', feedItemId)
			.maybeSingle(),
		auth.serviceSupabase
			.from('group_accounting_entries')
			.select(
				'id,entry_date,amount_cents,currency,status,lines:group_accounting_lines(account_id,debit_cents,credit_cents)'
			)
			.eq('group_id', auth.group.id)
			.eq('id', entryId)
			.maybeSingle()
	]);
	if (itemError) throw new Error(itemError.message);
	if (entryError) throw new Error(entryError.message);
	if (!item) throw new Error('Bank activity not found.');
	if (!entry) throw new Error('Transaction not found.');
	if (!['needs_review', 'matched'].includes(item.status)) {
		throw new Error('This bank activity has already been handled.');
	}
	requireGroupCurrency(item.currency, settings.currency);
	requireGroupCurrency(entry.currency, settings.currency);
	if (entry.status !== 'posted') throw new Error('Only posted transactions can be matched.');
	if (Math.abs(Number(entry.amount_cents || 0)) !== Math.abs(Number(item.amount_cents || 0))) {
		throw new Error('Matched transactions must have the same amount.');
	}
	const matchedAccountId = feedAccountForMatchedEntry(item, entry, accounts, accountId);
	const { data: existingMatch, error: existingMatchError } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.select('id')
		.eq('group_id', auth.group.id)
		.eq('matched_entry_id', entry.id)
		.eq('account_id', matchedAccountId)
		.neq('id', item.id)
		.in('status', ['matched', 'posted'])
		.maybeSingle();
	if (existingMatchError) throw new Error(existingMatchError.message);
	if (existingMatch) throw new Error('That transaction is already matched to another bank import.');
	const { error } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.update({
			status: 'posted',
			matched_entry_id: entry.id,
			account_id: matchedAccountId,
			match_confidence: 1,
			match_reason: 'Matched manually during bank review'
		})
		.eq('group_id', auth.group.id)
		.eq('id', item.id)
		.in('status', ['needs_review', 'matched']);
	if (error) throw new Error(error.message);
	await auditEvent(auth, 'match', 'bank_feed_item', item.id, item, { matched_entry_id: entry.id });
}

export async function ignoreFeedItem(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const { error } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.update({ status: 'ignored' })
		.eq('group_id', auth.group.id)
		.eq('id', feedItemId);
	if (error) throw new Error(error.message);
}

async function maybeStoreReceipt(auth, entryId, file) {
	if (!(file instanceof File) || file.size <= 0) return null;
	validateReceiptFile(file);

	const objectPath = `${auth.group.id}/${entryId}/${Date.now()}-${slugFileName(file.name)}`;
	const arrayBuffer = await file.arrayBuffer();
	const upload = await auth.serviceSupabase.storage
		.from(GROUP_ACCOUNTING_RECEIPT_BUCKET)
		.upload(objectPath, arrayBuffer, {
			contentType: file.type,
			upsert: false
		});
	if (upload.error) throw new Error(upload.error.message);

	const classification = classifyReceipt(file.name, file.type);
	const { data, error } = await auth.serviceSupabase
		.from('group_accounting_receipts')
		.insert({
			group_id: auth.group.id,
			entry_id: entryId,
			uploaded_by_user_id: auth.userId,
			object_path: objectPath,
			file_name: file.name,
			mime_type: file.type,
			size_bytes: file.size,
			classification_status: 'classified',
			classification
		})
		.select('*')
		.single();
	if (error || !data) {
		const cleanup = await auth.serviceSupabase.storage
			.from(GROUP_ACCOUNTING_RECEIPT_BUCKET)
			.remove([objectPath]);
		const message = error?.message || 'Receipt record was not returned after upload.';
		if (cleanup.error) {
			throw new Error(
				`${message} The uploaded file could not be removed: ${cleanup.error.message}`
			);
		}
		throw new Error(message);
	}
	return data;
}

function validateReceiptFile(file) {
	if (!(file instanceof File) || file.size <= 0) return;
	const allowed = [
		'image/jpeg',
		'image/png',
		'image/webp',
		'application/pdf',
		'text/plain',
		'text/csv'
	];
	if (!allowed.includes(file.type))
		throw new Error('Receipt must be an image, PDF, text, or CSV file.');
	if (file.size > 10 * 1024 * 1024) throw new Error('Receipt must be smaller than 10 MB.');
}

export async function attachReceiptToEntry(auth, formData) {
	const entryId = cleanText(formData.get('entryId'));
	const file = formData.get('receipt');
	validateReceiptFile(file);
	if (!(file instanceof File) || file.size <= 0) throw new Error('Choose a receipt file.');
	const { data: entry, error } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select('id,status')
		.eq('group_id', auth.group.id)
		.eq('id', entryId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!entry) throw new Error('Transaction not found.');
	if (entry.status !== 'posted')
		throw new Error('Receipts can only be attached to posted transactions.');
	const receipt = await maybeStoreReceipt(auth, entry.id, file);
	await auditEvent(auth, 'attach_receipt', 'receipt', receipt.id, null, receipt, {
		entry_id: entry.id
	});
	return receipt;
}

export async function saveSettings(auth, formData) {
	const fiscalYearStartMonth = Number(formData.get('fiscalYearStartMonth') || 1);
	if (
		!Number.isInteger(fiscalYearStartMonth) ||
		fiscalYearStartMonth < 1 ||
		fiscalYearStartMonth > 12
	) {
		throw new Error('Choose a fiscal year start month from 1 to 12.');
	}
	const visibility = normalizeVisibility({
		activity: formData.get('showActivity') === 'on',
		position: formData.get('showPosition') === 'on',
		budgets: formData.get('showBudgets') === 'on',
		cash: formData.get('showCash') === 'on',
		notes: formData.get('showNotes') === 'on'
	});
	const { error } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.update({
			public_reports_enabled: formData.get('publicReportsEnabled') === 'on',
			public_visibility: visibility,
			fiscal_year_start_month: fiscalYearStartMonth
		})
		.eq('group_id', auth.group.id);
	if (error) throw new Error(error.message);
}

function selectedReconciliationIds(formData, fieldName, label) {
	const values = cleanText(formData.get(fieldName))
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if (new Set(values).size !== values.length)
		throw new Error(`${label} may only be selected once.`);
	if (values.length > 2000 || values.some((id) => !uuid.test(id))) {
		throw new Error(`Invalid ${label.toLowerCase()} selection.`);
	}
	return values;
}

async function saveAccountingReconciliation(auth, formData) {
	const accountId = cleanText(formData.get('accountId'));
	if (!accountId) throw new Error('Choose a bank or credit card account.');
	const statementEndingDate = requiredDateOnly(
		formData.get('statementEndingDate'),
		'Statement ending date'
	);
	const statementEndingBalanceCents = centsFromSignedAmount(formData.get('statementEndingBalance'));
	if (statementEndingBalanceCents === null)
		throw new Error('Enter a valid statement ending balance.');
	const checkedFeedItemIds = selectedReconciliationIds(
		formData,
		'checkedFeedItemIds',
		'Bank activity'
	);
	const clearedEntryIds = selectedReconciliationIds(formData, 'clearedEntryIds', 'Ledger activity');
	const statementFile = formData.get('statementFile');
	let uploadedPath = null;
	let fileMetadata = null;
	if (statementFile && statementFile !== '' && typeof statementFile !== 'string') {
		if (!(statementFile instanceof File) || statementFile.size <= 0) {
			throw new Error('Choose a valid statement attachment.');
		}
		validateReceiptFile(statementFile);
		uploadedPath = `${auth.group.id}/reconciliations/${randomUUID()}/${slugFileName(statementFile.name)}`;
		const upload = await auth.serviceSupabase.storage
			.from(GROUP_ACCOUNTING_RECEIPT_BUCKET)
			.upload(uploadedPath, await statementFile.arrayBuffer(), {
				contentType: statementFile.type,
				upsert: false
			});
		if (upload.error) throw new Error(upload.error.message);
		fileMetadata = {
			object_path: uploadedPath,
			file_name: cleanText(statementFile.name, 255),
			mime_type: statementFile.type,
			size_bytes: statementFile.size
		};
	}
	const { data, error } = await auth.serviceSupabase.rpc(
		'group_accounting_complete_reconciliation',
		{
			p_group_id: auth.group.id,
			p_account_id: accountId,
			p_statement_date: statementEndingDate,
			p_statement_balance: statementEndingBalanceCents,
			p_checked_feed_item_ids: checkedFeedItemIds,
			p_cleared_entry_ids: clearedEntryIds,
			p_statement_file: fileMetadata,
			p_actor_id: auth.userId
		}
	);
	if (error) {
		if (uploadedPath) {
			const cleanup = await auth.serviceSupabase.storage
				.from(GROUP_ACCOUNTING_RECEIPT_BUCKET)
				.remove([uploadedPath]);
			if (cleanup.error) {
				throw new Error(
					`${error.message} The statement file could not be removed: ${cleanup.error.message}`
				);
			}
		}
		throw new Error(error.message);
	}
	const reconciliation = Array.isArray(data) ? data[0] : data;
	if (!reconciliation?.id) throw new Error('Reconciliation was not returned after saving.');
	return reconciliation;
}

export async function createReconciliation(auth, formData) {
	return saveAccountingReconciliation(auth, formData);
}

export async function buildAccountingReport(supabase, groupId, options = {}) {
	const from = dateOnly(options.from || `${currentYear()}-01-01`);
	const to = dateOnly(options.to || new Date().toISOString().slice(0, 10));
	if (from > to) throw new Error('The report start date must be on or before the end date.');
	const { data: accounts, error: accountsError } = await supabase
		.from('group_accounting_accounts')
		.select('*')
		.eq('group_id', groupId)
		.order('sort_order', { ascending: true });
	if (accountsError) throw new Error(accountsError.message);

	const entries = await fetchAllRows((fromRow, toRow) =>
		supabase
			.from('group_accounting_entries')
			.select('id,entry_date,status,description,entry_type')
			.eq('group_id', groupId)
			.in('status', ['posted', 'void'])
			.lte('entry_date', to)
			.order('id', { ascending: true })
			.range(fromRow, toRow)
	);

	let lines = [];
	if (entries.length) {
		const entryIds = entries.map((entry) => entry.id);
		const entryIdPageSize = 500;
		for (let index = 0; index < entryIds.length; index += entryIdPageSize) {
			const entryIdPage = entryIds.slice(index, index + entryIdPageSize);
			const lineRows = await fetchAllRows((fromRow, toRow) =>
				supabase
					.from('group_accounting_lines')
					.select('*')
					.eq('group_id', groupId)
					.in('entry_id', entryIdPage)
					.order('id', { ascending: true })
					.range(fromRow, toRow)
			);
			lines.push(...lineRows);
		}
	}
	return buildAccountingReportFromRows(accounts ?? [], entries, lines, from, to);
}

export async function loadAccountingDashboard(auth, url) {
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const fiscalYearStartMonth = Number(settings?.fiscal_year_start_month || 1);
	const today = new Date().toISOString().slice(0, 10);
	const activeFiscalYear = fiscalYearStartYear(today, fiscalYearStartMonth);
	const currentFiscalWindow = fiscalYearWindow(activeFiscalYear, fiscalYearStartMonth);
	const reportWindow = resolveAccountingReportWindow(url, new Date(), fiscalYearStartMonth);
	const yearValue = url?.searchParams?.get('year');
	const requestedYear = yearValue ? Number(yearValue) : activeFiscalYear;
	const year =
		Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
			? requestedYear
			: activeFiscalYear;
	const bankReviewPageSize = 50;
	const requestedBankReviewPage = Math.max(
		1,
		Number.parseInt(url?.searchParams?.get('bankReviewPage') || '1', 10) || 1
	);
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, {
		from: reportWindow.from,
		to: reportWindow.to
	});

	const { count: bankReviewTotal = 0, error: bankReviewCountError } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.select('id', { count: 'exact', head: true })
		.eq('group_id', auth.group.id)
		.in('status', ['needs_review', 'matched']);
	if (bankReviewCountError) throw new Error(bankReviewCountError.message);
	const bankReviewTotalPages =
		bankReviewTotal > 0 ? Math.ceil(bankReviewTotal / bankReviewPageSize) : 0;
	const bankReviewPage = bankReviewTotalPages
		? Math.min(requestedBankReviewPage, bankReviewTotalPages)
		: 1;
	const bankReviewOffset = (bankReviewPage - 1) * bankReviewPageSize;

	const [
		{ data: candidateEntries, error: entriesError },
		{ data: budgets, error: budgetsError },
		{ data: feedItems, error: feedItemsError },
		{ data: connections, error: connectionsError },
		{ data: reconciliations, error: reconciliationsError },
		{ data: snapshots, error: snapshotsError },
		{ data: providerAccounts, error: providerAccountsError },
		{ data: matchedFeedItems, error: matchedFeedItemsError },
		{ data: providerCorrectionItems, error: providerCorrectionItemsError },
		{ data: syncRuns, error: syncRunsError },
		stripeConnection,
		history,
		setupProgress
	] = await Promise.all([
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_entries')
				.select(
					'id,entry_date,description,amount_cents,currency,status,source,lines:group_accounting_lines(*,account:group_accounting_accounts(id,code,name,kind))'
				)
				.eq('group_id', auth.group.id)
				.eq('status', 'posted')
				.order('entry_date', { ascending: false })
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		).then((data) => ({ data })),
		auth.serviceSupabase
			.from('group_accounting_budgets')
			.select('*, account:group_accounting_accounts(*)')
			.eq('group_id', auth.group.id)
			.eq('year', year),
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('*')
			.eq('group_id', auth.group.id)
			.in('status', ['needs_review', 'matched'])
			.order('transaction_date', { ascending: false })
			.order('created_at', { ascending: false })
			.range(bankReviewOffset, bankReviewOffset + bankReviewPageSize - 1),
		auth.serviceSupabase
			.from('group_accounting_bank_connections')
			.select(
				'id,group_id,provider,display_name,status,external_id,last_synced_at,error_message,institution_name,created_at,updated_at,sync_status,last_sync_attempt_at,last_sync_success_at,last_provider_refresh_at,next_sync_at,sync_consecutive_failures,last_sync_error_code,last_sync_error_message'
			)
			.eq('group_id', auth.group.id)
			.order('provider', { ascending: true }),
		auth.serviceSupabase
			.from('group_accounting_reconciliations')
			.select('*, account:group_accounting_accounts(name,code)')
			.eq('group_id', auth.group.id)
			.order('statement_ending_date', { ascending: false })
			.limit(10),
		auth.serviceSupabase
			.from('group_accounting_public_reports')
			.select('*')
			.eq('group_id', auth.group.id)
			.order('published_at', { ascending: false })
			.limit(12),
		auth.serviceSupabase
			.from('group_accounting_provider_accounts')
			.select('*, ledger_account:group_accounting_accounts(name,code)')
			.eq('group_id', auth.group.id)
			.order('provider', { ascending: true }),
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('matched_entry_id,account_id')
			.eq('group_id', auth.group.id)
			.not('matched_entry_id', 'is', null)
			.in('status', ['matched', 'posted']),
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select(
				'id,provider,source_transaction_id,transaction_date,description,amount_cents,currency,status,provider_correction_pending,provider_correction,provider_correction_decision,provider_correction_resolved_at'
			)
			.eq('group_id', auth.group.id)
			.eq('provider_correction_pending', true)
			.order('updated_at', { ascending: false })
			.limit(50),
		auth.serviceSupabase
			.from('group_accounting_sync_runs')
			.select(
				'id,provider,trigger,status,started_at,completed_at,inserted_count,updated_count,correction_count,skipped_count,error_code,error_message'
			)
			.eq('group_id', auth.group.id)
			.order('started_at', { ascending: false })
			.limit(25),
		loadGroupStripeConnection(auth),
		loadAccountingHistory(auth.serviceSupabase, auth.group.id, url?.searchParams),
		loadAccountingSetupProgress(auth.serviceSupabase, auth.group.id)
	]);
	const dashboardQueryErrors = [
		entriesError,
		budgetsError,
		feedItemsError,
		connectionsError,
		reconciliationsError,
		snapshotsError,
		providerAccountsError,
		matchedFeedItemsError,
		providerCorrectionItemsError,
		syncRunsError
	].filter(Boolean);
	if (dashboardQueryErrors.length) throw new Error(dashboardQueryErrors[0].message);
	const reconciliationFeedItems = await fetchAllRows((fromRow, toRow) =>
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select(
				'id,account_id,transaction_date,description,amount_cents,currency,status,matched_entry_id,provider'
			)
			.eq('group_id', auth.group.id)
			.in('status', ['matched', 'posted'])
			.is('reconciliation_id', null)
			.is('cleared_at', null)
			.order('transaction_date', { ascending: false })
			.order('id', { ascending: true })
			.range(fromRow, toRow)
	);

	const reconciliationEntries = await fetchAllRows((fromRow, toRow) =>
		auth.serviceSupabase
			.from('group_accounting_entries')
			.select(
				'*,lines:group_accounting_lines(*,account:group_accounting_accounts(id,code,name,kind,normal_side)),uncleared_lines:group_accounting_lines!inner(id)'
			)
			.eq('group_id', auth.group.id)
			.in('status', ['posted', 'void'])
			.is('uncleared_lines.cleared_at', null)
			.order('entry_date', { ascending: false })
			.order('id', { ascending: true })
			.range(fromRow, toRow)
	);
	for (const entry of reconciliationEntries) delete entry.uncleared_lines;

	const actualWindow = budgetActualWindow(year, today, fiscalYearStartMonth);
	const budgetReport = !actualWindow.to
		? null
		: actualWindow.from === report.from && actualWindow.to === report.to
			? report
			: await buildAccountingReport(auth.serviceSupabase, auth.group.id, actualWindow);
	const budgetRows = (budgets ?? []).map((budget) => {
		const actual =
			budgetReport?.accounts.find((account) => account.id === budget.account_id)
				?.period_balance_cents ?? 0;
		return {
			...budget,
			actual_cents: actual,
			remaining_cents: Number(budget.amount_cents || 0) - actual
		};
	});

	const safeSettings = {
		enabled: settings?.enabled,
		currency: normalizeCurrency(settings?.currency),
		fiscal_year_start_month: settings?.fiscal_year_start_month,
		fiscal_year_label: `FY ${activeFiscalYear}`,
		fiscal_year_from: currentFiscalWindow.from,
		fiscal_year_to: currentFiscalWindow.to,
		public_reports_enabled: settings?.public_reports_enabled,
		mercury_api_key_hint: settings?.mercury_api_key_hint,
		mercury_connected_at: settings?.mercury_connected_at,
		mercury_sync_enabled: settings?.mercury_sync_enabled === true,
		mercury_connected: Boolean(
			settings?.mercury_api_key_ciphertext || settings?.mercury_connected_at
		),
		public_visibility: normalizeVisibility(settings?.public_visibility)
	};
	return {
		settings: safeSettings,
		accounts,
		report,
		entries: history.entries.data,
		entries_page: history.entries.page,
		entries_total: history.entries.total,
		entries_total_pages: history.entries.total_pages,
		history_page_size: history.entries.page_size,
		setup_progress: {
			...setupProgress,
			has_accounts: accounts.some((account) => !account.is_archived),
			mapped_feed_accounts: (providerAccounts ?? []).filter(
				(account) => account.account_id && account.is_enabled !== false
			).length
		},
		budgets: budgetRows,
		feed_items: buildFeedItemsWithMatchCandidates(
			feedItems ?? [],
			candidateEntries ?? [],
			matchedFeedItems ?? []
		),
		reconciliation_feed_items: reconciliationFeedItems,
		reconciliation_entries: reconciliationEntries,
		bank_review_page: bankReviewPage,
		bank_review_page_size: bankReviewPageSize,
		bank_review_total: bankReviewTotal,
		bank_review_total_pages: bankReviewTotalPages,
		connections: connections ?? [],
		provider_accounts: providerAccounts ?? [],
		provider_correction_items: providerCorrectionItems ?? [],
		sync_runs: syncRuns ?? [],
		posting_request_ids: Object.fromEntries(
			['recordMoney', 'transfer', 'openingBalance', 'journal'].map((key) => [key, randomUUID()])
		),
		receipts: history.receipts.data,
		receipts_page: history.receipts.page,
		receipts_total: history.receipts.total,
		receipts_total_pages: history.receipts.total_pages,
		audit_events: history.audit.data,
		audit_page: history.audit.page,
		audit_total: history.audit.total,
		audit_total_pages: history.audit.total_pages,
		reconciliations: reconciliations ?? [],
		public_reports: snapshots ?? [],
		stripe_connection: stripeConnection,
		year,
		fiscal_year_label: `FY ${year}`,
		fiscal_year_from: fiscalYearWindow(year, fiscalYearStartMonth).from,
		fiscal_year_to: fiscalYearWindow(year, fiscalYearStartMonth).to,
		report_period_key: reportWindow.period,
		report_period_label: reportWindow.label,
		report_from: reportWindow.from,
		report_to: reportWindow.to,
		report_filter_active: Boolean(
			url?.searchParams?.get('period') ||
			url?.searchParams?.get('from') ||
			url?.searchParams?.get('to')
		)
	};
}

export async function publishSnapshot(auth, formData) {
	const from = requiredDateOnly(formData.get('from'), 'Snapshot start date');
	const to = requiredDateOnly(formData.get('to'), 'Snapshot end date');
	if (from > to) throw new Error('The snapshot start date must be on or before the end date.');
	const title = cleanText(formData.get('title'), 160) || `Financial snapshot ${to}`;
	const notes = cleanText(formData.get('notes'), 1200) || null;
	const { settings } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	if (settings.public_reports_enabled !== true) {
		throw new Error('Public accounting reports are disabled for this group.');
	}
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, { from, to });
	const visibility = normalizeVisibility({
		activity: formData.get('showActivity') === 'on',
		position: formData.get('showPosition') === 'on',
		budgets: formData.get('showBudgets') === 'on',
		cash: formData.get('showCash') === 'on',
		notes: formData.get('showNotes') === 'on'
	});
	let budgets = [];
	if (visibility.budgets) {
		const { data, error: budgetsError } = await auth.serviceSupabase
			.from('group_accounting_budgets')
			.select('*, account:group_accounting_accounts(code,name,kind)')
			.eq('group_id', auth.group.id)
			.eq('year', Number(from.slice(0, 4)));
		if (budgetsError) throw new Error(budgetsError.message);
		budgets = data ?? [];
	}

	const snapshot = {
		...buildPublicAccountingSnapshot(report, budgets, visibility),
		generated_at: new Date().toISOString(),
		group: { id: auth.group.id, name: auth.group.name, slug: auth.group.slug },
		currency: normalizeCurrency(settings.currency)
	};
	const slug = await uniquePublicReportSlug(auth.serviceSupabase, auth.group.id, `${title}-${to}`);

	const { error } = await auth.serviceSupabase.from('group_accounting_public_reports').insert({
		group_id: auth.group.id,
		title,
		slug,
		report_period_start: from,
		report_period_end: to,
		visibility,
		snapshot,
		notes: visibility.notes ? notes : null,
		published: true,
		published_by_user_id: auth.userId
	});
	if (error) throw new Error(error.message);
}

export async function unpublishSnapshot(auth, formData) {
	const reportId = cleanText(formData.get('reportId'));
	const { error } = await auth.serviceSupabase
		.from('group_accounting_public_reports')
		.update({ published: false })
		.eq('group_id', auth.group.id)
		.eq('id', reportId);
	if (error) throw new Error(error.message);
}

export async function voidEntry(auth, formData) {
	const entryId = cleanText(formData.get('entryId'));
	const reason = cleanText(formData.get('reason'), 500) || 'Voided by manager';
	const { data: entry, error } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select('*, lines:group_accounting_lines(*)')
		.eq('group_id', auth.group.id)
		.eq('id', entryId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!entry) throw new Error('Entry not found.');
	if (entry.locked_at) throw new Error('This entry is locked by reconciliation.');
	if (entry.status === 'void') return;
	if (entry.status !== 'posted') throw new Error('Only posted transactions can be voided.');

	await insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate') || new Date().toISOString()),
			entry_type: 'journal',
			source: 'reversal',
			source_id: `reversal:${entry.id}`,
			description: `Reversal: ${entry.description}`,
			memo: reason,
			amount_cents: Number(entry.amount_cents || 0),
			currency: entry.currency || 'usd',
			created_by_user_id: auth.userId,
			metadata: { reverses_entry_id: entry.id }
		},
		(entry.lines ?? []).map((line) => ({
			account_id: line.account_id,
			description: `Reversal: ${line.description || entry.description}`,
			debit_cents: Number(line.credit_cents || 0),
			credit_cents: Number(line.debit_cents || 0)
		}))
	);
}

export async function updateEntryByReplacement() {
	throw new Error('Use the transaction editor to update posted transactions.');
}

export async function updateTransaction(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const accountsById = new Map((accounts ?? []).map((account) => [account.id, account]));
	const entryId = cleanText(formData.get('entryId'));
	const entryDate = dateOnly(formData.get('entryDate'));
	const description = cleanText(formData.get('description'), 200);
	const memo = cleanText(formData.get('memo'), 1000) || null;
	const rawLineAccounts = String(formData.get('lineAccountsJson') || '').trim();
	if (!entryId) throw new Error('Entry id is required.');
	if (!entryDate) throw new Error('Choose a valid date.');
	if (!description) throw new Error('Add a description.');
	let lineAccounts = [];
	if (rawLineAccounts) {
		try {
			const parsedLineAccounts = JSON.parse(rawLineAccounts);
			if (!Array.isArray(parsedLineAccounts)) {
				throw new Error('Invalid transaction account data.');
			}
			lineAccounts = parsedLineAccounts
				.map((line) => ({
					lineId: cleanText(line?.lineId),
					accountId: cleanText(line?.accountId)
				}))
				.filter((line) => line.lineId);
		} catch {
			throw new Error('Invalid transaction account data.');
		}
	}
	const { data: entry, error } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('id', entryId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!entry) throw new Error('Entry not found.');
	if (entry.status === 'void') throw new Error('This transaction has been voided.');
	if (entry.status !== 'posted') throw new Error('Only posted transactions can be edited.');
	if (entry.locked_at) throw new Error('This transaction is locked by reconciliation.');

	const { data: lines, error: linesError } = await auth.serviceSupabase
		.from('group_accounting_lines')
		.select('id,account_id')
		.eq('group_id', auth.group.id)
		.eq('entry_id', entry.id);
	if (linesError) throw new Error(linesError.message);
	const linesById = new Map((lines ?? []).map((line) => [line.id, line]));
	const selectedLineIds = new Set(lineAccounts.map((line) => line.lineId));
	if (
		lineAccounts.length &&
		(lineAccounts.length !== linesById.size || selectedLineIds.size !== linesById.size)
	) {
		throw new Error('Transaction account data is incomplete.');
	}
	const lineAccountUpdates = [];
	for (const line of lineAccounts) {
		const existingLine = linesById.get(line.lineId);
		if (!existingLine) throw new Error('Transaction line not found.');
		const selectedAccount = accountsById.get(line.accountId);
		if (!selectedAccount || selectedAccount.is_archived) {
			throw new Error('Choose a valid account.');
		}
		lineAccountUpdates.push({
			lineId: existingLine.id,
			accountId: selectedAccount.id,
			accountKind: selectedAccount.kind
		});
	}

	const { error: updateError } = await auth.serviceSupabase.rpc(
		'group_accounting_update_transaction',
		{
			p_group_id: auth.group.id,
			p_entry_id: entry.id,
			p_patch: { entry_date: entryDate, description, memo, actor_user_id: auth.userId },
			p_line_accounts: lineAccountUpdates.map((line) => ({
				lineId: line.lineId,
				accountId: line.accountId
			}))
		}
	);
	if (updateError) throw new Error(updateError.message);
}

export async function autoMatchFeedItems(auth) {
	const [feedItems, entries, existingMatches] = await Promise.all([
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_bank_feed_items')
				.select('*')
				.eq('group_id', auth.group.id)
				.eq('status', 'needs_review')
				.order('transaction_date', { ascending: false })
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		),
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_entries')
				.select(
					'id,entry_date,description,amount_cents,currency,source,lines:group_accounting_lines(account_id,debit_cents,credit_cents,account:group_accounting_accounts(kind))'
				)
				.eq('group_id', auth.group.id)
				.eq('status', 'posted')
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		),
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_bank_feed_items')
				.select('matched_entry_id,account_id')
				.eq('group_id', auth.group.id)
				.not('matched_entry_id', 'is', null)
				.in('status', ['matched', 'posted'])
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		)
	]);

	const usedEntryAccountPairs = new Set();
	const usedEntryWithoutAccount = new Set();
	for (const match of existingMatches) {
		if (match.account_id)
			usedEntryAccountPairs.add(`${match.matched_entry_id}:${match.account_id}`);
		else usedEntryWithoutAccount.add(match.matched_entry_id);
	}
	const entriesByCurrencyAndAmount = new Map();
	for (const entry of entries) {
		const currency = normalizeCurrency(entry.currency);
		for (const line of entry.lines ?? []) {
			if (!['asset', 'liability'].includes(line.account?.kind)) continue;
			const signedAmount = Number(line.debit_cents || 0) - Number(line.credit_cents || 0);
			if (!signedAmount) continue;
			const key = `${currency}:${signedAmount}`;
			const candidates = entriesByCurrencyAndAmount.get(key) ?? [];
			if (
				!candidates.some(
					(candidate) => candidate.entry.id === entry.id && candidate.accountId === line.account_id
				)
			) {
				candidates.push({ entry, accountId: line.account_id });
				entriesByCurrencyAndAmount.set(key, candidates);
			}
		}
	}

	const updates = [];
	for (const item of feedItems) {
		if (
			item.provider_correction_pending ||
			['pending', 'void', 'cancelled', 'failed', 'reversed', 'blocked'].includes(
				item.provider_status
			)
		)
			continue;
		const amount = Number(item.amount_cents);
		if (!Number.isSafeInteger(amount) || amount === 0) continue;
		const itemCurrency = normalizeCurrency(item.currency);
		const itemText = normalizedMatchText(item.description);
		const candidates = (entriesByCurrencyAndAmount.get(`${itemCurrency}:${amount}`) ?? [])
			.filter(({ entry, accountId }) => {
				if (item.account_id && accountId !== item.account_id) return false;
				if (usedEntryWithoutAccount.has(entry.id)) return false;
				if (usedEntryAccountPairs.has(`${entry.id}:${accountId}`)) return false;
				return dateDeltaDays(entry.entry_date, item.transaction_date) <= 3;
			})
			.map((candidate) => {
				const days = dateDeltaDays(candidate.entry.entry_date, item.transaction_date);
				const entryText = normalizedMatchText(candidate.entry.description);
				const descriptionMatch = Boolean(
					itemText && entryText && (itemText.includes(entryText) || entryText.includes(itemText))
				);
				return {
					...candidate,
					days,
					descriptionMatch,
					score: (days === 0 ? 2 : 0) + (descriptionMatch ? 1 : 0)
				};
			})
			.filter((candidate) => candidate.score > 0)
			.sort((left, right) => right.score - left.score || left.days - right.days);
		const best = candidates[0];
		if (
			!best ||
			(candidates.length > 1 &&
				best.score === candidates[1].score &&
				best.days === candidates[1].days)
		) {
			continue;
		}
		usedEntryAccountPairs.add(`${best.entry.id}:${best.accountId}`);
		updates.push(
			auth.serviceSupabase
				.from('group_accounting_bank_feed_items')
				.update({
					status: 'matched',
					matched_entry_id: best.entry.id,
					account_id: best.accountId,
					match_confidence: best.days === 0 ? 0.99 : 0.94,
					match_reason: `Same cash account, amount, and currency within ${best.days} days`
				})
				.eq('group_id', auth.group.id)
				.eq('id', item.id)
				.eq('status', 'needs_review')
				.is('matched_entry_id', null)
				.select('id')
				.maybeSingle()
		);
	}
	const results = await Promise.all(updates);
	const updateError = results.find((result) => result.error)?.error;
	if (updateError) throw new Error(updateError.message);
	const matchedCount = results.filter((result) => result.data?.id).length;
	await auditEvent(auth, 'auto_match', 'bank_feed_item', null, null, null, {
		matched: matchedCount
	});
	return matchedCount;
}

export async function completeAutomatedReconciliation(auth, formData) {
	return saveAccountingReconciliation(auth, formData);
}

export async function reopenReconciliation(auth, formData) {
	const reconciliationId = cleanText(formData.get('reconciliationId'));
	const reason = cleanText(formData.get('reason'), 500);
	if (!reconciliationId) throw new Error('Reconciliation is required.');
	if (!reason) throw new Error('Add a reason for reopening this reconciliation.');
	const { data, error } = await auth.serviceSupabase.rpc('group_accounting_reopen_reconciliation', {
		p_group_id: auth.group.id,
		p_reconciliation_id: reconciliationId,
		p_actor_id: auth.userId,
		p_reason: reason
	});
	if (error) throw new Error(error.message);
	const reconciliation = Array.isArray(data) ? data[0] : data;
	if (!reconciliation?.id) throw new Error('Reopened reconciliation was not returned.');
	return reconciliation;
}

export async function createReconciliationStatementDownload(auth, reconciliationId) {
	const { data: reconciliation, error } = await auth.serviceSupabase
		.from('group_accounting_reconciliations')
		.select('id,statement_object_path')
		.eq('group_id', auth.group.id)
		.eq('id', cleanText(reconciliationId))
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!reconciliation?.statement_object_path) throw new Error('Statement attachment not found.');
	if (!reconciliation.statement_object_path.startsWith(`${auth.group.id}/reconciliations/`)) {
		throw new Error('Statement attachment path is invalid.');
	}
	const { data, error: signedUrlError } = await auth.serviceSupabase.storage
		.from(GROUP_ACCOUNTING_RECEIPT_BUCKET)
		.createSignedUrl(reconciliation.statement_object_path, 60);
	if (signedUrlError) throw new Error(signedUrlError.message);
	if (!data?.signedUrl) throw new Error('Statement download link was not returned.');
	return { url: data.signedUrl, expiresIn: 60 };
}

function providerBalanceCents(value) {
	if (value === null || value === undefined || value === '') return null;
	const amount = Number(value);
	return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

async function upsertProviderAccounts(auth, connection, provider, accounts = []) {
	const rows = dedupeRowsByKey(
		accounts
			.map((account) => ({
				group_id: auth.group.id,
				connection_id: connection.id,
				provider,
				external_account_id: providerExternalAccountId(account),
				display_name: cleanText(
					account.name || account.official_name || account.nickname || 'Bank account'
				),
				account_type:
					cleanText(account.kind || account.accountType || account.account_type || account.type) ||
					null,
				account_subtype: cleanText(account.subtype) || null,
				mask: cleanText(account.mask || account.lastFour || account.lastFourDigits) || null,
				current_balance_cents: Number.isSafeInteger(account.currentBalanceCents)
					? account.currentBalanceCents
					: providerBalanceCents(
							account.balances?.current ?? account.currentBalance ?? account.current_balance
						),
				available_balance_cents: Number.isSafeInteger(account.availableBalanceCents)
					? account.availableBalanceCents
					: providerBalanceCents(
							account.balances?.available ?? account.availableBalance ?? account.available_balance
						),
				currency: normalizeCurrency(
					account.balances?.iso_currency_code || account.currency || 'usd'
				),
				raw: provider === 'mercury' ? redactMercurySensitiveFields(account) : account
			}))
			.filter((row) => row.external_account_id),
		'external_account_id'
	);
	if (rows.length) {
		const { error } = await auth.serviceSupabase
			.from('group_accounting_provider_accounts')
			.upsert(rows, { onConflict: 'group_id,provider,external_account_id' });
		if (error) throw new Error(error.message);
	}
}

async function loadProviderAccountMap(auth, provider) {
	const { data, error } = await auth.serviceSupabase
		.from('group_accounting_provider_accounts')
		.select('external_account_id, account_id')
		.eq('group_id', auth.group.id)
		.eq('provider', provider)
		.eq('is_enabled', true);
	if (error) throw new Error(error.message);
	return new Map(
		(data ?? [])
			.filter((account) => account.external_account_id && account.account_id)
			.map((account) => [account.external_account_id, account.account_id])
	);
}

async function upsertFeedItems(auth, connection, provider, transactions = [], options = {}) {
	const { defaultAccountId = null, accountMap = new Map() } = options;
	const rows = dedupeRowsByKey(
		transactions
			.map((transaction) => {
				const externalAccountId = providerExternalAccountId(transaction);
				const accountId = accountMap.get(externalAccountId) || defaultAccountId || null;
				const sourceDate =
					provider === 'mercury'
						? mercuryTransactionDate(transaction)
						: providerTransactionDate(
								transaction.date ||
									transaction.posted_at ||
									transaction.postedAt ||
									transaction.created
							);
				const amountCents = feedItemAmountCents(provider, transaction);
				return {
					group_id: auth.group.id,
					connection_id: connection.id,
					provider,
					source_transaction_id: feedTransactionId(transaction),
					transaction_date: sourceDate,
					account_id: accountId,
					description: feedItemDescription(provider, transaction),
					amount_cents: amountCents,
					currency: normalizeCurrency(
						transaction.iso_currency_code || transaction.currency || 'usd'
					),
					status: 'needs_review',
					provider_status: cleanText(transaction.status).toLowerCase() || null,
					should_import: transaction.should_import !== false,
					raw: {
						...(provider === 'mercury'
							? redactMercurySensitiveFields(transaction.raw ?? transaction)
							: (transaction.raw ?? transaction)),
						external_account_id: externalAccountId || null
					}
				};
			})
			.filter(
				(row) =>
					row.source_transaction_id &&
					row.transaction_date &&
					Number.isSafeInteger(row.amount_cents) &&
					Math.abs(row.amount_cents) <= 2_147_483_647
			),
		'source_transaction_id'
	);
	const totals = { inserted: 0, updated: 0, corrections: 0, skipped: 0 };
	for (let index = 0; index < rows.length; index += 100) {
		const { data, error } = await auth.serviceSupabase.rpc('sync_group_accounting_feed_items', {
			p_rows: rows.slice(index, index + 100)
		});
		if (error) throw new Error('Unable to save provider feed items.');
		for (const key of Object.keys(totals)) totals[key] += Number(data?.[key] || 0);
	}
	return totals;
}

export async function updateProviderAccountMapping(auth, formData) {
	const providerAccountId = cleanText(formData.get('providerAccountId'));
	const accountId = cleanText(formData.get('accountId'));
	const { accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const selectedAccount = accounts.find(
		(account) => account.id === accountId && ['asset', 'liability'].includes(account.kind)
	);
	if (accountId && !selectedAccount) throw new Error('Choose a cash account.');
	const { data: providerAccount, error: loadError } = await auth.serviceSupabase
		.from('group_accounting_provider_accounts')
		.select('id, provider, external_account_id')
		.eq('group_id', auth.group.id)
		.eq('id', providerAccountId)
		.maybeSingle();
	if (loadError) throw new Error(loadError.message);
	if (!providerAccount) throw new Error('Bank feed account not found.');
	const { error } = await auth.serviceSupabase
		.from('group_accounting_provider_accounts')
		.update({ account_id: accountId || null })
		.eq('group_id', auth.group.id)
		.eq('id', providerAccountId);
	if (error) throw new Error(error.message);
	if (accountId) {
		const rawAccountKeys = ['external_account_id', 'account_id', 'accountId'];
		for (const rawKey of rawAccountKeys) {
			const { error: feedUpdateError } = await auth.serviceSupabase
				.from('group_accounting_bank_feed_items')
				.update({ account_id: accountId })
				.eq('group_id', auth.group.id)
				.eq('provider', providerAccount.provider)
				.is('account_id', null)
				.contains('raw', { [rawKey]: providerAccount.external_account_id });
			if (feedUpdateError) throw new Error(feedUpdateError.message);
		}
	}
}

async function getGroupConnectedStripeAccount(auth) {
	const stripeConnection = await loadGroupStripeConnection(auth);
	if (!stripeConnection.connected || !stripeConnection.stripe_account_id) {
		throw new Error('Connect Stripe for this group before linking bank accounts.');
	}
	return stripeConnection.stripe_account_id;
}

export async function createStripeFinancialConnectionsSession(auth) {
	const stripe = getStripeClient();
	const connectedAccountId = await getGroupConnectedStripeAccount(auth);
	const session = await stripe.financialConnections.sessions.create({
		account_holder: {
			type: 'account',
			account: connectedAccountId
		},
		permissions: ['balances', 'transactions', 'ownership'],
		prefetch: ['transactions'],
		filters: {
			countries: ['US']
		}
	});
	const { error } = await auth.serviceSupabase.from('group_accounting_bank_connections').upsert(
		{
			group_id: auth.group.id,
			provider: 'stripe_financial_connections',
			display_name: 'Linked bank accounts and cards',
			status: 'setup_needed',
			external_id: session.id,
			config: {
				session_id: session.id,
				connected_account_id: connectedAccountId,
				pricing_note:
					'Stripe Financial Connections Transactions costs $0.30/month per institution per account holder.'
			}
		},
		{ onConflict: 'group_id,provider' }
	);
	if (error) throw new Error(error.message);
	return {
		clientSecret: session.client_secret,
		sessionId: session.id,
		publishableKey: getStripePublishableKey()
	};
}

export async function completeStripeFinancialConnectionsSession(auth, sessionId) {
	const cleanedSessionId = cleanText(sessionId);
	if (!cleanedSessionId) throw new Error('Financial Connections session id is required.');
	const { data: pendingConnection, error: pendingError } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.select('id, group_id, provider, external_id, config')
		.eq('group_id', auth.group.id)
		.eq('provider', 'stripe_financial_connections')
		.maybeSingle();
	if (pendingError) throw new Error(pendingError.message);
	const connectedAccountId = await getGroupConnectedStripeAccount(auth);
	assertFinancialConnectionsSessionOwnership({
		pendingConnection,
		sessionId: cleanedSessionId,
		groupId: auth.group.id,
		connectedAccountId
	});
	const stripe = getStripeClient();
	const session = await stripe.financialConnections.sessions.retrieve(cleanedSessionId, {
		expand: ['accounts']
	});
	const sessionHolderAccount = session.account_holder?.account;
	const sessionHolderAccountId =
		typeof sessionHolderAccount === 'string'
			? sessionHolderAccount
			: cleanText(sessionHolderAccount?.id);
	assertFinancialConnectionsSessionOwnership({
		pendingConnection,
		sessionId: cleanedSessionId,
		groupId: auth.group.id,
		connectedAccountId,
		sessionHolderAccountId
	});
	const linkedAccounts = session.accounts?.data ?? [];
	if (!linkedAccounts.length) throw new Error('No bank accounts were selected in Stripe.');
	const { data: connection, error } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.update({
			display_name: 'Linked bank accounts and cards',
			status: 'connected',
			external_id: session.id,
			config: {
				session_id: session.id,
				connected_account_id: connectedAccountId,
				account_ids: linkedAccounts.map((account) => account.id),
				pricing_note:
					'Stripe Financial Connections Transactions costs $0.30/month per institution per account holder.'
			}
		})
		.eq('group_id', auth.group.id)
		.eq('provider', 'stripe_financial_connections')
		.eq('id', pendingConnection.id)
		.eq('external_id', cleanedSessionId)
		.select('*')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!connection) throw new Error('This bank-link session was replaced. Start a new connection.');
	await upsertProviderAccounts(
		auth,
		connection,
		'stripe_financial_connections',
		linkedAccounts.map((account) => {
			const balance = stripeFinancialConnectionsBalance(account);
			return {
				id: account.id,
				name: account.display_name || account.institution_name || 'Linked account',
				type: account.category,
				subtype: account.subcategory,
				lastFour: account.last4,
				currency: balance.currency,
				currentBalanceCents: balance.currentBalanceCents,
				availableBalanceCents: balance.availableBalanceCents,
				raw: account
			};
		})
	);
	await syncStripeFinancialConnectionsTransactions(auth, connection).catch(() => null);
	return connection;
}

async function performStripeFinancialConnectionsSync(auth, connection = null, options = {}) {
	const { runAutoMatch = true, allowRefresh = true, refreshedAccount = null } = options;
	const stripe = getStripeClient();
	let resolved = connection;
	if (!resolved) {
		const { data, error } = await auth.serviceSupabase
			.from('group_accounting_bank_connections')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('provider', 'stripe_financial_connections')
			.maybeSingle();
		if (error) throw new Error(error.message);
		resolved = data;
	}
	if (
		resolved?.group_id !== auth.group.id ||
		resolved?.provider !== 'stripe_financial_connections'
	) {
		throw new Error('Financial Connections belongs to a different group.');
	}
	const accountIds = [
		...new Set((resolved.config?.account_ids ?? []).map((id) => cleanText(id)).filter(Boolean))
	];
	if (!resolved?.id || !accountIds.length) {
		throw new Error('No Stripe Financial Connections accounts are linked yet.');
	}
	const accountMap = await loadProviderAccountMap(auth, 'stripe_financial_connections');
	const totals = { inserted: 0, updated: 0, corrections: 0, skipped: 0 };
	let pendingAccounts = 0;
	let failedAccounts = 0;
	let lastProviderRefreshAt = null;
	const refreshCursors = { ...(resolved.config?.transaction_refresh_cursors || {}) };
	for (const accountId of accountIds) {
		let account =
			refreshedAccount?.id === accountId
				? refreshedAccount
				: await stripe.financialConnections.accounts.retrieve(accountId);
		let refreshState = financialConnectionsRefreshState(account);
		if (refreshState.status === 'pending') {
			pendingAccounts += 1;
			continue;
		}
		if (
			refreshState.status === 'failed' &&
			(!allowRefresh ||
				(refreshState.nextRefreshAt && Date.parse(refreshState.nextRefreshAt) > Date.now()))
		) {
			failedAccounts += 1;
			continue;
		}

		if (allowRefresh) {
			const now = Date.now();
			const nextRefreshDue = refreshState.nextRefreshAt
				? Date.parse(refreshState.nextRefreshAt) <= now
				: ['not_requested', 'failed'].includes(refreshState.status) ||
					(refreshState.refreshAt &&
						now - Date.parse(refreshState.refreshAt) >= 24 * 60 * 60 * 1000);
			if (nextRefreshDue) {
				account = await stripe.financialConnections.accounts.refresh(accountId, {
					features: ['transactions']
				});
				refreshState = financialConnectionsRefreshState(account);
				if (refreshState.status === 'pending' || refreshState.status === 'not_requested') {
					pendingAccounts += 1;
					continue;
				}
				if (refreshState.status === 'failed') {
					failedAccounts += 1;
					continue;
				}
			}
		}
		if (
			refreshState.refreshAt &&
			(!lastProviderRefreshAt || refreshState.refreshAt > lastProviderRefreshAt)
		) {
			lastProviderRefreshAt = refreshState.refreshAt;
		}

		const listParams = { account: accountId, limit: 100 };
		if (refreshCursors[accountId])
			listParams.transaction_refresh = { after: refreshCursors[accountId] };
		const listPromise = stripe.financialConnections.transactions.list(listParams);
		let batch = [];
		const flush = async () => {
			if (!batch.length) return;
			const counts = await upsertFeedItems(auth, resolved, 'stripe_financial_connections', batch, {
				accountMap
			});
			for (const key of Object.keys(totals)) totals[key] += counts[key];
			batch = [];
		};
		await forEachStripeListItem(listPromise, async (transaction) => {
			const providerStatus = cleanText(transaction.status).toLowerCase();
			if (!['posted', 'pending', 'void'].includes(providerStatus)) return;
			const amountCents = Number(transaction.amount);
			if (!Number.isSafeInteger(amountCents)) return;
			const date = providerTransactionDate(transaction.transacted_at ?? transaction.created);
			if (!date) return;
			batch.push({
				id: transaction.id,
				account_id: transaction.account || accountId,
				date,
				description: transaction.description || 'Linked account activity',
				amount_cents: amountCents,
				currency: transaction.currency || 'usd',
				status: providerStatus,
				should_import: shouldImportFinancialConnectionsTransaction(transaction),
				raw: transaction
			});
			if (batch.length >= 100) await flush();
		});
		await flush();
		if (account.transaction_refresh?.id) refreshCursors[accountId] = account.transaction_refresh.id;
	}
	if (lastProviderRefreshAt) {
		const { error: updateError } = await auth.serviceSupabase
			.from('group_accounting_bank_connections')
			.update({
				last_provider_refresh_at: lastProviderRefreshAt,
				config: { ...resolved.config, transaction_refresh_cursors: refreshCursors }
			})
			.eq('group_id', auth.group.id)
			.eq('id', resolved.id);
		if (updateError) throw new Error('Unable to update provider refresh status.');
	}
	if (runAutoMatch) await autoMatchFeedItems(auth);
	if (failedAccounts) {
		return {
			...totals,
			sync_status: 'partial',
			error_code: 'provider_refresh_failed',
			error_message: 'A linked institution could not refresh transaction data.'
		};
	}
	if (pendingAccounts) {
		return {
			...totals,
			sync_status: totals.inserted || totals.updated || totals.corrections ? 'partial' : 'pending',
			error_code: 'provider_refresh_pending',
			error_message: 'A linked institution is still refreshing transaction data.'
		};
	}
	return totals;
}

export async function syncStripeFinancialConnectionsTransactions(
	auth,
	connection = null,
	options = {}
) {
	const trigger = options.trigger || 'manual';
	return withProviderSync(
		auth,
		'stripe_financial_connections',
		{
			trigger,
			force: options.force ?? trigger !== 'cron'
		},
		() => performStripeFinancialConnectionsSync(auth, connection, options)
	);
}

async function performMercurySync(auth, options = {}) {
	const { runAutoMatch = true } = options;
	const { data: connection, error: connectionError } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('provider', 'mercury')
		.maybeSingle();
	if (connectionError) throw new Error(connectionError.message);
	const { data: settings, error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('mercury_api_key_ciphertext')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (settingsError) throw new Error(settingsError.message);
	const resolvedApiKey = decryptSocialToken(settings?.mercury_api_key_ciphertext);
	if (!resolvedApiKey) {
		throw new Error('Mercury API key is not configured for this group.');
	}
	let resolved = connection;
	if (!resolved?.id) {
		const { data: inserted, error } = await auth.serviceSupabase
			.from('group_accounting_bank_connections')
			.upsert(
				{
					group_id: auth.group.id,
					provider: 'mercury',
					display_name: 'Mercury',
					status: 'connected',
					access_token_ciphertext: encryptSocialToken(resolvedApiKey)
				},
				{ onConflict: 'group_id,provider' }
			)
			.select('*')
			.single();
		if (error) throw new Error(error.message);
		resolved = inserted;
	}
	let initialAccountPayload = null;
	let legacyAccounts = [];
	const mercuryAccountIds = new Set();
	for await (const accountPage of mercuryAccountPages(async (query) => {
		const payload = await mercuryRelayRequest(auth, resolved, resolvedApiKey, {
			method: 'GET',
			path: '/api/v1/accounts',
			query
		});
		if (!initialAccountPayload) {
			initialAccountPayload = payload;
			legacyAccounts = [
				...(payload.creditAccounts ?? []),
				...(payload.credit_accounts ?? []),
				...(payload.cards ?? [])
			];
		}
		return payload;
	})) {
		const accounts = [...accountPage, ...legacyAccounts].filter((account) => {
			const type = cleanText(account.type).toLowerCase();
			return type !== 'external' && type !== 'recipient';
		});
		legacyAccounts = [];
		for (const account of accounts) {
			const externalAccountId = providerExternalAccountId(account);
			if (externalAccountId) mercuryAccountIds.add(externalAccountId);
		}
		await upsertProviderAccounts(auth, resolved, 'mercury', accounts);
	}

	const totals = { inserted: 0, updated: 0, corrections: 0, skipped: 0 };
	for await (const transactions of mercuryTransactionPages(async (query) =>
		mercuryRelayRequest(auth, resolved, resolvedApiKey, {
			method: 'GET',
			path: '/api/v1/transactions',
			query
		})
	)) {
		await upsertProviderAccounts(
			auth,
			resolved,
			'mercury',
			mercuryProviderAccountsFromTransactions(transactions).filter(
				(account) => !mercuryAccountIds.has(account.id)
			)
		);
		const accountMap = await loadProviderAccountMap(auth, 'mercury');
		const normalizedTransactions = dedupeRowsByKey(
			transactions.map((transaction) => ({
				...transaction,
				account_id: mercuryTransactionAccountId(transaction),
				source_transaction_id: feedTransactionId(transaction),
				should_import: shouldImportMercuryTransaction(transaction)
			})),
			'source_transaction_id'
		);
		const counts = await upsertFeedItems(auth, resolved, 'mercury', normalizedTransactions, {
			accountMap
		});
		for (const key of Object.keys(totals)) totals[key] += counts[key];
	}
	if (runAutoMatch) await autoMatchFeedItems(auth);
	return totals;
}

export async function syncMercuryTransactions(auth, options = {}) {
	const trigger = options.trigger || 'manual';
	return withProviderSync(
		auth,
		'mercury',
		{
			trigger,
			force: options.force ?? trigger !== 'cron'
		},
		() => performMercurySync(auth, options)
	);
}

async function performStripeSync(auth, options = {}) {
	const { runAutoMatch = true } = options;
	const [{ getStripeClient }, donationAccountResult] = await Promise.all([
		import('$lib/server/stripe'),
		auth.serviceSupabase
			.from('donation_accounts')
			.select('stripe_account_id')
			.eq('group_id', auth.group.id)
			.maybeSingle()
	]);
	if (donationAccountResult.error) throw new Error(donationAccountResult.error.message);
	const donationAccount = donationAccountResult.data;
	if (!donationAccount?.stripe_account_id) {
		throw new Error('Stripe donations are not connected for this group.');
	}
	const { accounts: chartAccounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const stripeBalanceChartAccount = chartAccounts.find((account) => account.code === '1030');
	const stripe = getStripeClient();
	const { data: connection, error } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.upsert(
			{
				group_id: auth.group.id,
				provider: 'stripe',
				display_name: 'Stripe balance',
				status: 'connected',
				external_id: donationAccount.stripe_account_id
			},
			{ onConflict: 'group_id,provider' }
		)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	await upsertProviderAccounts(auth, connection, 'stripe', [
		{
			id: donationAccount.stripe_account_id,
			name: 'Stripe balance',
			kind: 'processor_balance',
			currency: 'usd'
		}
	]);
	if (stripeBalanceChartAccount?.id) {
		const { data: existingProviderAccount, error: providerAccountError } =
			await auth.serviceSupabase
				.from('group_accounting_provider_accounts')
				.select('id, account_id')
				.eq('group_id', auth.group.id)
				.eq('provider', 'stripe')
				.eq('external_account_id', donationAccount.stripe_account_id)
				.maybeSingle();
		if (providerAccountError) throw new Error(providerAccountError.message);
		if (existingProviderAccount && !existingProviderAccount.account_id) {
			const { error: mapError } = await auth.serviceSupabase
				.from('group_accounting_provider_accounts')
				.update({ account_id: stripeBalanceChartAccount.id })
				.eq('group_id', auth.group.id)
				.eq('id', existingProviderAccount.id);
			if (mapError) throw new Error(mapError.message);
		}
	}
	const accountMap = await loadProviderAccountMap(auth, 'stripe');
	const listPromise = stripe.balanceTransactions.list(
		{ limit: 100 },
		{ stripeAccount: donationAccount.stripe_account_id }
	);
	const totals = { inserted: 0, updated: 0, corrections: 0, skipped: 0 };
	let skipped = 0;
	let batch = [];
	const flush = async () => {
		if (!batch.length) return;
		const counts = await upsertFeedItems(auth, connection, 'stripe', batch, { accountMap });
		for (const key of Object.keys(totals)) totals[key] += counts[key];
		batch = [];
	};
	await forEachStripeListItem(listPromise, async (item) => {
		const rows = stripeBalanceTransactionFeedRows(item, donationAccount.stripe_account_id);
		if (!rows.length) {
			skipped += 1;
			return;
		}
		batch.push(...rows);
		if (batch.length >= 100) await flush();
	});
	await flush();
	totals.skipped += skipped;
	if (runAutoMatch) await autoMatchFeedItems(auth);
	return { ...totals, invalid_count: skipped };
}

export async function syncStripeTransactions(auth, options = {}) {
	const trigger = options.trigger || 'manual';
	return withProviderSync(
		auth,
		'stripe',
		{
			trigger,
			force: options.force ?? trigger !== 'cron'
		},
		() => performStripeSync(auth, options)
	);
}

export async function resolveProviderCorrection(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const submittedDecision = cleanText(formData.get('decision')).toLowerCase();
	const decision =
		submittedDecision === 'accept'
			? 'accepted'
			: submittedDecision === 'dismiss'
				? 'dismissed'
				: '';
	if (!feedItemId || !decision) throw new Error('Choose a provider correction to review.');
	const { data, error } = await auth.serviceSupabase.rpc(
		'resolve_group_accounting_provider_correction',
		{
			p_group_id: auth.group.id,
			p_feed_item_id: feedItemId,
			p_decision: decision,
			p_actor_user_id: auth.userId || null
		}
	);
	if (error) throw new Error('Unable to resolve provider correction.');
	if (!data?.resolved) throw new Error('This provider correction has already been resolved.');
	return { decision: data.decision };
}

export async function handleStripeFinancialConnectionsRefreshWebhook(serviceSupabase, event) {
	if (event?.type !== 'financial_connections.account.refreshed_transactions') {
		return { processed: false, reason: 'event_not_supported' };
	}
	const account = event?.data?.object;
	const accountId = cleanText(account?.id);
	const refreshState = financialConnectionsRefreshState(account);
	if (!accountId || !['succeeded', 'failed'].includes(refreshState.status)) {
		return { processed: false, reason: 'refresh_not_complete' };
	}
	const { data: connections, error } = await serviceSupabase
		.from('group_accounting_bank_connections')
		.select('id,group_id,provider,config')
		.eq('provider', 'stripe_financial_connections')
		.contains('config', { account_ids: [accountId] });
	if (error) throw new Error('Unable to match the Financial Connections refresh event.');
	const holder = account?.account_holder?.account;
	const holderAccountId = typeof holder === 'string' ? holder : cleanText(holder?.id);
	const matches = (connections ?? []).filter((connection) => {
		const configuredAccount = cleanText(connection.config?.connected_account_id);
		return (
			(!event.account || event.account === configuredAccount) &&
			(!holderAccountId || holderAccountId === configuredAccount)
		);
	});
	if (!matches.length) return { processed: false, reason: 'connection_not_found' };

	const results = [];
	for (const connection of matches) {
		const { data: group, error: groupError } = await serviceSupabase
			.from('groups')
			.select('id,slug,name')
			.eq('id', connection.group_id)
			.maybeSingle();
		if (groupError || !group) {
			throw new Error('Unable to load the group for a Financial Connections refresh.');
		}
		const auth = { group, userId: null, serviceSupabase };
		const result = await syncStripeFinancialConnectionsTransactions(auth, connection, {
			trigger: 'webhook',
			force: true,
			refreshedAccount: account,
			allowRefresh: false,
			runAutoMatch: true
		});
		results.push({
			group_id: group.id,
			status: result.sync_status,
			inserted: result.inserted || 0,
			updated: result.updated || 0,
			corrections: result.corrections || 0
		});
	}
	return { processed: true, results };
}

export async function syncAllBankTransactions(auth, options = {}) {
	const trigger = options.trigger || 'manual';
	const { data: syncSettings, error: syncSettingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('mercury_sync_enabled,mercury_api_key_ciphertext')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (syncSettingsError) throw new Error('Unable to read provider sync settings.');
	const { data: connections, error: connectionsError } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.select('provider,status')
		.eq('group_id', auth.group.id);
	if (connectionsError) throw new Error(connectionsError.message);
	const connectionsByProvider = new Map(
		(connections ?? []).map((connection) => [connection.provider, connection])
	);
	const stripeConnection = await loadGroupStripeConnection(auth);
	let inserted = 0;
	let updated = 0;
	let corrections = 0;
	let skipped = 0;
	const errors = [];
	const providers = {};

	if (
		trigger === 'cron'
			? shouldScheduleMercurySync(syncSettings, connectionsByProvider.get('mercury'))
			: shouldSyncBankProvider(connectionsByProvider.get('mercury'))
	) {
		try {
			const result = await syncMercuryTransactions(auth, { runAutoMatch: false, trigger });
			providers.mercury = result;
			inserted += Number(result?.inserted || 0);
			updated += Number(result?.updated || 0);
			corrections += Number(result?.corrections || 0);
		} catch (error) {
			errors.push(`Mercury: ${error?.message || 'Sync failed.'}`);
		}
	}

	if (shouldSyncBankProvider(connectionsByProvider.get('stripe_financial_connections'))) {
		try {
			const result = await syncStripeFinancialConnectionsTransactions(auth, null, {
				runAutoMatch: false,
				trigger
			});
			providers.stripe_financial_connections = result;
			inserted += Number(result?.inserted || 0);
			updated += Number(result?.updated || 0);
			corrections += Number(result?.corrections || 0);
		} catch (error) {
			errors.push(`Linked accounts: ${error?.message || 'Sync failed.'}`);
		}
	}

	if (stripeConnection.connected && connectionsByProvider.get('stripe')?.status !== 'disabled') {
		try {
			const result = await syncStripeTransactions(auth, { runAutoMatch: false, trigger });
			providers.stripe = result;
			inserted += Number(result?.inserted || 0);
			updated += Number(result?.updated || 0);
			corrections += Number(result?.corrections || 0);
			skipped += Number(result?.invalid_count || 0);
		} catch (error) {
			errors.push(`Stripe: ${error?.message || 'Sync failed.'}`);
		}
	}

	if (skipped) {
		errors.push(
			`Skipped ${skipped} Stripe balance transactions with invalid IDs, dates, currencies, amounts, fees, or net values.`
		);
	}
	await autoMatchFeedItems(auth);
	const hasPartialProvider = Object.values(providers).some((provider) =>
		['pending', 'partial', 'failed', 'skipped'].includes(provider?.sync_status)
	);
	return {
		ok: errors.length === 0 && !hasPartialProvider && skipped === 0,
		sync_status: errors.length || hasPartialProvider || skipped ? 'partial' : 'succeeded',
		inserted,
		updated,
		corrections,
		skipped,
		providers,
		errors
	};
}

export async function reclassifyReceipt(auth, formData) {
	const receiptId = cleanText(formData.get('receiptId'));
	const { data: receipt, error } = await auth.serviceSupabase
		.from('group_accounting_receipts')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('id', receiptId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!receipt) throw new Error('Receipt not found.');
	const classification = {
		...classifyReceipt(receipt.file_name, receipt.mime_type),
		reviewed_by: auth.userId,
		reviewed_at: new Date().toISOString(),
		suggested_amount_cents: centsFromAmount(formData.get('amount')) ?? null,
		suggested_vendor: cleanText(formData.get('vendor'), 160) || null,
		suggested_date: cleanText(formData.get('receiptDate')) || null
	};
	const { error: updateError } = await auth.serviceSupabase
		.from('group_accounting_receipts')
		.update({
			classification_status: 'classified',
			classification,
			extracted_fields: classification,
			extracted_text: cleanText(formData.get('extractedText'), 5000) || receipt.extracted_text
		})
		.eq('id', receipt.id);
	if (updateError) throw new Error(updateError.message);
	await auditEvent(auth, 'classify_receipt', 'receipt', receipt.id, receipt, classification);
}

export async function buildEntriesCsv(auth) {
	const entries = await fetchAllRows((fromRow, toRow) =>
		auth.serviceSupabase
			.from('group_accounting_entries')
			.select('*')
			.eq('group_id', auth.group.id)
			.order('entry_date', { ascending: false })
			.order('id', { ascending: false })
			.range(fromRow, toRow)
	);
	await auth.serviceSupabase.from('group_accounting_exports').insert({
		group_id: auth.group.id,
		created_by_user_id: auth.userId,
		export_type: 'entries_csv',
		filter_json: {}
	});
	return [
		['date', 'type', 'status', 'description', 'amount_cents', 'currency', 'source'].join(','),
		...(entries ?? []).map((entry) =>
			[
				entry.entry_date,
				entry.entry_type,
				entry.status,
				csvEscape(entry.description),
				entry.amount_cents,
				entry.currency,
				entry.source
			].join(',')
		)
	].join('\n');
}

export async function buildAccountingReportCsv(auth, options = {}) {
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, options);
	const rows = [];
	rows.push(
		[
			'report_period',
			csvEscape(options.label || options.period || 'custom'),
			csvEscape(report.from),
			csvEscape(report.to)
		].join(',')
	);
	rows.push(
		['section', 'kind', 'code', 'name', 'display_group', 'period_cents', 'balance_cents'].join(',')
	);

	const pushAccountRows = (section, accounts, usePeriodBalance = false) => {
		for (const account of accounts) {
			rows.push(
				[
					csvEscape(section),
					csvEscape(account.kind),
					csvEscape(account.code),
					csvEscape(account.name),
					csvEscape(account.display_group),
					usePeriodBalance
						? Number(account.period_balance_cents || 0)
						: Number(account.balance_cents || 0),
					Number(account.balance_cents || 0)
				].join(',')
			);
		}
	};

	rows.push(
		[
			csvEscape('summary'),
			csvEscape('income'),
			'',
			csvEscape('Total income'),
			'',
			Number(report.totals?.income_cents || 0),
			''
		].join(',')
	);
	rows.push(
		[
			csvEscape('summary'),
			csvEscape('expense'),
			'',
			csvEscape('Total expenses'),
			'',
			Number(report.totals?.expense_cents || 0),
			''
		].join(',')
	);
	rows.push(
		[
			csvEscape('summary'),
			csvEscape('net'),
			'',
			csvEscape('Net activity'),
			'',
			Number(report.totals?.net_cents || 0),
			''
		].join(',')
	);
	rows.push(
		[
			csvEscape('summary'),
			csvEscape('position'),
			'',
			csvEscape('Cash on hand'),
			'',
			Number((report.totals?.assets_cents || 0) - (report.totals?.liabilities_cents || 0)),
			''
		].join(',')
	);

	pushAccountRows('income', report.income, true);
	pushAccountRows('expense', report.expenses, true);
	pushAccountRows('asset', report.assets, false);
	pushAccountRows('liability', report.liabilities, false);
	pushAccountRows('equity', report.equity, false);

	await auth.serviceSupabase.from('group_accounting_exports').insert({
		group_id: auth.group.id,
		created_by_user_id: auth.userId,
		export_type: 'report_csv',
		filter_json: {
			period: options.period || 'custom',
			from: report.from,
			to: report.to
		}
	});

	return rows.join('\n');
}

export async function postDonationToGroupAccounting({
	supabase,
	groupId,
	donation,
	source = 'donation'
}) {
	if (!groupId || !donation?.id) return null;
	const { data: group } = await supabase
		.from('groups')
		.select('id,slug,name')
		.eq('id', groupId)
		.maybeSingle();
	if (!group) return null;
	const { settings, accounts } = await ensureGroupAccountingSetup(supabase, group, null);
	const stripe = accountByCode(accounts, '1030');
	const donations = accountByCode(accounts, source === 'membership' ? '4010' : '4000');
	const amountCents = Number(donation.amount_total_cents || donation.amount_cents || 0);
	if (amountCents <= 0) return null;
	const currency = requireGroupCurrency(donation.currency, settings.currency);
	return insertBalancedEntry(
		supabase,
		groupId,
		{
			entry_date: dateOnly(donation.paid_at || donation.created_at),
			entry_type: source,
			source,
			source_id: donation.id,
			description: source === 'membership' ? 'Membership payment' : 'Donation received',
			memo: donation.donor_name ? `From ${donation.donor_name}` : null,
			amount_cents: amountCents,
			currency,
			metadata: {
				donation_id: donation.id,
				stripe_payment_intent_id: donation.stripe_payment_intent_id || null
			}
		},
		[
			{ account_id: stripe.id, debit_cents: amountCents },
			{ account_id: donations.id, credit_cents: amountCents }
		]
	).catch((error) => {
		if (!String(error?.message || '').includes('duplicate key')) throw error;
		return null;
	});
}

export function actionFailure(error) {
	return fail(error?.status === 413 ? 413 : 400, {
		accounting_error: error?.message || 'Accounting action failed.'
	});
}
