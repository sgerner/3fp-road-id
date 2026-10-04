import { randomUUID } from 'node:crypto';
import {
	cleanText,
	centsFromSignedAmount,
	fetchAllRows,
	isValidAccountingDate
} from './groupAccountingRules.js';
import {
	extractReconciliationStatement,
	matchReconciliationStatementWithAi,
	suggestReconciliationResolutions
} from './groupAccountingReconciliationAi.js';

const STATEMENT_BUCKET = 'group-accounting-receipts';
const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const MAX_STATEMENT_LINES = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredDate(value, label) {
	const date = cleanText(value);
	if (!isValidAccountingDate(date)) throw new Error(`Enter a valid ${label}.`);
	return date;
}

function requiredCents(value, label) {
	const cents = centsFromSignedAmount(value);
	if (cents === null) throw new Error(`Enter a valid ${label}.`);
	return cents;
}

function selectedIds(value, label) {
	const ids = cleanText(value)
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	if (ids.length > 2000 || ids.some((id) => !UUID.test(id))) {
		throw new Error(`Invalid ${label} selection.`);
	}
	return [...new Set(ids)];
}

function parseStatementLines(value) {
	let rows;
	try {
		rows = JSON.parse(cleanText(value) || '[]');
	} catch {
		throw new Error('Statement lines must be valid JSON.');
	}
	if (!Array.isArray(rows) || rows.length > MAX_STATEMENT_LINES) {
		throw new Error('Too many statement lines.');
	}
	return rows.map((row, index) => {
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error(`Statement line ${index + 1} is invalid.`);
		}
		const amountCents =
			row.amountCents == null || row.amountCents === '' ? null : Number(row.amountCents);
		if (
			amountCents !== null &&
			(!Number.isSafeInteger(amountCents) || Math.abs(amountCents) > 2_147_483_647)
		) {
			throw new Error(`Statement line ${index + 1} has an invalid amount.`);
		}
		const date = cleanText(row.transactionDate);
		if (date && !isValidAccountingDate(date)) {
			throw new Error(`Statement line ${index + 1} has an invalid date.`);
		}
		const feedItemId = cleanText(row.feedItemId);
		const entryId = cleanText(row.entryId);
		if ((feedItemId && !UUID.test(feedItemId)) || (entryId && !UUID.test(entryId))) {
			throw new Error(`Statement line ${index + 1} has an invalid match.`);
		}
		const pageNumber =
			row.pageNumber == null || row.pageNumber === '' ? null : Number(row.pageNumber);
		if (pageNumber !== null && (!Number.isSafeInteger(pageNumber) || pageNumber < 1)) {
			throw new Error(`Statement line ${index + 1} has an invalid page number.`);
		}
		const runningBalanceCents =
			row.runningBalanceCents == null || row.runningBalanceCents === ''
				? null
				: Number(row.runningBalanceCents);
		if (
			runningBalanceCents !== null &&
			(!Number.isSafeInteger(runningBalanceCents) || Math.abs(runningBalanceCents) > 2_147_483_647)
		) {
			throw new Error(`Statement line ${index + 1} has an invalid running balance.`);
		}
		const confidence =
			row.confidence == null || row.confidence === '' ? null : Number(row.confidence);
		if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
			throw new Error(`Statement line ${index + 1} has an invalid confidence.`);
		}
		const resolution = cleanText(row.resolution, 30) || 'pending';
		if (
			!['pending', 'outstanding', 'matched', 'ignored', 'approved_exception'].includes(resolution)
		) {
			throw new Error(`Statement line ${index + 1} has an invalid resolution.`);
		}
		return {
			clientId: cleanText(row.clientId, 100) || `line-${index + 1}`,
			transactionDate: date || null,
			description: cleanText(row.description, 500),
			amountCents,
			currency: cleanText(row.currency, 3).toUpperCase() || null,
			feedItemId: feedItemId || null,
			entryId: entryId || null,
			resolution,
			reason: cleanText(row.reason, 500) || null,
			pageNumber,
			runningBalanceCents,
			isSplit: row.isSplit === true,
			confidence
		};
	});
}

function statementFile(formData) {
	const file = formData.get('statementFile');
	if (!file || typeof file === 'string' || file.size === 0) return null;
	if (!(file instanceof File) || file.size > MAX_STATEMENT_BYTES) {
		throw new Error('Statement must be a file smaller than 10 MB.');
	}
	if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
		throw new Error('Statement must be a PDF, JPEG, PNG, or WebP file.');
	}
	return file;
}

