import path from 'node:path';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import { decryptSocialToken, encryptSocialToken } from '$lib/server/social/crypto';
import { getStripeClient, getStripePublishableKey } from '$lib/server/stripe';
import {
	centsFromAmount,
	centsFromAmountAndDirection,
	centsFromSignedAmount,
	cleanText,
	buildFeedItemsWithMatchCandidates,
	parseCsvRows,
	slugify,
	uniquePublicReportSlug
} from './groupAccountingRules.js';
import { loadGroupStripeConnection } from './groupStripeConnection.js';

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
	return raw.slice(0, 10);
}

function monthKey(value) {
	const date = dateOnly(value);
	return date.slice(0, 7);
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

function startOfQuarterIso(date) {
	const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
	return isoDateFromParts(date.getFullYear(), quarterStartMonth, 1);
}

function endOfQuarterIso(date) {
	const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
	return isoDateFromDate(new Date(date.getFullYear(), quarterStartMonth + 3, 0));
}

function startOfYearIso(date) {
	return isoDateFromParts(date.getFullYear(), 0, 1);
}

function endOfYearIso(date) {
	return isoDateFromParts(date.getFullYear(), 11, 31);
}

const ACCOUNTING_REPORT_PERIOD_LABELS = {
	this_month: 'This month',
	last_month: 'Last month',
	this_quarter: 'This quarter',
	last_quarter: 'Last quarter',
	this_year: 'This year',
	last_year: 'Last year',
	custom: 'Custom range'
};

export function resolveAccountingReportWindow(url, now = new Date()) {
	const period = cleanText(url?.searchParams?.get('period'), 40) || 'this_year';
	const today = isoDateFromDate(now);
	const currentDate = new Date(`${today}T12:00:00`);
	const currentYear = currentDate.getFullYear();
	const currentMonth = currentDate.getMonth();

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
				from: startOfQuarterIso(currentDate),
				to: today
			};
		case 'last_quarter': {
			const lastQuarterAnchor = new Date(currentYear, currentMonth - 3, 1);
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: startOfQuarterIso(lastQuarterAnchor),
				to: endOfQuarterIso(lastQuarterAnchor)
			};
		}
		case 'last_year': {
			const lastYear = new Date(currentYear - 1, 0, 1);
			return {
				period,
				label: ACCOUNTING_REPORT_PERIOD_LABELS[period],
				from: startOfYearIso(lastYear),
				to: endOfYearIso(lastYear)
			};
		}
		case 'custom': {
			const from = dateOnly(url?.searchParams?.get('from')) || startOfYearIso(currentDate);
			const to = dateOnly(url?.searchParams?.get('to')) || today;
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
				from: startOfYearIso(currentDate),
				to: today
			};
	}
}

function normalizeCurrency(value) {
	return cleanText(value || 'usd', 3).toLowerCase() || 'usd';
}

function accountBalanceCents(account, lines) {
	const debits = lines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0);
	const credits = lines.reduce((sum, line) => sum + Number(line.credit_cents || 0), 0);
	return account.normal_side === 'credit' ? credits - debits : debits - credits;
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

function csvEscape(value) {
	const text = String(value ?? '');
	if (!/[",\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
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
	const response = await fetch(url, {
		...options,
		headers: {
			'content-type': 'application/json',
			...(options.headers ?? {})
		}
	});
	const payload = await response.json().catch(() => ({}));
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
	const { accessToken, user } = resolveSession(cookies);
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

async function insertBalancedEntry(supabase, groupId, entry, lines) {
	const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0);
	const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit_cents || 0), 0);
	if (debitTotal !== creditTotal) throw new Error('This entry does not balance.');
	if (debitTotal <= 0) throw new Error('Amount must be greater than zero.');

	const { data: inserted, error } = await supabase
		.from('group_accounting_entries')
		.insert({
			...entry,
			group_id: groupId,
			amount_cents: entry.amount_cents ?? debitTotal,
			posted_at: entry.status === 'draft' ? null : new Date().toISOString()
		})
		.select('*')
		.single();
	if (error) throw new Error(error.message);

	const lineRows = lines.map((line) => ({
		entry_id: inserted.id,
		group_id: groupId,
		account_id: line.account_id,
		description: line.description || entry.description,
		debit_cents: Number(line.debit_cents || 0),
		credit_cents: Number(line.credit_cents || 0)
	}));

	const { error: lineError } = await supabase.from('group_accounting_lines').insert(lineRows);
	if (lineError) {
		await supabase.from('group_accounting_entries').delete().eq('id', inserted.id);
		throw new Error(lineError.message);
	}
	return inserted;
}

export async function postSimpleEntry(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
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
	const currency = normalizeCurrency(formData.get('currency'));

	if (!['income', 'expense'].includes(flow)) throw new Error('Choose money in or money out.');
	if (!amountCents || amountCents <= 0) throw new Error('Enter an amount greater than zero.');
	if (!description) throw new Error('Add a short description.');

	const cashAccount = accounts.find(
		(account) => account.id === cashAccountId && ['asset', 'liability'].includes(account.kind)
	);
	const categoryAccount = accounts.find(
		(account) => account.id === categoryAccountId && account.kind === flow
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
				]
	);

	await maybeStoreReceipt(auth, entry.id, formData.get('receipt'));
	return entry;
}

export async function postTransfer(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
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
	const fromAccount = accounts.find((account) => account.id === fromAccountId);
	const toAccount = accounts.find((account) => account.id === toAccountId);
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
			currency: normalizeCurrency(formData.get('currency')),
			created_by_user_id: auth.userId
		},
		[
			{ account_id: toAccount.id, debit_cents: amountCents },
			{ account_id: fromAccount.id, credit_cents: amountCents }
		]
	);
}

