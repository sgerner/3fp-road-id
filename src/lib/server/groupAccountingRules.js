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
