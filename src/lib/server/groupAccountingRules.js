import { randomUUID } from 'node:crypto';

export function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function centsFromAmount(value) {
	const numeric = Number(cleanText(value).replace(/[$,\s]/g, ''));
	if (!Number.isFinite(numeric)) return null;
	const cents = Math.round(numeric * 100);
	return cents >= 0 ? cents : null;
}

export function centsFromSignedAmount(value) {
	const normalized = cleanText(value)
		.replace(/[$,\s]/g, '')
		.replace(/^\((.*)\)$/, '-$1');
	const numeric = Number(normalized);
	if (!Number.isFinite(numeric)) return null;
	return Math.round(numeric * 100);
}

export function centsFromAmountAndDirection(amountValue, directionValue) {
	const signedAmount = centsFromSignedAmount(amountValue);
	const positiveAmount = centsFromAmount(amountValue);
	const amount = signedAmount ?? positiveAmount;
	if (amount === null) return null;

	const direction = cleanText(directionValue).toLowerCase();
	if (direction === 'debit' || direction === 'withdrawal' || direction === 'withdrawals') {
		return -Math.abs(amount);
	}
	if (direction === 'credit' || direction === 'deposit' || direction === 'deposits') {
		return Math.abs(amount);
	}
	return amount;
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
	row.push(current);
	if (row.some((cell) => cleanText(cell))) rows.push(row);
	return rows;
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

export function buildFeedItemsWithMatchCandidates(feedItems, entries, matchedEntryIds = []) {
	const usedEntryIds = new Set(matchedEntryIds.filter(Boolean));
	return feedItems.map((item) => {
		const itemAmount = Math.abs(Number(item.amount_cents || 0));
		const itemText = normalizedMatchText(item.description);
		const candidates = entries
			.filter((entry) => {
				if (usedEntryIds.has(entry.id) && entry.id !== item.matched_entry_id) return false;
				if (entry.status !== 'posted') return false;
				return Math.abs(Number(entry.amount_cents || 0)) === itemAmount;
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