export async function postJournal(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const rows = JSON.parse(cleanText(formData.get('linesJson')) || '[]');
	const description = cleanText(formData.get('description'), 200);
	if (!description) throw new Error('Add a journal description.');
	if (!Array.isArray(rows) || rows.length < 2) throw new Error('Add at least two lines.');

	const lines = rows
		.map((row) => {
			const account = accounts.find((candidate) => candidate.id === cleanText(row.account_id));
			if (!account) return null;
			return {
				account_id: account.id,
				description: cleanText(row.description, 200) || description,
				debit_cents: centsFromAmount(row.debit || 0) || 0,
				credit_cents: centsFromAmount(row.credit || 0) || 0
			};
		})
		.filter(Boolean)
		.filter((line) => line.debit_cents > 0 || line.credit_cents > 0);

	return insertBalancedEntry(
		auth.serviceSupabase,
		auth.group.id,
		{
			entry_date: dateOnly(formData.get('entryDate')),
			entry_type: 'journal',
			source: 'manual',
			description,
			memo: cleanText(formData.get('memo'), 1000) || null,
			currency: normalizeCurrency(formData.get('currency')),
			created_by_user_id: auth.userId,
			metadata: { advanced: true }
		},
		lines
	);
}

export async function postOpeningBalance(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const amountCents = centsFromAmount(formData.get('amount'));
	const accountId = cleanText(formData.get('accountId'));
	const cashAccount = accounts.find(
		(account) => account.id === accountId && account.kind === 'asset'
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
			currency: normalizeCurrency(formData.get('currency')),
			created_by_user_id: auth.userId
		},
		[
			{ account_id: cashAccount.id, debit_cents: amountCents },
			{ account_id: equity.id, credit_cents: amountCents }
		]
	);
}

export async function createAccount(auth, formData) {
	const kind = cleanText(formData.get('kind'));
	const normalSide = ['asset', 'expense'].includes(kind) ? 'debit' : 'credit';
	const name = cleanText(formData.get('name'), 120);
	const code = cleanText(formData.get('code'), 20);
	if (!name || !code) throw new Error('Name and code are required.');
	if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(kind))
		throw new Error('Choose a valid account type.');
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
		sort_order: Number(formData.get('sortOrder') || 900)
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
	const year = Number(formData.get('year') || currentYear());
	const accountId = cleanText(formData.get('accountId'));
	const amountCents = centsFromAmount(formData.get('amount')) ?? 0;
	const monthly = {};
	for (let i = 1; i <= 12; i += 1) {
		const cents = centsFromAmount(formData.get(`month_${i}`));
		if (cents !== null && cents > 0) monthly[String(i).padStart(2, '0')] = cents;
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
	if (!mercuryKey) return;
	const updates = {};
	const encryptedKey = encryptSocialToken(mercuryKey);
	updates.mercury_api_key_ciphertext = encryptedKey;
	updates.mercury_api_key_hint = mercuryKey.slice(-4).padStart(Math.min(mercuryKey.length, 8), '*');
	updates.mercury_connected_at = new Date().toISOString();
	const { error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.update(updates)
		.eq('group_id', auth.group.id);
	if (settingsError) throw new Error(settingsError.message);
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
	const amountCents = centsFromSignedAmount(formData.get('amount'));
	const description = cleanText(formData.get('description'), 200);
	if (!amountCents || !description) throw new Error('Amount and description are required.');
	const { error } = await auth.serviceSupabase.from('group_accounting_bank_feed_items').insert({
		group_id: auth.group.id,
		provider: 'manual',
		source_transaction_id: `manual:${randomUUID()}`,
		transaction_date: dateOnly(formData.get('transactionDate')),
		description,
		amount_cents: amountCents,
		currency: normalizeCurrency(formData.get('currency')),
		status: 'needs_review',
		raw: { entered_by: auth.userId }
	});
	if (error) throw new Error(error.message);
}

export async function importBankCsv(auth, formData) {
	const { accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const accountId = cleanText(formData.get('accountId'));
	const selectedAccount = accounts.find(
		(account) => account.id === accountId && ['asset', 'liability'].includes(account.kind)
	);
	if (!selectedAccount) {
		throw new Error('Choose a bank account to associate with this upload.');
	}
	const file = formData.get('csvFile');
	if (!(file instanceof File) || file.size <= 0) throw new Error('Choose a CSV file.');
	const textValue = await file.text();
	const rows = parseCsvRows(textValue);
	if (rows.length < 2)
		throw new Error('CSV must include a header row and at least one transaction.');
	const headers = rows[0].map((header) => cleanText(header).toLowerCase());
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
	if (
		dateIndex < 0 ||
		descriptionIndex < 0 ||
		(amountIndex < 0 && debitIndex < 0 && creditIndex < 0)
	) {
		throw new Error('CSV needs date, description/name, and amount or debit/credit columns.');
	}
	const transactions = rows
		.slice(1)
		.map((row, index) => {
			let amount = null;
			if (amountIndex >= 0) {
				amount = centsFromAmountAndDirection(row[amountIndex], row[signIndex]);
			} else {
				amount = (centsFromAmount(row[creditIndex]) || 0) - (centsFromAmount(row[debitIndex]) || 0);
			}
			const description = cleanText(row[descriptionIndex], 200);
			const date = cleanText(row[dateIndex]);
			if (!date || !description || amount === null || amount === 0) return null;
			return {
				id: `csv:${file.name}:${index}:${date}:${description}:${amount}`,
				date,
				description,
				amount_cents: amount,
				currency: normalizeCurrency(formData.get('currency') || 'usd'),
				raw: { row }
			};
		})
		.filter(Boolean);
	if (!transactions.length) throw new Error('CSV did not contain any valid transaction rows.');
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
	const inserted = await upsertFeedItems(auth, connection, 'manual', transactions, {
		defaultAccountId: selectedAccount.id
	});
	await autoMatchFeedItems(auth);
	await auditEvent(auth, 'import_csv', 'bank_feed_item', null, null, null, {
		file_name: file.name,
		rows: transactions.length,
		inserted
	});
	return inserted;
}

export async function postFeedItem(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const accountId = cleanText(formData.get('accountId'));
	const categoryAccountId = cleanText(formData.get('categoryAccountId'));
	const { accounts } = await ensureGroupAccountingSetup(
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
	if (!['needs_review', 'matched'].includes(item.status)) {
		throw new Error('This bank activity has already been handled.');
	}
	if (item.matched_entry_id) {
		const { error: confirmError } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				status: 'posted',
				account_id: accountId || item.account_id,
				suggested_account_id: categoryAccountId || item.suggested_account_id
			})
			.eq('group_id', auth.group.id)
			.eq('id', item.id)
			.in('status', ['needs_review', 'matched']);
		if (confirmError) throw new Error(confirmError.message);
		return;
	}
	const amount = Number(item.amount_cents || 0);
	const flow = amount >= 0 ? 'income' : 'expense';
	const cashAccount = accounts.find(
		(account) => account.id === accountId && ['asset', 'liability'].includes(account.kind)
	);
	const categoryAccount = accounts.find(
		(account) =>
			account.id === categoryAccountId &&
			(account.kind === flow || ['asset', 'liability'].includes(account.kind))
	);
	if (!cashAccount) throw new Error('Choose where the money moved.');
	if (!categoryAccount) throw new Error('Choose a category.');
	const amountCents = Math.abs(amount);
	const isTransferAccount = ['asset', 'liability'].includes(categoryAccount.kind);
	if (isTransferAccount && categoryAccount.id === cashAccount.id) {
		throw new Error('Choose two different accounts.');
	}
	const { data: existingEntry, error: existingEntryError } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select('id')
		.eq('group_id', auth.group.id)
		.eq('source', 'bank_feed')
		.eq('source_id', item.id)
		.maybeSingle();
	if (existingEntryError) throw new Error(existingEntryError.message);
	if (existingEntry) {
		const { error: existingUpdateError } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				status: 'posted',
				matched_entry_id: existingEntry.id,
				account_id: accountId,
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
				...(isTransferAccount ? { transfer_account_id: categoryAccount.id } : {})
			}
		},
		isTransferAccount
			? amount >= 0
				? [
						{ account_id: cashAccount.id, debit_cents: amountCents },
						{ account_id: categoryAccount.id, credit_cents: amountCents }
					]
				: [
						{ account_id: categoryAccount.id, debit_cents: amountCents },
						{ account_id: cashAccount.id, credit_cents: amountCents }
					]
			: flow === 'income'
				? [
						{ account_id: cashAccount.id, debit_cents: amountCents },
						{ account_id: categoryAccount.id, credit_cents: amountCents }
					]
				: [
						{ account_id: categoryAccount.id, debit_cents: amountCents },
						{ account_id: cashAccount.id, credit_cents: amountCents }
					]
	);
	const { error: updateError } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.update({
			status: 'posted',
			matched_entry_id: entry.id,
			account_id: accountId,
			suggested_account_id: categoryAccountId
		})
		.eq('group_id', auth.group.id)
		.eq('id', item.id)
		.in('status', ['needs_review', 'matched']);
	if (updateError) throw new Error(updateError.message);
}

