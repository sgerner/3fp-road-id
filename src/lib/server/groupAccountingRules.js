import { createHash, randomUUID } from 'node:crypto';

const MAX_POSTGRES_INTEGER = 2_147_483_647n;
const MIN_POSTGRES_INTEGER = -2_147_483_648n;

export function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function parseCents(value) {
	const raw = cleanText(value);
	if (!raw || raw.length > 40) return null;
	const normalized = raw.replace(/[$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
	if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(normalized)) {
		return null;
	}

	const unsigned = normalized.replace(/^[+-]/, '');
	const negative = normalized.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
	const [wholeText = '0', fractionText = ''] = unsigned.replace(/,/g, '').split('.');
	let cents = BigInt(wholeText || '0') * 100n + BigInt((fractionText + '00').slice(0, 2));
	if (fractionText.length > 2 && fractionText[2] >= '5') cents += 1n;
	if (negative) cents = -cents;
	if (cents < MIN_POSTGRES_INTEGER || cents > MAX_POSTGRES_INTEGER) return null;
	return Number(cents);
}

export function centsFromAmount(value) {
	const cents = parseCents(value);
	return cents !== null && cents >= 0 ? cents : null;
}

export function centsFromSignedAmount(value) {
	return parseCents(value);
}

export function centsFromAmountAndDirection(amountValue, directionValue) {
	const amount = parseCents(amountValue);
	if (amount === null) return null;

	const direction = cleanText(directionValue).toLowerCase();
	if (['debit', 'dr', 'withdrawal', 'withdrawals', 'withdraw'].includes(direction)) {
		const signed = -Math.abs(amount);
		return signed >= Number(MIN_POSTGRES_INTEGER) ? signed : null;
	}
	if (['credit', 'cr', 'deposit', 'deposits'].includes(direction)) {
		return Math.abs(amount) <= Number(MAX_POSTGRES_INTEGER) ? Math.abs(amount) : null;
	}
	return amount;
}

export function isValidAccountingDate(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(value));
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
	const date = new Date(0);
	date.setUTCHours(0, 0, 0, 0);
	date.setUTCFullYear(year, month - 1, day);
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export function normalizeBankDate(value) {
	const raw = cleanText(value);
	if (!raw) return null;
	const isoDate = raw.slice(0, 10);
	if (isValidAccountingDate(isoDate)) return isoDate;
	const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
	if (!match) return null;
	const iso = `${match[3]}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
	return isValidAccountingDate(iso) ? iso : null;
}

function csvFingerprint(transaction) {
	return JSON.stringify([
		String(transaction.date || transaction.transaction_date || '').slice(0, 10),
		cleanText(transaction.description).normalize('NFKC').toLowerCase().replace(/\s+/g, ' '),
		Number(transaction.amount_cents),
		String(transaction.currency || 'USD').toUpperCase()
	]);
}

function csvHash(value) {
	return createHash('sha256').update(value).digest('hex');
}

// Build account-scoped IDs that survive filename and row-order changes. For CSVs
// without stable bank IDs, occurrence numbers preserve truly identical rows while
// letting repeated imports skip the occurrences already stored for that account.
export function buildCsvSourceIds(transactions, existingRows, accountId) {
	const existingFingerprints = new Map();
	const existingIds = new Set();
	for (const row of existingRows ?? []) {
		if (
			row.account_id !== accountId ||
			!String(row.source_transaction_id || '').startsWith('csv:')
		) {
			continue;
		}
		existingIds.add(row.source_transaction_id);
		if (row.source_transaction_id.includes(':id:')) continue;
		const fingerprint = csvFingerprint(row);
		existingFingerprints.set(fingerprint, (existingFingerprints.get(fingerprint) ?? 0) + 1);
	}

	const seenOccurrences = new Map();
	const seenExplicitIds = new Set();
	return transactions.flatMap((transaction) => {
		const explicitId = cleanText(transaction.bank_transaction_id);
		if (explicitId) {
			const sourceId = `csv:${accountId}:id:${csvHash(explicitId)}`;
			if (existingIds.has(sourceId) || seenExplicitIds.has(sourceId)) return [];
			seenExplicitIds.add(sourceId);
			return [{ ...transaction, id: sourceId }];
		}

		const fingerprint = csvFingerprint(transaction);
		const occurrence = (seenOccurrences.get(fingerprint) ?? 0) + 1;
		seenOccurrences.set(fingerprint, occurrence);
		const existingCount = existingFingerprints.get(fingerprint) ?? 0;
		if (occurrence <= existingCount) return [];
		return [
			{
				...transaction,
				id: `csv:${accountId}:row:${csvHash(fingerprint)}:${occurrence}`
			}
		];
	});
}

export function slugify(value) {
	return cleanText(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function parseCsvRows(textValue) {
	if (typeof textValue !== 'string') throw new TypeError('CSV content must be text.');
	const rows = [];
	let current = '';
	let row = [];
	let quoted = false;
	for (let i = 0; i < textValue.length; i += 1) {
		const char = textValue[i];
		const next = textValue[i + 1];
		if (char === '"' && quoted && next === '"') {
			current += '"';
			i += 1;
		} else if (char === '"') {
			quoted = !quoted;
		} else if (char === ',' && !quoted) {
			row.push(current);
			current = '';
		} else if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && next === '\n') i += 1;
			row.push(current);
			if (row.some((cell) => cleanText(cell))) rows.push(row);
			row = [];
			current = '';
		} else {
			current += char;
		}
	}
	if (quoted) throw new Error('CSV contains an unterminated quoted field.');
	row.push(current);
	if (row.some((cell) => cleanText(cell))) rows.push(row);
	return rows;
}

export function csvEscape(value) {
	let text = String(value ?? '');
	// eslint-disable-next-line no-control-regex -- Hidden leading controls must not bypass CSV formula protection.
	if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

export async function fetchAllRows(queryForPage) {
	const pageSize = 1000;
	const rows = [];
	for (let offset = 0; ; offset += pageSize) {
		const { data, error } = await queryForPage(offset, offset + pageSize - 1);
		if (error) throw new Error(error.message);
		const page = data ?? [];
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

function accountBalanceCents(account, lines) {
	const debits = lines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0);
	const credits = lines.reduce((sum, line) => sum + Number(line.credit_cents || 0), 0);
	return account.normal_side === 'credit' ? credits - debits : debits - credits;
}

export function buildAccountingReportFromRows(accounts, entries, lines, from, to) {
	const entriesById = new Map(
		(entries ?? [])
			.filter((entry) => ['posted', 'void'].includes(entry.status) && entry.entry_date <= to)
			.map((entry) => [entry.id, entry])
	);
	const joinedLines = (lines ?? [])
		.filter((line) => entriesById.has(line.entry_id))
		.map((line) => ({ ...line, entry: entriesById.get(line.entry_id) }));
	const periodLines = joinedLines.filter(
		(line) => line.entry?.entry_date >= from && line.entry?.entry_date <= to
	);
	const accountsWithBalances = (accounts ?? []).map((account) => {
		const allAccountLines = joinedLines.filter((line) => line.account_id === account.id);
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
	const cumulativeNet =
		income.reduce((sum, account) => sum + account.balance_cents, 0) -
		expenses.reduce((sum, account) => sum + account.balance_cents, 0);
	const monthly = {};
	for (const line of periodLines) {
		const account = accountsWithBalances.find((candidate) => candidate.id === line.account_id);
		if (!account || !['income', 'expense'].includes(account.kind)) continue;
		const key = String(line.entry.entry_date).slice(0, 7);
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
			net_cents: totalIncome - totalExpenses,
			assets_cents: assets.reduce((sum, account) => sum + account.balance_cents, 0),
			liabilities_cents: liabilities.reduce((sum, account) => sum + account.balance_cents, 0),
			equity_cents: equity.reduce((sum, account) => sum + account.balance_cents, 0) + cumulativeNet
		},
		monthly: Object.entries(monthly)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, value]) => ({ month, ...value }))
	};
}

export function fiscalYearStartYear(today, fiscalYearStartMonth = 1) {
	const month = Number(fiscalYearStartMonth);
	if (!Number.isInteger(month) || month < 1 || month > 12) return Number(today.slice(0, 4));
	const calendarYear = Number(today.slice(0, 4));
	return Number(today.slice(5, 7)) >= month ? calendarYear : calendarYear - 1;
}

export function fiscalYearWindow(year, fiscalYearStartMonth = 1) {
	const month = Number(fiscalYearStartMonth);
	if (!Number.isInteger(month) || month < 1 || month > 12) {
		throw new Error('Choose a fiscal year start month from 1 to 12.');
	}
	const from = `${year}-${String(month).padStart(2, '0')}-01`;
	const end = new Date(Date.UTC(year + 1, month - 1, 0));
	const to = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
	return { from, to, year: Number(year) };
}

export function budgetActualWindow(
	year,
	today = new Date().toISOString().slice(0, 10),
	fiscalYearStartMonth = 1
) {
	const window = fiscalYearWindow(Number(year), fiscalYearStartMonth);
	const currentYear = fiscalYearStartYear(today, fiscalYearStartMonth);
	return {
		from: window.from,
		to: Number(year) < currentYear ? window.to : Number(year) === currentYear ? today : null
	};
}

export async function uniquePublicReportSlug(supabase, groupId, baseValue) {
	const base = slugify(baseValue) || 'financial-snapshot';
	let candidate = base;
	for (let index = 0; index < 20; index += 1) {
		const { data, error } = await supabase
			.from('group_accounting_public_reports')
			.select('id')
			.eq('group_id', groupId)
			.eq('slug', candidate)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return candidate;
		candidate = `${base}-${index + 2}`;
	}
	return `${base}-${randomUUID().slice(0, 8)}`;
}

export function dateDeltaDays(left, right) {
	const leftTime = new Date(`${String(left).slice(0, 10)}T12:00:00Z`).getTime();
	const rightTime = new Date(`${String(right).slice(0, 10)}T12:00:00Z`).getTime();
	if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
	return Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000);
}

export function normalizedMatchText(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function entryUsesAccount(entry, accountId) {
	if (!accountId) return false;
	return (entry.lines ?? []).some((line) => line.account_id === accountId);
}

export function buildBankFeedEntryLines(amountCents, cashAccountId, categoryAccount) {
	if (
		!Number.isSafeInteger(amountCents) ||
		amountCents === 0 ||
		Math.abs(amountCents) > Number(MAX_POSTGRES_INTEGER)
	) {
		throw new Error('Bank activity must have a non-zero amount in whole cents.');
	}
	if (!cashAccountId || !categoryAccount?.id) throw new Error('Choose both accounting accounts.');
	if (
		['asset', 'liability'].includes(categoryAccount.kind) &&
		categoryAccount.id === cashAccountId
	) {
		throw new Error('Choose two different accounts.');
	}
	const amount = Math.abs(amountCents);
	return amountCents > 0
		? [
				{ account_id: cashAccountId, debit_cents: amount },
				{ account_id: categoryAccount.id, credit_cents: amount }
			]
		: [
				{ account_id: categoryAccount.id, debit_cents: amount },
				{ account_id: cashAccountId, credit_cents: amount }
			];
}

export function buildFeedItemsWithMatchCandidates(feedItems, entries, matchedEntryIds = []) {
	const usedEntryIds = new Set();
	const usedAccountIdsByEntry = new Map();
	for (const match of matchedEntryIds) {
		if (typeof match === 'string') {
			if (match) usedEntryIds.add(match);
			continue;
		}
		if (!match?.matched_entry_id) continue;
		if (!match.account_id) {
			usedEntryIds.add(match.matched_entry_id);
			continue;
		}
		const accountIds = usedAccountIdsByEntry.get(match.matched_entry_id) ?? new Set();
		accountIds.add(match.account_id);
		usedAccountIdsByEntry.set(match.matched_entry_id, accountIds);
	}
	return feedItems.map((item) => {
		const itemAmount = Math.abs(Number(item.amount_cents || 0));
		const itemText = normalizedMatchText(item.description);
		const candidates = entries
			.filter((entry) => {
				if (entry.id === item.matched_entry_id) return entry.status === 'posted';
				if (usedEntryIds.has(entry.id)) return false;
				if (entry.status !== 'posted') return false;
				if (
					item.currency &&
					entry.currency &&
					String(item.currency).toLowerCase() !== String(entry.currency).toLowerCase()
				)
					return false;
				if (Math.abs(Number(entry.amount_cents || 0)) !== itemAmount) return false;
				const usedAccountIds = usedAccountIdsByEntry.get(entry.id) ?? new Set();
				return (entry.lines ?? []).some((line) => {
					const kind = line.account?.kind;
					const signedAmount = Number(line.debit_cents || 0) - Number(line.credit_cents || 0);
					return (
						['asset', 'liability'].includes(kind) &&
						signedAmount === Number(item.amount_cents || 0) &&
						(!item.account_id || line.account_id === item.account_id) &&
						!usedAccountIds.has(line.account_id)
					);
				});
			})
			.map((entry) => {
				const days = dateDeltaDays(entry.entry_date, item.transaction_date);
				const sameAccount = entryUsesAccount(entry, item.account_id);
				const entryText = normalizedMatchText(entry.description);
				const textOverlap =
					itemText && entryText && (itemText.includes(entryText) || entryText.includes(itemText));
				const score =
					(days === 0 ? 0.45 : days <= 3 ? 0.3 : days <= 7 ? 0.15 : 0) +
					(sameAccount ? 0.35 : 0) +
					(textOverlap ? 0.2 : 0);
				return {
					id: entry.id,
					entry_date: entry.entry_date,
					description: entry.description,
					amount_cents: entry.amount_cents,
					source: entry.source,
					score,
					reason: [
						days === 0 ? 'same date' : days <= 7 ? `within ${Math.round(days)} days` : '',
						sameAccount ? 'same account' : '',
						textOverlap ? 'similar description' : ''
					]
						.filter(Boolean)
						.join(', ')
				};
			})
			.filter((candidate) => candidate.id === item.matched_entry_id || candidate.score > 0)
			.sort((left, right) => {
				if (left.id === item.matched_entry_id) return -1;
				if (right.id === item.matched_entry_id) return 1;
				return right.score - left.score;
			})
			.slice(0, 5);
		return { ...item, match_candidates: candidates };
	});
}