function hasExpectedSignature(bytes, mimeType) {
	if (mimeType === 'application/pdf') {
		return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
	}
	if (mimeType === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}
	if (mimeType === 'image/png') {
		return (
			bytes.length >= 8 &&
			[137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
		);
	}
	if (mimeType === 'image/webp') {
		return (
			bytes.length >= 12 &&
			String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
			String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
		);
	}
	return false;
}

async function requireAccount(auth, accountId) {
	if (!UUID.test(accountId)) throw new Error('Choose a bank or card account.');
	const { data, error } = await auth.serviceSupabase
		.from('group_accounting_accounts')
		.select('id,kind,subtype,normal_side')
		.eq('group_id', auth.group.id)
		.eq('id', accountId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data || !['asset', 'liability'].includes(data.kind)) {
		throw new Error('Choose a bank or card account.');
	}
	return data;
}

export async function saveReconciliationDraft(auth, formData) {
	const accountId = cleanText(formData.get('accountId'));
	await requireAccount(auth, accountId);
	const reconciliationId = cleanText(formData.get('reconciliationId')) || null;
	if (reconciliationId && !UUID.test(reconciliationId)) throw new Error('Invalid reconciliation.');
	const periodStart = cleanText(formData.get('statementStartingDate')) || null;
	if (periodStart) requiredDate(periodStart, 'statement starting date');
	const statementDate = requiredDate(formData.get('statementEndingDate'), 'statement ending date');
	if (periodStart && periodStart > statementDate) {
		throw new Error('Statement start must be on or before the ending date.');
	}
	const openingBalance = requiredCents(formData.get('openingBalance'), 'opening balance');
	const endingBalance = requiredCents(formData.get('statementEndingBalance'), 'ending balance');
	const selectedFeedItemIds = selectedIds(formData.get('selectedFeedItemIds'), 'bank activity');
	const selectedLedgerEntryIds = selectedIds(
		formData.get('selectedLedgerEntryIds'),
		'ledger activity'
	);
	const lines = parseStatementLines(formData.get('statementLines'));
	const { data: settings, error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('currency')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (settingsError) throw new Error(settingsError.message);
	const groupCurrency = cleanText(settings?.currency, 3).toUpperCase() || 'USD';
	const statementCurrency =
		cleanText(formData.get('statementCurrency'), 3).toUpperCase() || groupCurrency;
	if (
		statementCurrency !== groupCurrency ||
		lines.some((line) => line.currency && line.currency !== groupCurrency)
	) {
		throw new Error(
			`Statement and line currencies must match the group currency (${groupCurrency}).`
		);
	}
	const requestedMode = cleanText(formData.get('verificationMode'));
	if (['statement', 'statement_lines'].includes(requestedMode) && !lines.length) {
		throw new Error('Review or enter the statement lines before saving this mode.');
	}
	if (requestedMode === 'balance_only' && lines.length) {
		throw new Error('Balance-only mode cannot include statement lines.');
	}

	const file = statementFile(formData);
	let uploadedPath = null;
	let fileMetadata = null;
	let previousPath = null;
	if (file) {
		if (reconciliationId) {
			const { data: current, error: currentError } = await auth.serviceSupabase
				.from('group_accounting_reconciliations')
				.select('statement_object_path')
				.eq('group_id', auth.group.id)
				.eq('id', reconciliationId)
				.eq('status', 'draft')
				.maybeSingle();
			if (currentError) throw new Error(currentError.message);
			previousPath = current?.statement_object_path || null;
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!hasExpectedSignature(bytes, file.type)) {
			throw new Error('Statement file content does not match its PDF or image type.');
		}
		uploadedPath = `${auth.group.id}/reconciliations/${randomUUID()}/${cleanText(file.name, 160).replace(/[^a-zA-Z0-9._-]/g, '_') || 'statement'}`;
		const { error } = await auth.serviceSupabase.storage
			.from(STATEMENT_BUCKET)
			.upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
		if (error) throw new Error(error.message);
		fileMetadata = {
			object_path: uploadedPath,
			file_name: cleanText(file.name, 255),
			mime_type: file.type,
			size_bytes: file.size
		};
	}

	const { data, error } = await auth.serviceSupabase.rpc(
		'group_accounting_save_reconciliation_draft',
		{
			p_group_id: auth.group.id,
			p_account_id: accountId,
			p_reconciliation_id: reconciliationId,
			p_period_start_date: periodStart,
			p_statement_date: statementDate,
			p_opening_balance_cents: openingBalance,
			p_statement_balance_cents: endingBalance,
			p_statement_currency: statementCurrency,
			p_statement_file: fileMetadata,
			p_statement_lines: lines,
			p_actor_id: auth.userId,
			p_selected_feed_item_ids: selectedFeedItemIds,
			p_selected_ledger_entry_ids: selectedLedgerEntryIds
		}
	);
	if (error) {
		if (uploadedPath)
			await auth.serviceSupabase.storage.from(STATEMENT_BUCKET).remove([uploadedPath]);
		throw new Error(error.message);
	}
	const reconciliation = Array.isArray(data) ? data[0] : data;
	if (!reconciliation?.id) {
		if (uploadedPath)
			await auth.serviceSupabase.storage.from(STATEMENT_BUCKET).remove([uploadedPath]);
		throw new Error('Reconciliation draft was not returned.');
	}
	if (
		previousPath?.startsWith(`${auth.group.id}/reconciliations/`) &&
		previousPath !== uploadedPath
	) {
		await auth.serviceSupabase.storage.from(STATEMENT_BUCKET).remove([previousPath]);
	}
	return reconciliation;
}

export async function closeReconciliation(auth, formData) {
	const reconciliationId = cleanText(formData.get('reconciliationId'));
	if (!UUID.test(reconciliationId)) throw new Error('Choose a reconciliation draft.');
	const { data: current, error: readError } = await auth.serviceSupabase
		.from('group_accounting_reconciliations')
		.select('id,status,verification_mode')
		.eq('group_id', auth.group.id)
		.eq('id', reconciliationId)
		.maybeSingle();
	if (readError) throw new Error(readError.message);
	if (!current || current.status !== 'draft')
		throw new Error('Reconciliation draft was not found.');
	if (
		current.verification_mode === 'balance_only' &&
		formData.get('balanceOnlyAttestation') !== 'true'
	) {
		throw new Error(
			'Confirm that this balance-only reconciliation has not verified statement lines.'
		);
	}
	const feedIds = selectedIds(
		formData.get('selectedFeedItemIds') || formData.get('checkedFeedItemIds'),
		'bank activity'
	);
	const entryIds = selectedIds(
		formData.get('selectedLedgerEntryIds') || formData.get('clearedEntryIds'),
		'ledger activity'
	);
	// The close request includes the visible workspace. Persist it first so an edit made
	// after the last explicit Save cannot approve an older, hidden draft snapshot.
	const saved = await saveReconciliationDraft(auth, formData);
	if (saved.id !== reconciliationId) throw new Error('Reconciliation draft changed before close.');
	if (
		saved.verification_mode === 'balance_only' &&
		formData.get('balanceOnlyAttestation') !== 'true'
	) {
		throw new Error('Confirm the limits of this balance-only reconciliation.');
	}
	const { data, error } = await auth.serviceSupabase.rpc('group_accounting_close_reconciliation', {
		p_group_id: auth.group.id,
		p_reconciliation_id: reconciliationId,
		p_selected_feed_item_ids: feedIds,
		p_selected_ledger_entry_ids: entryIds,
		p_actor_id: auth.userId
	});
	if (error) throw new Error(error.message);
	const reconciliation = Array.isArray(data) ? data[0] : data;
	if (!reconciliation?.id || reconciliation.status !== 'completed') {
		throw new Error(
			'Reconciliation remains a draft because the cleared ledger balance does not match the statement. Review the discrepancy before closing.'
		);
	}
	return reconciliation;
}

export async function analyzeReconciliationStatement(auth, formData) {
	if (formData.get('aiConsent') !== 'true') {
		throw new Error(
			'Confirm that you want to send this statement to the AI provider for analysis.'
		);
	}
	const accountId = cleanText(formData.get('accountId'));
	const account = await requireAccount(auth, accountId);
	const file = statementFile(formData);
	if (!file) throw new Error('Choose a PDF or image statement to analyze.');
	const { data: settings, error: settingsError } = await auth.serviceSupabase
		.from('group_accounting_settings')
		.select('currency')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (settingsError) throw new Error(settingsError.message);
	const extracted = await extractReconciliationStatement(file, {
		expectedCurrency: settings?.currency || 'USD',
		accountKind: account.kind,
		normalSide: account.normal_side
	});
	const endingDate = extracted.period_end || cleanText(formData.get('statementEndingDate'));
	if (!isValidAccountingDate(endingDate)) {
		throw new Error('Confirm the statement ending date before matching transactions.');
	}

	const [feedRows, ledgerRows] = await Promise.all([
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_bank_feed_items')
				.select(
					'id,account_id,transaction_date,description,amount_cents,currency,status,provider_status,matched_entry_id,cleared_at,provider_correction_pending'
				)
				.eq('group_id', auth.group.id)
				.eq('account_id', accountId)
				.in('status', ['needs_review', 'matched', 'posted'])
				.is('cleared_at', null)
				.lte('transaction_date', endingDate)
				.order('transaction_date', { ascending: false })
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		),
		fetchAllRows((fromRow, toRow) =>
			auth.serviceSupabase
				.from('group_accounting_entries')
				.select(
					'id,entry_date,description,currency,status,lines:group_accounting_lines(*,account:group_accounting_accounts(id,kind,normal_side)),uncleared_lines:group_accounting_lines!inner(id)'
				)
				.eq('group_id', auth.group.id)
				.in('status', ['posted', 'void'])
				.eq('uncleared_lines.account_id', accountId)
				.is('uncleared_lines.cleared_at', null)
				.lte('entry_date', endingDate)
				.order('entry_date', { ascending: false })
				.order('id', { ascending: true })
				.range(fromRow, toRow)
		)
	]);
	const candidateLedgerRows = ledgerRows
		.filter((entry) =>
			entry.lines?.some((line) => line.account_id === accountId && !line.cleared_at)
		)
		.map(({ uncleared_lines, ...entry }) => entry);
	const candidateFeedRows = feedRows.filter((row) => !row.provider_correction_pending);
	const providerCorrectionsPending = feedRows.some((row) => row.provider_correction_pending);
	const matchResult = await matchReconciliationStatementWithAi({
		lines: extracted.lines,
		feedRows: candidateFeedRows,
		ledgerRows: candidateLedgerRows,
		accountId,
		normalSide: account.normal_side
	});
	const discrepancyResult = suggestReconciliationResolutions({
		statementLines: extracted.lines,
		feedRows: candidateFeedRows,
		ledgerRows: candidateLedgerRows,
		accountId,
		normalSide: account.normal_side
	});
	const statementLines = extracted.lines.map((line, index) => ({
		clientId: line.line_id || `statement-${index + 1}`,
		transactionDate: line.transaction_date,
		description: line.description,
		amountCents: line.amount_cents,
		currency: line.currency,
		pageNumber: line.page_number,
		pageReference: line.page_number ? `Page ${line.page_number}` : null,
		confidence: line.confidence,
		needsReview: line.needs_review,
		uncertainty: line.uncertainty_reason || null,
		resolution: 'pending'
	}));
	return {
		statementLines,
		matches: (matchResult.lines || []).map((result) => ({
			statementLineId: result.line_id,
			candidates: result.candidates,
			suggestedMatch: result.suggested_match,
			needsReview: result.needs_review
		})),
		discrepancies: discrepancyResult.suggestions.map((suggestion) => ({
			statementLineId: suggestion.statement_line_id,
			kind: suggestion.kind,
			confidence: suggestion.confidence,
			reason: suggestion.reason,
			suggestedAction: suggestion.suggested_action,
			relatedCandidates: suggestion.related_candidates
		})),
		summary: {
			periodStart: extracted.period_start,
			periodEnd: extracted.period_end,
			beginningBalanceCents: extracted.beginning_balance_cents,
			endingBalanceCents: extracted.ending_balance_cents,
			currency: extracted.currency,
			totalsValid: extracted.totals_valid,
			needsReview: extracted.needs_review || providerCorrectionsPending,
			warnings: providerCorrectionsPending
				? [
						...extracted.warnings,
						'Review pending bank-provider corrections before closing this statement.'
					]
				: extracted.warnings,
			duplicateFeedGroups: matchResult.duplicate_feed_groups || [],
			discrepancyCounts: discrepancyResult.summary.by_kind
		}
	};
}