export async function matchFeedItemToEntry(auth, formData) {
	const feedItemId = cleanText(formData.get('feedItemId'));
	const entryId = cleanText(formData.get('entryId'));
	const accountId = cleanText(formData.get('accountId'));
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
			.select('id, entry_date, amount_cents, status')
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
	if (entry.status !== 'posted') throw new Error('Only posted transactions can be matched.');
	if (accountId) {
		const { data: account, error: accountError } = await auth.serviceSupabase
			.from('group_accounting_accounts')
			.select('id, kind')
			.eq('group_id', auth.group.id)
			.eq('id', accountId)
			.maybeSingle();
		if (accountError) throw new Error(accountError.message);
		if (!account || !['asset', 'liability'].includes(account.kind)) {
			throw new Error('Choose a cash account.');
		}
	}
	if (Math.abs(Number(entry.amount_cents || 0)) !== Math.abs(Number(item.amount_cents || 0))) {
		throw new Error('Matched transactions must have the same amount.');
	}
	const { data: existingMatch, error: existingMatchError } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.select('id')
		.eq('group_id', auth.group.id)
		.eq('matched_entry_id', entry.id)
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
			account_id: accountId || item.account_id,
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
	if (error) throw new Error(error.message);
	return data;
}

export async function saveSettings(auth, formData) {
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
			fiscal_year_start_month: Number(formData.get('fiscalYearStartMonth') || 1)
		})
		.eq('group_id', auth.group.id);
	if (error) throw new Error(error.message);
}

export async function createReconciliation(auth, formData) {
	const accountId = cleanText(formData.get('accountId'));
	const statementEndingBalanceCents = centsFromSignedAmount(formData.get('statementEndingBalance'));
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, {
		to: dateOnly(formData.get('statementEndingDate'))
	});
	const account = report.accounts.find((candidate) => candidate.id === accountId);
	if (!account) throw new Error('Account not found.');
	const differenceCents =
		Number(statementEndingBalanceCents || 0) - Number(account.balance_cents || 0);
	const { error } = await auth.serviceSupabase.from('group_accounting_reconciliations').insert({
		group_id: auth.group.id,
		account_id: accountId,
		statement_ending_date: dateOnly(formData.get('statementEndingDate')),
		statement_ending_balance_cents: Number(statementEndingBalanceCents || 0),
		book_balance_cents: Number(account.balance_cents || 0),
		difference_cents: differenceCents,
		status: differenceCents === 0 ? 'completed' : 'draft',
		completed_by_user_id: differenceCents === 0 ? auth.userId : null,
		completed_at: differenceCents === 0 ? new Date().toISOString() : null
	});
	if (error) throw new Error(error.message);
}

export async function buildAccountingReport(supabase, groupId, options = {}) {
	const from = options.from || `${currentYear()}-01-01`;
	const to = options.to || new Date().toISOString().slice(0, 10);
	const { data: accounts, error: accountsError } = await supabase
		.from('group_accounting_accounts')
		.select('*')
		.eq('group_id', groupId)
		.order('sort_order', { ascending: true });
	if (accountsError) throw new Error(accountsError.message);

	const { data: entries, error: entriesError } = await supabase
		.from('group_accounting_entries')
		.select('id,entry_date,status,description,entry_type')
		.eq('group_id', groupId)
		.eq('status', 'posted')
		.lte('entry_date', to);
	if (entriesError) throw new Error(entriesError.message);

	const entriesById = new Map((entries ?? []).map((entry) => [entry.id, entry]));
	let lines = [];
	if (entriesById.size) {
		const { data: lineRows, error: linesError } = await supabase
			.from('group_accounting_lines')
			.select('*')
			.eq('group_id', groupId)
			.in('entry_id', Array.from(entriesById.keys()));
		if (linesError) throw new Error(linesError.message);
		lines = (lineRows ?? []).map((line) => ({
			...line,
			entry: entriesById.get(line.entry_id)
		}));
	}

	const periodLines = (lines ?? []).filter((line) => line.entry?.entry_date >= from);
	const accountsWithBalances = (accounts ?? []).map((account) => {
		const allAccountLines = (lines ?? []).filter((line) => line.account_id === account.id);
		const periodAccountLines = periodLines.filter((line) => line.account_id === account.id);
		return {
			...account,
			balance_cents: accountBalanceCents(account, allAccountLines),
			period_balance_cents: accountBalanceCents(account, periodAccountLines)
		};
	});

	const income = accountsWithBalances.filter((account) => account.kind === 'income');
	const expenses = accountsWithBalances.filter((account) => account.kind === 'expense');
	const assets = accountsWithBalances.filter((account) => account.kind === 'asset');
	const liabilities = accountsWithBalances.filter((account) => account.kind === 'liability');
	const equity = accountsWithBalances.filter((account) => account.kind === 'equity');
	const totalIncome = income.reduce((sum, account) => sum + account.period_balance_cents, 0);
	const totalExpenses = expenses.reduce((sum, account) => sum + account.period_balance_cents, 0);
	const net = totalIncome - totalExpenses;

	const monthly = {};
	for (const line of periodLines) {
		const account = accountsWithBalances.find((candidate) => candidate.id === line.account_id);
		if (!account || !['income', 'expense'].includes(account.kind)) continue;
		const key = monthKey(line.entry.entry_date);
		monthly[key] ??= { income_cents: 0, expense_cents: 0, net_cents: 0 };
		const amount =
			account.normal_side === 'credit'
				? Number(line.credit_cents || 0) - Number(line.debit_cents || 0)
				: Number(line.debit_cents || 0) - Number(line.credit_cents || 0);
		if (account.kind === 'income') monthly[key].income_cents += amount;
		if (account.kind === 'expense') monthly[key].expense_cents += amount;
		monthly[key].net_cents = monthly[key].income_cents - monthly[key].expense_cents;
	}

	return {
		from,
		to,
		accounts: accountsWithBalances,
		income,
		expenses,
		assets,
		liabilities,
		equity,
		totals: {
			income_cents: totalIncome,
			expense_cents: totalExpenses,
			net_cents: net,
			assets_cents: assets.reduce((sum, account) => sum + account.balance_cents, 0),
			liabilities_cents: liabilities.reduce((sum, account) => sum + account.balance_cents, 0),
			equity_cents: equity.reduce((sum, account) => sum + account.balance_cents, 0) + net
		},
		monthly: Object.entries(monthly)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, value]) => ({ month, ...value }))
	};
}

export async function loadAccountingDashboard(auth, url) {
	const { settings, accounts } = await ensureGroupAccountingSetup(
		auth.serviceSupabase,
		auth.group,
		auth.userId
	);
	const reportWindow = resolveAccountingReportWindow(url);
	const year = Number(url?.searchParams?.get('year') || currentYear());
	const bankReviewPageSize = 50;
	const requestedBankReviewPage = Math.max(
		1,
		Number.parseInt(url?.searchParams?.get('bankReviewPage') || '1', 10) || 1
	);
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, {
		from: reportWindow.from,
		to: reportWindow.to
	});

	const { count: bankReviewTotal = 0 } = await auth.serviceSupabase
		.from('group_accounting_bank_feed_items')
		.select('id', { count: 'exact', head: true })
		.eq('group_id', auth.group.id)
		.in('status', ['needs_review', 'matched']);
	const bankReviewTotalPages =
		bankReviewTotal > 0 ? Math.ceil(bankReviewTotal / bankReviewPageSize) : 0;
	const bankReviewPage = bankReviewTotalPages
		? Math.min(requestedBankReviewPage, bankReviewTotalPages)
		: 1;
	const bankReviewOffset = (bankReviewPage - 1) * bankReviewPageSize;

	const [
		{ data: entries },
		{ data: budgets },
		{ data: feedItems },
		{ data: connections },
		{ data: reconciliations },
		{ data: snapshots },
		{ data: providerAccounts },
		{ data: receipts },
		{ data: auditEvents },
		{ data: matchedFeedItems },
		stripeConnection
	] = await Promise.all([
		auth.serviceSupabase
			.from('group_accounting_entries')
			.select(
				'*, receipts:group_accounting_receipts(id,file_name), lines:group_accounting_lines(*, account:group_accounting_accounts(id,code,name,kind))'
			)
			.eq('group_id', auth.group.id)
			.order('entry_date', { ascending: false })
			.order('created_at', { ascending: false })
			.limit(500),
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
			.select('*')
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
			.from('group_accounting_receipts')
			.select('*, entry:group_accounting_entries(description,entry_date,amount_cents)')
			.eq('group_id', auth.group.id)
			.order('created_at', { ascending: false })
			.limit(25),
		auth.serviceSupabase
			.from('group_accounting_audit_events')
			.select('*')
			.eq('group_id', auth.group.id)
			.order('created_at', { ascending: false })
			.limit(12),
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('matched_entry_id')
			.eq('group_id', auth.group.id)
			.not('matched_entry_id', 'is', null)
			.in('status', ['matched', 'posted']),
		loadGroupStripeConnection(auth)
	]);

	const budgetRows = (budgets ?? []).map((budget) => {
		const actual =
			report.accounts.find((account) => account.id === budget.account_id)?.period_balance_cents ??
			0;
		return {
			...budget,
			actual_cents: actual,
			remaining_cents: Number(budget.amount_cents || 0) - actual
		};
	});

	return {
		settings: {
			...settings,
			public_visibility: normalizeVisibility(settings?.public_visibility)
		},
		accounts,
		report,
		entries: entries ?? [],
		budgets: budgetRows,
		feed_items: buildFeedItemsWithMatchCandidates(
			feedItems ?? [],
			entries ?? [],
			(matchedFeedItems ?? []).map((item) => item.matched_entry_id)
		),
		bank_review_page: bankReviewPage,
		bank_review_page_size: bankReviewPageSize,
		bank_review_total: bankReviewTotal,
		bank_review_total_pages: bankReviewTotalPages,
		connections: connections ?? [],
		provider_accounts: providerAccounts ?? [],
		receipts: receipts ?? [],
		audit_events: auditEvents ?? [],
		reconciliations: reconciliations ?? [],
		public_reports: snapshots ?? [],
		stripe_connection: stripeConnection,
		year,
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
	const from = dateOnly(formData.get('from'));
	const to = dateOnly(formData.get('to'));
	const title = cleanText(formData.get('title'), 160) || `Financial snapshot ${to}`;
	const notes = cleanText(formData.get('notes'), 1200) || null;
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, { from, to });
	const visibility = normalizeVisibility({
		activity: formData.get('showActivity') === 'on',
		position: formData.get('showPosition') === 'on',
		budgets: formData.get('showBudgets') === 'on',
		cash: formData.get('showCash') === 'on',
		notes: formData.get('showNotes') === 'on'
	});
	const { data: budgets } = await auth.serviceSupabase
		.from('group_accounting_budgets')
		.select('*, account:group_accounting_accounts(code,name,kind)')
		.eq('group_id', auth.group.id)
		.eq('year', Number(from.slice(0, 4)));

	const snapshot = {
		report,
		budgets: budgets ?? [],
		generated_at: new Date().toISOString(),
		group: { id: auth.group.id, name: auth.group.name, slug: auth.group.slug }
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
		notes,
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

	const reversal = await insertBalancedEntry(
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

	const after = {
		status: 'void',
		voided_at: new Date().toISOString(),
		reversed_entry_id: reversal.id,
		metadata: { ...(entry.metadata ?? {}), void_reason: reason }
	};
	const { error: updateError } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.update(after)
		.eq('id', entry.id);
	if (updateError) throw new Error(updateError.message);
	await auditEvent(
		auth,
		'void',
		'entry',
		entry.id,
		entry,
		{ ...entry, ...after },
		{ reversal_id: reversal.id }
	);
}

export async function updateEntryByReplacement(auth, formData) {
	const entryId = cleanText(formData.get('entryId'));
	if (!entryId) throw new Error('Entry id is required.');
	const voidForm = new FormData();
	voidForm.set('entryId', entryId);
	voidForm.set('reason', 'Edited by replacement entry');
	voidForm.set('entryDate', formData.get('entryDate') || new Date().toISOString());
	await voidEntry(auth, voidForm);
	return postSimpleEntry(auth, formData);
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

	const { error: updateError } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.update({
			entry_date: entryDate,
			description,
			memo
		})
		.eq('group_id', auth.group.id)
		.eq('id', entry.id);
	if (updateError) throw new Error(updateError.message);

	for (const line of lineAccountUpdates) {
		const { error: lineUpdateError } = await auth.serviceSupabase
			.from('group_accounting_lines')
			.update({ account_id: line.accountId })
			.eq('group_id', auth.group.id)
			.eq('id', line.lineId);
		if (lineUpdateError) throw new Error(lineUpdateError.message);
	}

	if (entry.source === 'bank_feed' && entry.source_id) {
		const bankAccountLine = lineAccountUpdates.find((line) =>
			['asset', 'liability'].includes(line.accountKind)
		);
		await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				transaction_date: entryDate,
				description,
				...(bankAccountLine ? { account_id: bankAccountLine.accountId } : {})
			})
			.eq('group_id', auth.group.id)
			.eq('id', entry.source_id);
	}

	await auditEvent(auth, 'update', 'entry', entry.id, entry, {
		...entry,
		entry_date: entryDate,
		description,
		memo,
		line_accounts: lineAccountUpdates.map((line) => ({
			line_id: line.lineId,
			account_id: line.accountId
		}))
	});
}

export async function autoMatchFeedItems(auth) {
	const [{ data: feedItems }, { data: entries }, { data: existingMatches }] = await Promise.all([
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('status', 'needs_review')
			.order('transaction_date', { ascending: false })
			.limit(200),
		auth.serviceSupabase
			.from('group_accounting_entries')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('status', 'posted')
			.order('entry_date', { ascending: false })
			.limit(500),
		auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.select('matched_entry_id')
			.eq('group_id', auth.group.id)
			.not('matched_entry_id', 'is', null)
			.in('status', ['matched', 'posted'])
	]);
	const usedEntryIds = new Set((existingMatches ?? []).map((match) => match.matched_entry_id));
	const updates = [];
	for (const item of feedItems ?? []) {
		const match = (entries ?? []).find((entry) => {
			if (usedEntryIds.has(entry.id)) return false;
			const sameAmount =
				Math.abs(Number(entry.amount_cents || 0)) === Math.abs(Number(item.amount_cents || 0));
			const dateDelta = Math.abs(
				new Date(entry.entry_date).getTime() - new Date(item.transaction_date).getTime()
			);
			return sameAmount && dateDelta <= 3 * 24 * 60 * 60 * 1000;
		});
		if (match) {
			usedEntryIds.add(match.id);
			updates.push(
				auth.serviceSupabase
					.from('group_accounting_bank_feed_items')
					.update({
						status: 'matched',
						matched_entry_id: match.id,
						match_confidence: 0.92,
						match_reason: 'Same amount within three days'
					})
					.eq('group_id', auth.group.id)
					.eq('id', item.id)
			);
		}
	}
	const results = await Promise.all(updates);
	const updateError = results.find((result) => result.error)?.error;
	if (updateError) throw new Error(updateError.message);
	await auditEvent(auth, 'auto_match', 'bank_feed_item', null, null, null, {
		matched: updates.length
	});
	return updates.length;
}

export async function completeAutomatedReconciliation(auth, formData) {
	const accountId = cleanText(formData.get('accountId'));
	const statementEndingDate = dateOnly(formData.get('statementEndingDate'));
	const statementEndingBalanceCents = centsFromSignedAmount(formData.get('statementEndingBalance'));
	const checkedIds = cleanText(formData.get('checkedFeedItemIds'))
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const report = await buildAccountingReport(auth.serviceSupabase, auth.group.id, {
		to: statementEndingDate
	});
	const account = report.accounts.find((candidate) => candidate.id === accountId);
	if (!account) throw new Error('Account not found.');
	const differenceCents =
		Number(statementEndingBalanceCents || 0) - Number(account.balance_cents || 0);
	const { data: reconciliation, error } = await auth.serviceSupabase
		.from('group_accounting_reconciliations')
		.insert({
			group_id: auth.group.id,
			account_id: accountId,
			statement_ending_date: statementEndingDate,
			statement_ending_balance_cents: Number(statementEndingBalanceCents || 0),
			book_balance_cents: Number(account.balance_cents || 0),
			difference_cents: differenceCents,
			status: differenceCents === 0 ? 'completed' : 'draft',
			checked_feed_item_ids: checkedIds,
			completed_by_user_id: differenceCents === 0 ? auth.userId : null,
			completed_at: differenceCents === 0 ? new Date().toISOString() : null
		})
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	if (checkedIds.length) {
		const { error: clearError } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.update({
				cleared_at: new Date().toISOString(),
				reconciliation_id: reconciliation.id
			})
			.eq('group_id', auth.group.id)
			.in('id', checkedIds);
		if (clearError) throw new Error(clearError.message);
	}
	if (differenceCents === 0) {
		const { data: candidateEntries, error: candidateError } = await auth.serviceSupabase
			.from('group_accounting_entries')
			.select('id')
			.eq('group_id', auth.group.id)
			.lte('entry_date', statementEndingDate);
		if (candidateError) throw new Error(candidateError.message);
		const candidateIds = (candidateEntries ?? []).map((entry) => entry.id);
		if (candidateIds.length) {
			const { data: accountLines, error: lineError } = await auth.serviceSupabase
				.from('group_accounting_lines')
				.select('entry_id')
				.eq('group_id', auth.group.id)
				.eq('account_id', accountId)
				.in('entry_id', candidateIds);
			if (lineError) throw new Error(lineError.message);
			const lockEntryIds = [...new Set((accountLines ?? []).map((line) => line.entry_id))];
			if (lockEntryIds.length) {
				const { error: lockError } = await auth.serviceSupabase
					.from('group_accounting_entries')
					.update({ locked_at: new Date().toISOString() })
					.eq('group_id', auth.group.id)
					.in('id', lockEntryIds);
				if (lockError) throw new Error(lockError.message);
			}
		}
	}
	await auditEvent(auth, 'reconcile', 'reconciliation', reconciliation.id, null, reconciliation, {
		checked_feed_items: checkedIds.length
	});
}

async function upsertProviderAccounts(auth, connection, provider, accounts = []) {
	const rows = accounts
		.map((account) => ({
			group_id: auth.group.id,
			connection_id: connection.id,
			provider,
			external_account_id: providerExternalAccountId(account),
			display_name: cleanText(
				account.name || account.official_name || account.nickname || 'Bank account'
			),
			account_type: cleanText(account.type),
			account_subtype: cleanText(account.subtype),
			mask: cleanText(account.mask || account.lastFour),
			current_balance_cents: Math.round(
				Number(account.balances?.current ?? account.currentBalance ?? 0) * 100
			),
			available_balance_cents: Math.round(
				Number(account.balances?.available ?? account.availableBalance ?? 0) * 100
			),
			currency: normalizeCurrency(account.balances?.iso_currency_code || account.currency || 'usd'),
			raw: account
		}))
		.filter((row) => row.external_account_id);
	if (rows.length) {
		const { error } = await auth.serviceSupabase
			.from('group_accounting_provider_accounts')
			.upsert(rows, { onConflict: 'group_id,provider,external_account_id' });
		if (error) throw new Error(error.message);
	}
}

function providerExternalAccountId(account = {}) {
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
			account.uuid ||
			account.number
	);
}

function firstCleanText(values = [], limit = 200) {
	for (const value of values) {
		const cleaned = cleanText(value, limit);
		if (cleaned) return cleaned;
	}
	return '';
}

function mercuryTransactionDescription(transaction = {}) {
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

function mercuryProviderAccountsFromTransactions(transactions = []) {
	const accounts = new Map();
	for (const transaction of transactions) {
		const externalAccountId = providerExternalAccountId(transaction);
		if (!externalAccountId || accounts.has(externalAccountId)) continue;
		const account = transaction.account ?? {};
		const displayName =
			firstCleanText([
				account.name,
				account.nickname,
				transaction.accountName,
				transaction.account_name,
				transaction.cardName,
				transaction.card_name,
				transaction.creditAccountName,
				transaction.credit_account_name
			]) || 'Mercury account';
		const accountType = firstCleanText([
			account.type,
			transaction.accountType,
			transaction.account_type,
			transaction.kind
		]);
		const accountSubtype =
			firstCleanText([
				account.subtype,
				transaction.accountSubtype,
				transaction.account_subtype,
				transaction.cardId || transaction.cardAccountId ? 'credit_card' : ''
			]) || null;
		accounts.set(externalAccountId, {
			...account,
			id: externalAccountId,
			name: displayName,
			type: accountType || 'mercury',
			subtype: accountSubtype,
			mask: account.mask || transaction.mask || transaction.lastFour || transaction.last_four,
			currency: account.currency || transaction.currency
		});
	}
	return Array.from(accounts.values());
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

function feedItemAmountCents(provider, transaction) {
	if (Number.isInteger(transaction.amount_cents)) return transaction.amount_cents;
	const amount = Number(transaction.amount ?? 0);
	if (provider === 'mercury') return Math.round(amount * 100);
	return Math.round(amount * -100);
}

function feedItemDescription(provider, transaction) {
	if (provider === 'mercury') return mercuryTransactionDescription(transaction);
	return cleanText(transaction.name || transaction.description || transaction.memo || 'Imported activity', 200);
}

async function upsertFeedItems(auth, connection, provider, transactions = [], options = {}) {
	const { defaultAccountId = null, accountMap = new Map() } = options;
	const rows = transactions
		.map((transaction) => {
			const externalAccountId = providerExternalAccountId(transaction);
			const accountId = accountMap.get(externalAccountId) || defaultAccountId || null;
			return {
				group_id: auth.group.id,
				connection_id: connection.id,
				provider,
				source_transaction_id: cleanText(transaction.transaction_id || transaction.id),
				transaction_date: dateOnly(
					transaction.date || transaction.posted_at || transaction.created
				),
				account_id: accountId,
				description: feedItemDescription(provider, transaction),
				amount_cents: feedItemAmountCents(provider, transaction),
				currency: normalizeCurrency(transaction.iso_currency_code || transaction.currency || 'usd'),
				status: 'needs_review',
				raw: {
					...(transaction.raw ?? transaction),
					external_account_id: externalAccountId || null
				}
			};
		})
		.filter((row) => row.source_transaction_id);
	if (rows.length) {
		const { error } = await auth.serviceSupabase
			.from('group_accounting_bank_feed_items')
			.upsert(rows, {
				onConflict: 'group_id,provider,source_transaction_id',
				ignoreDuplicates: true
			});
		if (error) throw new Error(error.message);
	}
	return rows.length;
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
		filters: {
			countries: ['US']
		}
	});
	await auth.serviceSupabase.from('group_accounting_bank_connections').upsert(
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
	return {
		clientSecret: session.client_secret,
		sessionId: session.id,
		publishableKey: getStripePublishableKey()
	};
}

export async function completeStripeFinancialConnectionsSession(auth, sessionId) {
	const cleanedSessionId = cleanText(sessionId);
	if (!cleanedSessionId) throw new Error('Financial Connections session id is required.');
	const stripe = getStripeClient();
	const session = await stripe.financialConnections.sessions.retrieve(cleanedSessionId, {
		expand: ['accounts']
	});
	const { data: connection, error } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.upsert(
			{
				group_id: auth.group.id,
				provider: 'stripe_financial_connections',
				display_name: 'Linked bank accounts and cards',
				status: 'connected',
				external_id: session.id,
				config: {
					session_id: session.id,
					account_ids: (session.accounts?.data ?? []).map((account) => account.id),
					pricing_note:
						'Stripe Financial Connections Transactions costs $0.30/month per institution per account holder.'
				}
			},
			{ onConflict: 'group_id,provider' }
		)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	await upsertProviderAccounts(
		auth,
		connection,
		'stripe_financial_connections',
		(session.accounts?.data ?? []).map((account) => ({
			id: account.id,
			name: account.display_name || account.institution_name || 'Linked account',
			type: account.category,
			subtype: account.subcategory,
			lastFour: account.last4,
			currency: account.balance?.currency || 'usd',
			currentBalance: account.balance?.current,
			raw: account
		}))
	);
	await syncStripeFinancialConnectionsTransactions(auth, connection);
	return connection;
}

export async function syncStripeFinancialConnectionsTransactions(
	auth,
	connection = null,
	options = {}
) {
	const { runAutoMatch = true } = options;
	const stripe = getStripeClient();
	const resolved =
		connection ??
		(
			await auth.serviceSupabase
				.from('group_accounting_bank_connections')
				.select('*')
				.eq('group_id', auth.group.id)
				.eq('provider', 'stripe_financial_connections')
				.maybeSingle()
		).data;
	const accountIds = resolved?.config?.account_ids ?? [];
	if (!resolved?.id || !accountIds.length) {
		throw new Error('No Stripe Financial Connections accounts are linked yet.');
	}
	let inserted = 0;
	for (const accountId of accountIds) {
		const transactions = await stripe.financialConnections.transactions.list({
			account: accountId,
			limit: 100
		});
		inserted += await upsertFeedItems(
			auth,
			resolved,
			'stripe_financial_connections',
			transactions.data.map((transaction) => ({
				id: transaction.id,
				date: transaction.transacted_at
					? new Date(transaction.transacted_at * 1000).toISOString()
					: transaction.created
						? new Date(transaction.created * 1000).toISOString()
						: new Date().toISOString(),
				description: transaction.description || transaction.status || 'Linked account activity',
				amount_cents: Number(transaction.amount || 0),
				currency: transaction.currency || 'usd',
				raw: transaction
			}))
		);
	}
	await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.update({ last_synced_at: new Date().toISOString(), status: 'connected', error_message: null })
		.eq('id', resolved.id);
	if (runAutoMatch) await autoMatchFeedItems(auth);
	return { inserted };
}

export async function syncMercuryTransactions(auth, options = {}) {
	const { runAutoMatch = true } = options;
	const { data: connection } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('provider', 'mercury')
		.maybeSingle();
	const { data: settings } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('mercury_api_key_ciphertext')
		.eq('group_id', auth.group.id)
		.maybeSingle();
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
	const accountsPayload = await mercuryRelayRequest(auth, resolved, resolvedApiKey, {
		method: 'GET',
		path: '/api/v1/accounts'
	});
	const txPayload = await mercuryRelayRequest(auth, resolved, resolvedApiKey, {
		method: 'GET',
		path: '/api/v1/transactions',
		query: { limit: 1000, order: 'desc' }
	});
	const transactions = txPayload.transactions ?? [];
	const accounts = [
		...(accountsPayload.accounts ?? []),
		...(accountsPayload.creditAccounts ?? []),
		...(accountsPayload.credit_accounts ?? []),
		...(accountsPayload.cards ?? []),
		...mercuryProviderAccountsFromTransactions(transactions)
	];
	await upsertProviderAccounts(auth, resolved, 'mercury', accounts);
	const accountMap = await loadProviderAccountMap(auth, 'mercury');
	const insertedCount = await upsertFeedItems(
		auth,
		resolved,
		'mercury',
		transactions.map((transaction) => ({
			...transaction,
			account_id: providerExternalAccountId(transaction)
		})),
		{ accountMap }
	);
	await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.update({ last_synced_at: new Date().toISOString(), status: 'connected', error_message: null })
		.eq('id', resolved.id);
	if (runAutoMatch) await autoMatchFeedItems(auth);
	return { inserted: insertedCount };
}

export async function syncStripeTransactions(auth, options = {}) {
	const { runAutoMatch = true } = options;
	const [{ getStripeClient }, { data: donationAccount }] = await Promise.all([
		import('$lib/server/stripe'),
		auth.serviceSupabase
			.from('donation_accounts')
			.select('stripe_account_id')
			.eq('group_id', auth.group.id)
			.maybeSingle()
	]);
	if (!donationAccount?.stripe_account_id) {
		throw new Error('Stripe donations are not connected for this group.');
	}
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
	const transactions = await stripe.balanceTransactions.list(
		{ limit: 100 },
		{ stripeAccount: donationAccount.stripe_account_id }
	);
	const inserted = await upsertFeedItems(
		auth,
		connection,
		'stripe',
		transactions.data.map((item) => ({
			id: item.id,
			date: new Date(item.created * 1000).toISOString(),
			description: item.description || item.type,
			amount_cents: item.amount,
			currency: item.currency,
			raw: item
		}))
	);
	await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.update({ last_synced_at: new Date().toISOString(), status: 'connected' })
		.eq('id', connection.id);
	if (runAutoMatch) await autoMatchFeedItems(auth);
	return { inserted };
}

export async function syncAllBankTransactions(auth) {
	const { data: connections } = await auth.serviceSupabase
		.from('group_accounting_bank_connections')
		.select('provider,status')
		.eq('group_id', auth.group.id);
	const providers = new Set((connections ?? []).map((connection) => connection.provider));
	let inserted = 0;
	const errors = [];

	if (providers.has('mercury')) {
		try {
			const result = await syncMercuryTransactions(auth, { runAutoMatch: false });
			inserted += Number(result?.inserted || 0);
		} catch (error) {
			errors.push(error?.message || 'Mercury sync failed.');
		}
	}

	if (providers.has('stripe_financial_connections')) {
		try {
			const result = await syncStripeFinancialConnectionsTransactions(auth, null, {
				runAutoMatch: false
			});
			inserted += Number(result?.inserted || 0);
		} catch (error) {
			errors.push(error?.message || 'Linked account sync failed.');
		}
	}

	if (providers.has('stripe')) {
		try {
			const result = await syncStripeTransactions(auth, { runAutoMatch: false });
			inserted += Number(result?.inserted || 0);
		} catch (error) {
			errors.push(error?.message || 'Stripe sync failed.');
		}
	}

	await autoMatchFeedItems(auth);
	if (!inserted && errors.length) throw new Error(errors[0]);
	return { inserted, errors };
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
	const { data: entries, error } = await auth.serviceSupabase
		.from('group_accounting_entries')
		.select('*')
		.eq('group_id', auth.group.id)
		.order('entry_date', { ascending: false });
	if (error) throw new Error(error.message);
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
	const { accounts } = await ensureGroupAccountingSetup(supabase, group, null);
	const stripe = accountByCode(accounts, '1030');
	const donations = accountByCode(accounts, source === 'membership' ? '4010' : '4000');
	const amountCents = Number(donation.amount_total_cents || donation.amount_cents || 0);
	if (amountCents <= 0) return null;
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
			currency: normalizeCurrency(donation.currency),
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
	return fail(400, {
		accounting_error: error?.message || 'Accounting action failed.'
	});
}
