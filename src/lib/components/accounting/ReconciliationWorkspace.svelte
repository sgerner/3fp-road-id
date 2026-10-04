<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import IconCheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconUpload from '@lucide/svelte/icons/upload';
	import { onDestroy } from 'svelte';

	let { data, cashAccounts, today, accountLabel, formatDate, formatCents } = $props();

	const feedItems = $derived(
		Array.isArray(data.reconciliation_feed_items) ? data.reconciliation_feed_items : []
	);
	const ledgerEntries = $derived(
		Array.isArray(data.reconciliation_entries) ? data.reconciliation_entries : []
	);
	const reconciliations = $derived(Array.isArray(data.reconciliations) ? data.reconciliations : []);
	const storedStatementLines = $derived(
		Array.isArray(data.reconciliation_statement_lines) ? data.reconciliation_statement_lines : []
	);
	const storedMatches = $derived(
		Array.isArray(data.reconciliation_matches) ? data.reconciliation_matches : []
	);
	let accountId = $state('');
	let statementStartingDate = $state('');
	let statementEndingDate = $state('');
	let openingBalance = $state('');
	let endingBalance = $state('');
	let verificationMode = $state('statement');
	let statementCurrency = $state('');
	let balanceOnlyAttestation = $state(false);
	let workspaceDraftId = $state('');
	let workspaceLines = $state([]);
	let manualFeedItemIds = $state([]);
	let manualLedgerEntryIds = $state([]);
	let workspaceBusy = $state('');
	let workspaceNotice = $state('');
	let workspaceError = $state('');
	let expandedReconciliationId = $state('');
	let selectedStatementFile = $state(null);
	let statementPreviewUrl = $state('');
	let aiShareOptIn = $state(false);
	let analysisWarnings = $state([]);
	let analysisDiscrepancies = $state([]);
	let analysisSummaryText = $state('');
	let analysisArithmetic = $state(null);
	let prefetchedAccountId = $state('');
	let statementModeLocked = $state(false);
	let workspaceClosed = $state(false);
	let workspaceDirty = $state(false);

	const selectedAccount = $derived(
		cashAccounts.find((account) => account.id === accountId) || null
	);
	const groupCurrency = $derived(String(data.settings?.currency || 'USD').toUpperCase());
	const effectiveStatementCurrency = $derived(
		String(statementCurrency || groupCurrency).toUpperCase()
	);
	const currencyMismatch = $derived(
		effectiveStatementCurrency !== groupCurrency ||
			workspaceLines.some(
				(line) => line.currency && String(line.currency).toUpperCase() !== groupCurrency
			)
	);
	const liabilityAccount = $derived(
		selectedAccount?.kind === 'liability' || selectedAccount?.normal_side === 'credit'
	);

	const workspaceFeedCandidates = $derived(
		feedItems
			.filter((item) => item.account_id === accountId && !item.cleared_at)
			.filter(
				(item) =>
					!statementStartingDate || item.transaction_date >= daysBefore(statementStartingDate, 14)
			)
			.filter((item) => !statementEndingDate || item.transaction_date <= statementEndingDate)
			.slice()
			.sort((left, right) =>
				String(right.transaction_date || '').localeCompare(String(left.transaction_date || ''))
			)
	);
	const workspaceLedgerCandidates = $derived(
		ledgerEntries
			.filter((entry) => ['posted', 'void'].includes(entry.status))
			.filter((entry) => !statementEndingDate || entry.entry_date <= statementEndingDate)
			.filter((entry) =>
				(entry.lines ?? []).some((line) => line.account_id === accountId && !line.cleared_at)
			)
			.slice()
			.sort((left, right) =>
				String(right.entry_date || '').localeCompare(String(left.entry_date || ''))
			)
	);
	const statementLinePayload = $derived(
		JSON.stringify(
			workspaceLines.map((line) => ({
				...(line.id ? { id: line.id } : {}),
				clientId: line.clientId,
				transactionDate: line.transactionDate || null,
				description: line.description,
				amountCents: line.amount === '' ? null : amountToCents(line.amount),
				currency: String(line.currency || effectiveStatementCurrency).toUpperCase(),
				runningBalanceCents: line.runningBalance === '' ? null : amountToCents(line.runningBalance),
				feedItemId: line.feedItemId || null,
				entryId: line.entryId || null,
				isSplit: Boolean(line.entryId && line.isSplit === true),
				resolution:
					line.resolution === 'excluded' ? 'approved_exception' : line.resolution || 'outstanding',
				reason: line.excludeReason || '',
				pageNumber: line.pageNumber || null,
				pageReference: line.pageReference || '',
				uncertainty: line.uncertainty || '',
				confidence: line.matchConfidence ?? null,
				matchReason: line.matchReason || '',
				suggestedAction: line.suggestedAction || '',
				raw: {
					extractionConfidence: line.extractionConfidence ?? null,
					needsReview: Boolean(line.needsReview),
					statementCurrency: effectiveStatementCurrency,
					uncertainty: line.uncertainty || '',
					pageReference: line.pageReference || '',
					suggestedAction: line.suggestedAction || ''
				}
			}))
		)
	);
	const chosenFeedItemIds = $derived(
		verificationMode === 'balance_only'
			? [...new Set(manualFeedItemIds)]
			: workspaceLines
					.filter((line) => line.resolution === 'matched' && line.feedItemId && line.entryId)
					.map((line) => line.feedItemId)
					.filter((id, index, ids) => ids.indexOf(id) === index)
	);
	const chosenLedgerEntryIds = $derived(
		verificationMode === 'balance_only'
			? [...new Set(manualLedgerEntryIds)]
			: workspaceLines
					.filter((line) => line.resolution === 'matched' && line.entryId)
					.map((line) => line.entryId)
					.filter((id, index, ids) => ids.indexOf(id) === index)
	);
	const matchedLineCount = $derived(
		workspaceLines.filter((line) => line.resolution === 'matched' && line.entryId).length
	);
	const excludedLineCount = $derived(
		workspaceLines.filter((line) => ['excluded', 'ignored'].includes(line.resolution)).length
	);
	const approvedExceptionCount = $derived(
		workspaceLines.filter((line) => line.resolution === 'excluded').length
	);
	const ignoredLineCount = $derived(
		workspaceLines.filter((line) => line.resolution === 'ignored').length
	);
	const outstandingLines = $derived(
		workspaceLines.filter(
			(line) =>
				!['excluded', 'ignored'].includes(line.resolution) &&
				!(line.resolution === 'matched' && line.entryId)
		)
	);
	const excludedLines = $derived(
		workspaceLines.filter((line) => ['excluded', 'ignored'].includes(line.resolution))
	);
	const incompleteLines = $derived(
		workspaceLines.filter((line) =>
			line.resolution === 'ignored'
				? !line.excludeReason.trim() || Boolean(line.feedItemId || line.entryId)
				: !line.transactionDate ||
					!line.description.trim() ||
					line.amount === '' ||
					(line.resolution === 'excluded' &&
						(!line.excludeReason.trim() || line.feedItemId || line.entryId))
		)
	);
	const exceptionMatchConflict = $derived(
		workspaceLines.some(
			(line) =>
				['excluded', 'ignored'].includes(line.resolution) && (line.feedItemId || line.entryId)
		)
	);
	const unmatchedFeedCandidates = $derived(
		workspaceFeedCandidates.filter(
			(item) =>
				!workspaceLines.some((line) => line.resolution === 'matched' && line.feedItemId === item.id)
		)
	);
	const unmatchedLedgerCandidates = $derived(
		workspaceLedgerCandidates.filter(
			(entry) =>
				!workspaceLines.some((line) => line.resolution === 'matched' && line.entryId === entry.id)
		)
	);
	const selectedFeedRows = $derived(
		chosenFeedItemIds.map((id) => feedItems.find((item) => item.id === id)).filter(Boolean)
	);
	const selectedLedgerRows = $derived(
		chosenLedgerEntryIds.map((id) => ledgerEntries.find((entry) => entry.id === id)).filter(Boolean)
	);
	const statementActivityCents = $derived(
		workspaceLines.reduce(
			(total, line) =>
				total + (line.resolution === 'ignored' ? 0 : (amountToCents(line.amount) ?? 0)),
			0
		)
	);
	const rollforwardDifference = $derived.by(() => {
		if (
			openingBalance === '' ||
			endingBalance === '' ||
			!workspaceLines.length ||
			workspaceLines.some((line) => line.resolution !== 'ignored' && line.amount === '')
		)
			return null;
		return amountToCents(endingBalance) - (amountToCents(openingBalance) + statementActivityCents);
	});

	$effect(() => {
		if (!cashAccounts.some((account) => account.id === accountId)) {
			accountId =
				cashAccounts.find((account) => account.kind === 'asset')?.id || cashAccounts[0]?.id || '';
		}
	});
	$effect(() => {
		if (today && !statementEndingDate) statementEndingDate = today;
	});
	$effect(() => {
		if (statementEndingDate && !statementStartingDate) {
			statementStartingDate = `${statementEndingDate.slice(0, 7)}-01`;
		}
	});
	$effect(() => {
		if (!accountId || prefetchedAccountId === accountId || workspaceDraftId) return;
		prefetchedAccountId = accountId;
		const previous = reconciliations
			.filter(
				(item) => (item.account_id || item.account?.id) === accountId && item.status === 'completed'
			)
			.slice()
			.sort((left, right) =>
				String(right.statement_ending_date || '').localeCompare(
					String(left.statement_ending_date || '')
				)
			)[0];
		if (previous) {
			openingBalance = centsToInput(previous.statement_ending_balance_cents);
			statementStartingDate = nextDate(previous.statement_ending_date);
		}
	});

	function amountToCents(value) {
		if (value == null || value === '') return null;
		const amount = Number(value);
		return Number.isFinite(amount) ? Math.round(amount * 100) : null;
	}

	function centsToInput(value) {
		if (value == null || value === '') return '';
		const amount = Number(value);
		return Number.isFinite(amount) ? (amount / 100).toFixed(2) : '';
	}

	function nextDate(value) {
		if (!value) return '';
		const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
		if (Number.isNaN(date.getTime())) return '';
		date.setDate(date.getDate() + 1);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function daysBefore(value, days) {
		if (!value) return '';
		const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
		if (Number.isNaN(date.getTime())) return '';
		date.setDate(date.getDate() - days);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function confidenceLabel(value) {
		const confidence = Number(value);
		if (!Number.isFinite(confidence)) return '';
		return `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}% confidence`;
	}

	function arithmeticLabel(arithmetic) {
		if (!arithmetic) return '';
		if (typeof arithmetic === 'string') return arithmetic;
		const opening = arithmetic.openingBalanceCents ?? arithmetic.opening_balance_cents;
		const activity = arithmetic.activityCents ?? arithmetic.activity_cents;
		const ending = arithmetic.endingBalanceCents ?? arithmetic.ending_balance_cents;
		const difference = arithmetic.differenceCents ?? arithmetic.difference_cents;
		if (opening == null && activity == null && ending == null && difference == null) {
			return (
				arithmetic.message ||
				arithmetic.summary ||
				'The analyzer checked statement arithmetic; review the editable roll-forward below.'
			);
		}
		return `Opening ${opening == null ? '—' : formatCents(opening)} + activity ${activity == null ? '—' : formatCents(activity)} = ending ${ending == null ? '—' : formatCents(ending)}${difference == null ? '' : ` · difference ${formatCents(difference)}`}`;
	}

	function makeLine(line = {}, match = {}) {
		const clientId = String(line.clientId || line.client_id || line.id || cryptoId());
		const amountCents = line.amountCents ?? line.amount_cents;
		const amount =
			amountCents != null
				? centsToInput(amountCents)
				: line.amount != null
					? String(line.amount)
					: '';
		const runningBalanceCents = line.runningBalanceCents ?? line.running_balance_cents;
		return {
			id: line.id || '',
			clientId,
			transactionDate: line.transactionDate || line.transaction_date || '',
			description: line.description || '',
			amount,
			currency: String(
				line.currency ||
					line.raw?.currency ||
					line.raw?.statementCurrency ||
					effectiveStatementCurrency
			).toUpperCase(),
			runningBalance: runningBalanceCents != null ? centsToInput(runningBalanceCents) : '',
			feedItemId:
				line.feedItemId || line.feed_item_id || match.feedItemId || match.feed_item_id || '',
			entryId: line.entryId || line.entry_id || match.entryId || match.entry_id || '',
			resolution: ['excluded', 'approved_exception'].includes(line.resolution)
				? 'excluded'
				: line.resolution === 'ignored'
					? 'ignored'
					: match.match_status === 'confirmed'
						? 'matched'
						: 'outstanding',
			excludeReason:
				line.excludeReason || line.exclude_reason || line.reason || match.excludeReason || '',
			matchReason: match.reason || match.match_reason || line.matchReason || '',
			matchConfidence: match.confidence ?? line.matchConfidence ?? null,
			extractionConfidence:
				line.raw?.extractionConfidence ??
				line.extractionConfidence ??
				line.extraction_confidence ??
				null,
			uncertainty: line.uncertainty || match.uncertainty || line.raw?.uncertainty || '',
			pageNumber:
				line.pageNumber || line.page_number || match.pageNumber || match.page_number || null,
			pageReference:
				line.pageReference ||
				line.page_reference ||
				line.raw?.pageReference ||
				(line.pageNumber || line.page_number
					? `Page ${line.pageNumber || line.page_number}`
					: '') ||
				match.pageReference ||
				match.page_reference ||
				'',
			needsReview: Boolean(line.needsReview ?? line.needs_review ?? line.raw?.needsReview),
			suggestedAction:
				match.suggestedAction ||
				match.suggested_action ||
				line.suggestedAction ||
				line.raw?.suggestedAction ||
				'',
			isSplit:
				line.isSplit === true ||
				line.is_split === true ||
				match.isSplit === true ||
				match.is_split === true,
			matchCandidates:
				line.matchCandidates ||
				match.candidates ||
				match.relatedCandidates ||
				match.related_candidates ||
				[]
		};
	}

	function onStatementFileChange(event) {
		const file = event.currentTarget.files?.[0] || null;
		selectedStatementFile = file;
		markWorkspaceDirty();
		if (statementPreviewUrl) URL.revokeObjectURL(statementPreviewUrl);
		statementPreviewUrl =
			file && (file.type === 'application/pdf' || file.type.startsWith('image/'))
				? URL.createObjectURL(file)
				: '';
	}

	onDestroy(() => {
		if (statementPreviewUrl) URL.revokeObjectURL(statementPreviewUrl);
	});

	function cryptoId() {
		return (
			globalThis.crypto?.randomUUID?.() ||
			`line-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
	}

	function addBlankLine() {
		workspaceLines = [...workspaceLines, makeLine()];
		workspaceDirty = true;
	}

	function removeLine(clientId) {
		workspaceLines = workspaceLines.filter((line) => line.clientId !== clientId);
		workspaceDirty = true;
	}

	function markWorkspaceDirty() {
		workspaceDirty = true;
	}

	function storedLinesFor(reconciliationId) {
		return storedStatementLines
			.filter((line) => (line.reconciliation_id || line.reconciliationId) === reconciliationId)
			.map((line) => {
				const matches = storedMatches.filter(
					(candidate) => (candidate.statement_line_id || candidate.statementLineId) === line.id
				);
				const match =
					matches.find((candidate) => candidate.match_status === 'confirmed') || matches[0];
				return makeLine(line, match || {});
			});
	}

	function openReconciliation(reconciliation) {
		statementCurrency = String(
			reconciliation.statement_currency || reconciliation.currency || groupCurrency
		).toUpperCase();
		const lines = storedLinesFor(reconciliation.id);
		if (lines[0]?.currency) statementCurrency = lines[0].currency;
		workspaceDraftId = reconciliation.id;
		accountId = reconciliation.account_id || reconciliation.account?.id || accountId;
		statementStartingDate =
			reconciliation.period_start_date ||
			reconciliation.statement_starting_date ||
			reconciliation.statement_start_date ||
			'';
		statementEndingDate = reconciliation.statement_ending_date || '';
		openingBalance = centsToInput(
			reconciliation.opening_balance_cents ?? reconciliation.statement_starting_balance_cents ?? ''
		);
		endingBalance = centsToInput(reconciliation.statement_ending_balance_cents ?? '');
		verificationMode = ['balance_only', 'legacy'].includes(reconciliation.verification_mode)
			? 'balance_only'
			: 'statement';
		statementModeLocked = reconciliation.verification_mode === 'statement' && lines.length > 0;
		workspaceClosed = reconciliation.status === 'completed';
		workspaceDirty = false;
		workspaceLines = lines;
		manualFeedItemIds = (reconciliation.checked_feed_item_ids || []).filter((id) =>
			feedItems.some((item) => item.id === id && item.account_id === accountId)
		);
		manualLedgerEntryIds = (reconciliation.cleared_entry_ids || []).filter((id) =>
			ledgerEntries.some(
				(entry) => entry.id === id && entry.lines?.some((line) => line.account_id === accountId)
			)
		);
		balanceOnlyAttestation = false;
		workspaceNotice =
			reconciliation.verification_mode === 'legacy'
				? 'Legacy draft loaded as balance-only. Review the account, period, balances, selected activity, and attest before closing.'
				: reconciliation.status === 'completed'
					? 'This reconciliation is closed. Reopen it with a reason before editing.'
					: 'Draft loaded. Review its statement lines and proposed matches before saving or closing.';
		workspaceError = '';
		globalThis.document
			?.getElementById('reconciliation-workspace')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function startNewStatement() {
		if (
			(workspaceDirty || workspaceLines.length || selectedStatementFile || workspaceDraftId) &&
			globalThis.confirm &&
			!globalThis.confirm(
				'Start a new statement? Unsaved edits will be cleared. A saved draft will remain available in history.'
			)
		)
			return;
		if (statementPreviewUrl) URL.revokeObjectURL(statementPreviewUrl);
		statementPreviewUrl = '';
		selectedStatementFile = null;
		const fileInput = globalThis.document?.getElementById('reconciliation-statement-file');
		if (fileInput) fileInput.value = '';
		const previous = reconciliations
			.filter(
				(item) => (item.account_id || item.account?.id) === accountId && item.status === 'completed'
			)
			.slice()
			.sort((left, right) =>
				String(right.statement_ending_date || '').localeCompare(
					String(left.statement_ending_date || '')
				)
			)[0];
		workspaceDraftId = '';
		workspaceClosed = false;
		workspaceDirty = false;
		statementModeLocked = false;
		workspaceLines = [];
		statementCurrency = groupCurrency;
		manualFeedItemIds = [];
		manualLedgerEntryIds = [];
		verificationMode = 'statement';
		balanceOnlyAttestation = false;
		aiShareOptIn = false;
		analysisWarnings = [];
		analysisDiscrepancies = [];
		analysisSummaryText = '';
		analysisArithmetic = null;
		endingBalance = '';
		if (previous) {
			openingBalance = centsToInput(previous.statement_ending_balance_cents);
			statementStartingDate = nextDate(previous.statement_ending_date);
			statementEndingDate = today && today >= statementStartingDate ? today : statementStartingDate;
		} else {
			openingBalance = '';
			statementStartingDate = today ? `${today.slice(0, 7)}-01` : '';
			statementEndingDate = today || '';
		}
		workspaceNotice = previous
			? `New statement ready. Opening balance and period start were prefilled from the completed statement ending ${formatDate(previous.statement_ending_date)}; review them before saving.`
			: 'New statement ready. Enter the opening balance and statement period to begin.';
		workspaceError = '';
	}

	function applyAnalysis(analysis) {
		const extractedLines = Array.isArray(analysis?.statementLines) ? analysis.statementLines : [];
		const recommendations = Array.isArray(analysis?.matches) ? analysis.matches : [];
		analysisWarnings = Array.isArray(analysis?.uncertainties)
			? analysis.uncertainties
			: Array.isArray(analysis?.warnings)
				? analysis.warnings
				: [];
		if (Array.isArray(analysis?.summary?.warnings)) {
			analysisWarnings = [...analysisWarnings, ...analysis.summary.warnings];
		}
		if (Array.isArray(analysis?.summary?.needsReview)) {
			analysisWarnings = [...analysisWarnings, ...analysis.summary.needsReview];
		}
		analysisSummaryText =
			typeof analysis?.summary === 'string'
				? analysis.summary
				: analysis?.summary?.message || analysis?.summary?.statusLabel || '';
		analysisArithmetic = analysis?.summary?.arithmetic || null;
		const periodStart = analysis?.summary?.periodStart || analysis?.summary?.period_start;
		const periodEnd = analysis?.summary?.periodEnd || analysis?.summary?.period_end;
		const beginningBalanceCents =
			analysis?.summary?.beginningBalanceCents ?? analysis?.summary?.beginning_balance_cents;
		const endingBalanceCents =
			analysis?.summary?.endingBalanceCents ?? analysis?.summary?.ending_balance_cents;
		if (periodStart) statementStartingDate = String(periodStart).slice(0, 10);
		if (periodEnd) statementEndingDate = String(periodEnd).slice(0, 10);
		if (beginningBalanceCents != null) openingBalance = centsToInput(beginningBalanceCents);
		if (endingBalanceCents != null) endingBalance = centsToInput(endingBalanceCents);
		analysisDiscrepancies = Array.isArray(analysis?.discrepancies) ? analysis.discrepancies : [];
		statementCurrency = String(analysis?.summary?.currency || groupCurrency).toUpperCase();
		workspaceLines = extractedLines.map((line, index) => {
			const key = line.clientId || line.id || line.statementLineId || String(index);
			const recommendation = recommendations.find(
				(candidate) =>
					String(
						candidate.statementLineId ??
							candidate.statement_line_id ??
							candidate.lineId ??
							candidate.line_id ??
							candidate.lineIndex ??
							candidate.line_index ??
							''
					) === String(key) ||
					String(candidate.lineIndex ?? candidate.line_index ?? '') === String(index)
			);
			const suggestedMatch =
				recommendation?.suggestedMatch || recommendation?.suggested_match || {};
			const proposedFeedId =
				suggestedMatch.feedItemId ||
				suggestedMatch.feed_item_id ||
				suggestedMatch.bankFeedItemId ||
				suggestedMatch.bank_feed_item_id ||
				suggestedMatch.feedItem?.id ||
				'';
			const proposedEntryId =
				suggestedMatch.entryId ||
				suggestedMatch.entry_id ||
				suggestedMatch.ledgerEntryId ||
				suggestedMatch.ledger_entry_id ||
				suggestedMatch.entry?.id ||
				'';
			const matchConfidence = suggestedMatch.confidence ?? recommendation?.confidence ?? null;
			const extracted = makeLine(
				{
					...line,
					clientId: line.clientId || cryptoId(),
					currency: line.currency || statementCurrency,
					feedItemId: line.feedItemId || line.feed_item_id || proposedFeedId,
					entryId: line.entryId || line.entry_id || proposedEntryId,
					extractionConfidence:
						line.extractionConfidence ?? line.extraction_confidence ?? line.confidence ?? null,
					matchConfidence,
					matchReason: line.matchReason || suggestedMatch.reason || recommendation?.reason,
					suggestedAction:
						line.suggestedAction ||
						recommendation?.suggestedAction ||
						recommendation?.suggested_action,
					matchCandidates: recommendation?.candidates || []
				},
				{ ...(recommendation || {}), confidence: matchConfidence }
			);
			// AI match candidates are proposals only; the user must choose Matched to approve them.
			extracted.resolution = 'outstanding';
			return extracted;
		});
		workspaceDirty = true;
		verificationMode = 'statement';
		workspaceNotice = extractedLines.length
			? `AI extracted ${extractedLines.length} statement line${extractedLines.length === 1 ? '' : 's'}. Confirm or change every suggested feed and ledger match before closing.`
			: 'Analysis finished without extracted statement lines. Add lines manually or use balance-only review.';
		if (analysis?.summary?.needsReview === true) {
			analysisWarnings = [
				...analysisWarnings,
				'The analyzer flagged this statement for additional review.'
			];
		}
		workspaceError = '';
	}

	function enhanceWorkspace() {
		return ({ submitter, cancel }) => {
			const action = submitter?.formAction || '';
			const kind = action.includes('analyzeReconciliationStatement')
				? 'analyze'
				: action.includes('closeReconciliation')
					? 'close'
					: 'save';
			workspaceBusy = kind;
			workspaceError = '';
			if (kind === 'analyze' && !aiShareOptIn) {
				workspaceBusy = '';
				workspaceError =
					'Opt in to sending this statement and relevant banking and ledger details to OpenAI before analysis.';
				cancel();
				return;
			}
			return async ({ result, update }) => {
				try {
					await update({ reset: false, invalidateAll: false });
					if (result?.type === 'success') {
						if (kind === 'analyze') {
							applyAnalysis(result.data?.analysis || {});
						} else if (kind === 'save') {
							const savedReconciliation = result.data?.reconciliation;
							workspaceDraftId = savedReconciliation?.id || workspaceDraftId;
							workspaceClosed = savedReconciliation?.status === 'completed';
							if (verificationMode === 'statement' && workspaceDraftId) statementModeLocked = true;
							const fileInput = globalThis.document?.getElementById(
								'reconciliation-statement-file'
							);
							if (fileInput) fileInput.value = '';
							workspaceDirty = false;
							workspaceNotice =
								verificationMode === 'statement' &&
								workspaceLines.length &&
								!outstandingLines.length &&
								!incompleteLines.length &&
								rollforwardDifference === 0
									? 'Draft saved. Review the balances, exceptions, and selected rows before approving it.'
									: verificationMode === 'balance_only'
										? 'Balance-only draft saved. Review the selected activity and explicit attestation before approving it.'
										: 'Draft saved pending review. Complete the statement lines and resolve discrepancies before approval.';
							await invalidateAll();
						} else {
							const savedReconciliation = result.data?.reconciliation;
							workspaceDraftId = savedReconciliation?.id || workspaceDraftId;
							workspaceClosed = savedReconciliation?.status === 'completed';
							workspaceDirty = false;
							workspaceNotice = workspaceClosed
								? 'Reconciliation approved and closed.'
								: 'The draft was saved but is still open. Review its status and remaining checks before approving it.';
							await invalidateAll();
						}
					} else if (result?.type === 'failure') {
						workspaceError =
							result.data?.accounting_error ||
							result.data?.message ||
							result.data?.error ||
							'The reconciliation could not be saved.';
					} else if (result?.type === 'error') {
						workspaceError = result.error?.message || 'The reconciliation could not be saved.';
					}
				} finally {
					workspaceBusy = '';
				}
			};
		};
	}

	function enhanceReopen(reconciliationId) {
		return () =>
			async ({ result, update }) => {
				await update();
				if (result?.type === 'success' && workspaceDraftId === reconciliationId) {
					workspaceClosed = false;
					workspaceDirty = false;
					workspaceNotice =
						'Reconciliation reopened. Review the saved lines and matches, then save a draft before closing again.';
					workspaceError = '';
				}
			};
	}

	function removeSelected(id, list, assign) {
		assign(list.filter((value) => value !== id));
	}

	function feedLabel(item) {
		const amount = liabilityAccount
			? -Number(item.amount_cents || 0)
			: Number(item.amount_cents || 0);
		const earlier =
			statementStartingDate && item.transaction_date < statementStartingDate
				? ' · prior-period candidate'
				: '';
		return `${formatDate(item.transaction_date)} · ${item.description || 'Bank activity'} · ${formatCents(amount)}${earlier}`;
	}

	function matchCandidateLabel(candidate) {
		const feedId =
			candidate.feedItemId ||
			candidate.feed_item_id ||
			candidate.bankFeedItemId ||
			candidate.bank_feed_item_id;
		const entryId =
			candidate.entryId ||
			candidate.entry_id ||
			candidate.ledgerEntryId ||
			candidate.ledger_entry_id;
		const feed = feedItems.find((item) => item.id === feedId || item.id === candidate.id);
		const entry = ledgerEntries.find((item) => item.id === entryId || item.id === candidate.id);
		if (feed) return `Bank feed · ${feedLabel(feed)}`;
		if (entry) return `Ledger · ${ledgerLabel(entry)}`;
		return (
			[
				candidate.description,
				candidate.transactionDate || candidate.transaction_date,
				candidate.amountCents != null
					? formatCents(candidate.amountCents)
					: candidate.amount_cents != null
						? formatCents(candidate.amount_cents)
						: ''
			]
				.filter(Boolean)
				.join(' · ') ||
			candidate.label ||
			candidate.reason ||
			'Suggested candidate'
		);
	}

	function chooseSuggestedCandidate(line, candidate) {
		const suggested = candidate.suggestedMatch || candidate.suggested_match || candidate;
		const candidateId = suggested.id || candidate.id;
		const feedId =
			suggested.feedItemId ||
			suggested.feed_item_id ||
			suggested.bankFeedItemId ||
			suggested.bank_feed_item_id ||
			(candidate.type === 'feed' ||
			candidate.kind === 'feed_item' ||
			feedItems.some((item) => item.id === candidateId)
				? candidateId
				: '');
		const entryId =
			suggested.entryId ||
			suggested.entry_id ||
			suggested.ledgerEntryId ||
			suggested.ledger_entry_id ||
			(candidate.type === 'ledger' ||
			candidate.kind === 'ledger_entry' ||
			ledgerEntries.some((entry) => entry.id === candidateId)
				? candidateId
				: '');
		if (feedId) line.feedItemId = feedId;
		if (entryId) line.entryId = entryId;
		line.matchReason = candidate.reason || suggested.reason || line.matchReason;
		line.matchConfidence = candidate.confidence ?? suggested.confidence ?? line.matchConfidence;
		workspaceDirty = true;
		// Keep the line outstanding. The user must explicitly mark it Matched to approve clearing.
	}

	function ledgerLabel(entry) {
		const accountLines = (entry.lines ?? []).filter((line) => line.account_id === accountId);
		const amount =
			entry.account_amount_cents != null
				? Number(entry.account_amount_cents)
				: accountLines.length
					? accountLines.reduce((sum, line) => {
							const debit = Number(line.debit_cents || 0);
							const credit = Number(line.credit_cents || 0);
							return sum + (liabilityAccount ? credit - debit : debit - credit);
						}, 0)
					: Number(entry.amount_cents || 0);
		const earlier =
			statementStartingDate && entry.entry_date < statementStartingDate
				? ' · prior-period outstanding'
				: '';
		return `${formatDate(entry.entry_date)} · ${entry.description || 'Ledger activity'} · ${formatCents(amount)}${earlier}`;
	}

	function discrepancyLineLabel(discrepancy) {
		const id = discrepancy.statementLineId || discrepancy.statement_line_id || '';
		const line = workspaceLines.find(
			(candidate) => candidate.id === id || candidate.clientId === id
		);
		return (
			line?.description || (id ? `Statement line ${String(id).slice(0, 8)}` : 'Statement activity')
		);
	}
</script>

<section id="reconciliation-workspace" class="scroll-mt-6 space-y-4">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-primary-600-300 text-xs font-bold tracking-[0.18em] uppercase">
				Close the books
			</p>
			<h2 class="mt-1 text-2xl font-bold tracking-tight">Reconciliation workspace</h2>
			<p class="text-surface-600-400 mt-1 max-w-3xl text-sm leading-relaxed">
				Review the statement, bank feed, and ledger together. Save a draft at any point; closing
				always requires an explicit approval.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if workspaceDraftId}
				<span
					class="badge {workspaceClosed
						? 'preset-tonal-success'
						: 'preset-tonal-warning'} px-3 py-1 text-xs font-bold"
					>{workspaceClosed ? 'Closed' : 'Draft'} {workspaceDraftId.slice(0, 8)}</span
				>
			{/if}
			<button
				class="btn btn-sm preset-tonal-surface font-semibold"
				type="button"
				onclick={startNewStatement}>New statement</button
			>
		</div>
	</div>

	<form
		method="POST"
		use:enhance={enhanceWorkspace}
		enctype="multipart/form-data"
		action="?/saveReconciliationDraft"
		class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-4 sm:p-6"
	>
		<input type="hidden" name="reconciliationId" value={workspaceDraftId} />
		<input type="hidden" name="verificationMode" value={verificationMode} />
		<input type="hidden" name="statementCurrency" value={effectiveStatementCurrency} />
		<input type="hidden" name="statementLines" value={statementLinePayload} />
		<input type="hidden" name="aiConsent" value={aiShareOptIn ? 'true' : 'false'} />
		<input type="hidden" name="selectedFeedItemIds" value={chosenFeedItemIds.join(',')} />
		<input type="hidden" name="selectedLedgerEntryIds" value={chosenLedgerEntryIds.join(',')} />
		<input
			type="hidden"
			name="balanceOnlyAttestation"
			value={balanceOnlyAttestation ? 'true' : 'false'}
		/>
		<fieldset class="contents" disabled={workspaceClosed}>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<label class="label xl:col-span-1">
					<span class="text-surface-700-300 text-xs font-semibold">Bank or card account</span>
					<select
						class="select preset-tonal-surface"
						name="accountId"
						bind:value={accountId}
						onchange={markWorkspaceDirty}
						required
						disabled={!cashAccounts.length}
					>
						<option value="">Select account…</option>
						{#each cashAccounts as account (account.id)}
							<option value={account.id}>{accountLabel(account)}</option>
						{/each}
					</select>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">Period begins</span>
					<input
						class="input preset-tonal-surface"
						type="date"
						name="statementStartingDate"
						bind:value={statementStartingDate}
						oninput={markWorkspaceDirty}
						max={today || undefined}
						required
					/>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">Statement ending date</span>
					<input
						class="input preset-tonal-surface"
						type="date"
						name="statementEndingDate"
						bind:value={statementEndingDate}
						oninput={markWorkspaceDirty}
						max={today || undefined}
						required
					/>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">Opening balance</span>
					<input
						class="input preset-tonal-surface"
						type="number"
						inputmode="decimal"
						step="0.01"
						name="openingBalance"
						bind:value={openingBalance}
						oninput={markWorkspaceDirty}
						placeholder="0.00"
						required
					/>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">Ending balance</span>
					<input
						class="input preset-tonal-surface"
						type="number"
						inputmode="decimal"
						step="0.01"
						name="statementEndingBalance"
						bind:value={endingBalance}
						oninput={markWorkspaceDirty}
						placeholder="0.00"
						required
					/>
				</label>
			</div>
			<p class="text-surface-500 -mt-2 text-xs">
				{#if liabilityAccount}
					For card accounts, charges increase the amount owed and are positive; payments and credits
					reduce it and are negative. Enter the liability balance as a positive amount.
				{:else}
					Use positive amounts for deposits and negative amounts for withdrawals, checks, and fees.
					The opening balance plus statement activity should equal the ending balance.
				{/if}
				{#if statementStartingDate && statementEndingDate && statementStartingDate > statementEndingDate}<span
						class="text-error-700-300 font-semibold"
					>
						The period start must be on or before the ending date.</span
					>{/if}
			</p>
			<div class="border-surface-500/10 bg-surface-500/5 rounded-xl border px-3 py-2 text-xs">
				<p>
					Statement currency: <strong>{effectiveStatementCurrency}</strong> · Group currency:
					<strong>{groupCurrency}</strong>
				</p>
				{#if currencyMismatch}
					<p role="alert" class="text-error-700-300 mt-1 font-semibold">
						The statement currency does not match this group. Review the source statement and
						account currency; this draft cannot be saved or closed until the currency matches.
					</p>
				{/if}
			</div>

			<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
				<div class="space-y-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h3 class="font-bold">Statement evidence</h3>
							<p class="text-surface-500 mt-1 text-xs">
								Upload the statement, then optionally ask AI to extract its transaction lines.
							</p>
						</div>
						<label class="btn btn-sm preset-tonal-surface cursor-pointer font-semibold">
							<IconUpload class="h-4 w-4" />
							<span>Choose statement</span>
							<input
								id="reconciliation-statement-file"
								class="sr-only"
								type="file"
								name="statementFile"
								accept="application/pdf,image/jpeg,image/png,image/webp"
								onchange={onStatementFileChange}
							/>
						</label>
					</div>
					<div
						class="border-surface-500/10 bg-surface-500/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
					>
						<p class="text-surface-600-400 min-w-0 text-xs">
							With your opt-in, OpenAI receives the uploaded statement and relevant bank-feed/ledger
							dates, descriptions, and amounts for extraction and matching suggestions. It never
							posts ledger entries or closes the reconciliation.
						</p>
						<label class="flex w-full cursor-pointer items-start gap-2 text-xs">
							<input class="checkbox mt-0.5" type="checkbox" bind:checked={aiShareOptIn} />
							<span
								>I opt in to sending this statement and relevant banking and ledger details to
								OpenAI.</span
							>
						</label>
						<button
							class="btn btn-sm preset-outlined-primary-500 shrink-0 font-semibold"
							type="submit"
							formaction="?/analyzeReconciliationStatement"
							disabled={workspaceBusy !== '' || !aiShareOptIn || !selectedStatementFile}
						>
							<IconFileText class="h-4 w-4" />
							{workspaceBusy === 'analyze' ? 'Analyzing…' : 'Analyze with AI'}
						</button>
					</div>
					{#if selectedStatementFile}
						<div class="border-surface-500/10 space-y-2 rounded-xl border p-3">
							<p class="text-xs font-semibold">
								Original statement: {selectedStatementFile.name}
								<span class="text-surface-500 font-normal"
									>({Math.max(1, Math.round(selectedStatementFile.size / 1024))} KB)</span
								>
							</p>
							{#if statementPreviewUrl && selectedStatementFile.type === 'application/pdf'}
								<iframe
									class="h-80 w-full rounded-lg border"
									src={statementPreviewUrl}
									title="Uploaded bank statement preview"
								></iframe>
							{:else if statementPreviewUrl && selectedStatementFile.type.startsWith('image/')}
								<img
									class="max-h-96 w-full rounded-lg object-contain"
									src={statementPreviewUrl}
									alt="Uploaded bank statement preview"
								/>
							{:else}
								<p class="text-surface-500 text-xs">
									Preview is available for PDF and image statements. The original file remains
									attached to this form.
								</p>
							{/if}
						</div>
					{/if}
					{#if analysisWarnings.length}
						<div class="preset-tonal-warning space-y-1 rounded-xl p-3 text-xs">
							<p class="font-bold">Analysis notes to review</p>
							{#each analysisWarnings as warning}<p>
									{typeof warning === 'string'
										? warning
										: warning?.message || warning?.reason || JSON.stringify(warning)}
								</p>{/each}
						</div>
					{/if}
					{#if analysisSummaryText || analysisArithmetic}
						<div class="preset-tonal-primary rounded-xl p-3 text-xs">
							<p class="font-bold">Statement analysis summary</p>
							{#if analysisSummaryText}<p class="mt-1">
									{analysisSummaryText}
								</p>{/if}{#if analysisArithmetic}<p class="mt-1">
									{arithmeticLabel(analysisArithmetic)}
								</p>{/if}
						</div>
					{/if}
					{#if analysisDiscrepancies.length}
						<div class="border-warning-500/20 bg-warning-500/5 space-y-2 rounded-xl border p-3">
							<p class="text-xs font-bold">
								AI discrepancy suggestions · review each before acting
							</p>
							{#each analysisDiscrepancies as discrepancy, index (`${discrepancy.statementLineId || discrepancy.statement_line_id || 'discrepancy'}-${index}`)}
								<div class="border-surface-500/10 border-t pt-2 text-xs first:border-0 first:pt-0">
									<p class="font-semibold">
										{discrepancy.kind || 'Potential discrepancy'} · {discrepancyLineLabel(
											discrepancy
										)}{discrepancy.confidence != null
											? ` · ${confidenceLabel(discrepancy.confidence)}`
											: ''}
									</p>
									{#if discrepancy.reason}<p class="text-surface-600-400 mt-1">
											{discrepancy.reason}
										</p>{/if}
									{#if discrepancy.suggestedAction}<p class="text-primary-700-300 mt-1">
											<span class="font-semibold">Suggested follow-up:</span>
											{discrepancy.suggestedAction}
										</p>{/if}
									{#if discrepancy.relatedCandidates?.length}<p class="text-surface-500 mt-1">
											Related candidates: {discrepancy.relatedCandidates
												.map((candidate) => candidate.description || candidate.id || candidate)
												.join(' · ')}
										</p>{/if}
								</div>
							{/each}
						</div>
					{/if}

					<div class="space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h3 class="font-bold">Extracted statement lines</h3>
								<p class="text-surface-500 text-xs">
									Correct dates, descriptions, and signed amounts before reviewing matches.
								</p>
							</div>
							<button
								class="btn btn-sm preset-tonal-surface font-semibold"
								type="button"
								onclick={addBlankLine}>Add line</button
							>
						</div>
						{#if workspaceLines.length}
							<div class="space-y-2">
								{#each workspaceLines as line, index (line.clientId)}
									<fieldset
										class="border-surface-500/10 bg-surface-500/5 min-w-0 space-y-3 rounded-xl border p-3"
									>
										<legend class="px-1 text-xs font-bold">Statement line {index + 1}</legend>
										<div class="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_9rem_auto]">
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Date</span
												>
												<input
													class="input preset-tonal-surface text-sm"
													type="date"
													bind:value={line.transactionDate}
													oninput={markWorkspaceDirty}
												/>
											</label>
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Description</span
												>
												<input
													class="input preset-tonal-surface text-sm"
													type="text"
													maxlength="240"
													bind:value={line.description}
													oninput={markWorkspaceDirty}
													placeholder="Statement description"
												/>
											</label>
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Amount</span
												>
												<input
													class="input preset-tonal-surface text-right text-sm tabular-nums"
													type="number"
													inputmode="decimal"
													step="0.01"
													bind:value={line.amount}
													oninput={markWorkspaceDirty}
													placeholder="0.00"
												/>
											</label>
											<button
												class="btn btn-sm preset-tonal-surface self-end text-xs"
												type="button"
												onclick={() => removeLine(line.clientId)}
												aria-label="Remove statement line {index + 1}">Remove</button
											>
										</div>
										<div class="grid gap-2 sm:grid-cols-2">
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Running balance on statement (optional)</span
												>
												<input
													class="input preset-tonal-surface text-right text-sm tabular-nums"
													type="number"
													inputmode="decimal"
													step="0.01"
													bind:value={line.runningBalance}
													oninput={markWorkspaceDirty}
													placeholder="If shown for this line"
												/>
											</label>
											<p class="text-surface-500 self-end text-xs">
												{line.pageReference || (line.pageNumber ? `Page ${line.pageNumber}` : '')}
											</p>
										</div>
										<div class="grid gap-2 lg:grid-cols-3">
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Bank feed row</span
												>
												<select
													class="select preset-tonal-surface text-xs"
													bind:value={line.feedItemId}
													onchange={markWorkspaceDirty}
												>
													<option value="">No feed match</option>
													{#each workspaceFeedCandidates as item (item.id)}
														<option value={item.id}>{feedLabel(item)}</option>
													{/each}
												</select>
											</label>
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Ledger entry</span
												>
												<select
													class="select preset-tonal-surface text-xs"
													bind:value={line.entryId}
													onchange={markWorkspaceDirty}
												>
													<option value="">No ledger match</option>
													{#each workspaceLedgerCandidates as entry (entry.id)}
														<option value={entry.id}>{ledgerLabel(entry)}</option>
													{/each}
												</select>
											</label>
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Review decision</span
												>
												<select
													class="select preset-tonal-surface text-xs"
													bind:value={line.resolution}
													onchange={markWorkspaceDirty}
												>
													<option value="matched">Matched</option>
													<option value="outstanding">Outstanding / needs review</option>
													<option value="excluded"
														>Approve exception — keep in statement activity</option
													>
													<option value="ignored"
														>Ignore row — exclude from statement activity</option
													>
												</select>
											</label>
										</div>
										<label
											class="bg-surface-500/5 flex cursor-pointer items-start gap-2 rounded-lg p-2 text-xs"
										>
											<input
												class="checkbox mt-0.5"
												type="checkbox"
												bind:checked={line.isSplit}
												onchange={markWorkspaceDirty}
												disabled={!line.entryId}
											/>
											<span
												><strong class="block"
													>Split this ledger entry across statement lines</strong
												><span class="text-surface-500"
													>Enable on every statement line assigned to the same ledger entry. Their
													amounts must add up to the ledger amount.</span
												></span
											>
										</label>
										{#if line.resolution === 'excluded' || line.resolution === 'ignored'}
											<label class="label">
												<span class="text-surface-500 text-[10px] font-semibold uppercase"
													>Reason for {line.resolution === 'ignored'
														? 'ignoring this row'
														: 'approved exception'}</span
												>
												<input
													class="input preset-tonal-surface text-sm"
													type="text"
													maxlength="300"
													bind:value={line.excludeReason}
													oninput={markWorkspaceDirty}
													placeholder="Explain why this statement row is ignored or excepted"
												/>
											</label>
										{/if}
										{#if line.matchReason || line.matchConfidence != null || line.extractionConfidence != null}
											<p class="text-primary-700-300 text-xs">
												AI suggestion{line.matchConfidence != null
													? ` · match ${confidenceLabel(line.matchConfidence)}`
													: ''}{line.extractionConfidence != null
													? ` · extraction ${confidenceLabel(line.extractionConfidence)}`
													: ''}{line.matchReason ? ` · ${line.matchReason}` : ''}
											</p>
										{/if}
										{#if line.matchCandidates?.length}
											<div class="bg-primary-500/5 space-y-2 rounded-lg p-2 text-xs">
												<p class="font-semibold">
													AI candidate suggestions · choosing one does not approve it
												</p>
												{#each line.matchCandidates as candidate, candidateIndex (`${line.clientId}-${candidate.id || candidateIndex}`)}
													<div class="flex flex-wrap items-center justify-between gap-2">
														<p class="min-w-0 flex-1">
															{matchCandidateLabel(candidate)}{candidate.reason
																? ` · ${candidate.reason}`
																: ''}
														</p>
														<button
															class="btn btn-sm preset-tonal-surface shrink-0"
															type="button"
															onclick={() => chooseSuggestedCandidate(line, candidate)}
															>Select proposal</button
														>
													</div>
												{/each}
											</div>
										{/if}
										{#if line.uncertainty || line.pageReference || line.suggestedAction}
											<div class="bg-primary-500/5 rounded-lg p-2 text-xs">
												{#if line.pageReference}<p>
														<span class="font-semibold">Statement page:</span>
														{line.pageReference}
													</p>{/if}
												{#if line.uncertainty}<p class="mt-1">
														<span class="font-semibold">Extraction uncertainty:</span>
														{line.uncertainty}
													</p>{/if}
												{#if line.suggestedAction}<p class="mt-1">
														<span class="font-semibold">Suggested follow-up:</span>
														{line.suggestedAction}
													</p>{/if}
											</div>
										{/if}
										{#if line.resolution === 'matched' && !line.entryId}
											<p class="text-warning-700-300 text-xs font-semibold">
												Choose a ledger entry before confirming this match. A bank feed row is
												optional for manually entered activity.
											</p>
										{:else if line.resolution === 'matched' && !line.feedItemId}
											<p class="text-primary-700-300 text-xs">
												Direct ledger match: no bank feed row is linked. The selected ledger entry
												will be cleared when you approve.
											</p>
										{/if}
										{#if ['excluded', 'ignored'].includes(line.resolution) && (line.feedItemId || line.entryId)}
											<p class="text-warning-700-300 text-xs font-semibold">
												Clear the selected match fields before saving this row as an exception or
												ignored item.
											</p>
										{/if}
									</fieldset>
								{/each}
							</div>
						{:else}
							<p
								class="border-surface-500/10 text-surface-500 rounded-xl border border-dashed p-5 text-center text-sm"
							>
								No statement lines yet. Analyze the uploaded statement or add rows manually.
							</p>
						{/if}
					</div>
				</div>

				<aside class="space-y-4">
					<div class="border-surface-500/10 space-y-3 rounded-xl border p-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="font-bold">Three-way review</h3>
							<span class="badge preset-tonal-primary px-2 py-0.5 text-[10px] font-bold"
								>{matchedLineCount} matched</span
							>
						</div>
						<p class="text-surface-500 text-xs">
							Each confirmed row links one statement line, one bank feed item, and one ledger entry.
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div class="bg-surface-500/5 rounded-lg p-3">
								<span class="text-surface-500 block">Needs review</span><strong
									class="mt-1 block text-base"
									>{outstandingLines.length +
										unmatchedFeedCandidates.length +
										unmatchedLedgerCandidates.length}</strong
								>
							</div>
							<div class="bg-surface-500/5 rounded-lg p-3">
								<span class="text-surface-500 block">Ignored / exceptions</span><strong
									class="mt-1 block text-base">{excludedLineCount}</strong
								>
							</div>
						</div>
						{#if rollforwardDifference != null}
							<div class="border-surface-500/10 space-y-2 border-t pt-3 text-xs">
								<div class="flex justify-between gap-2">
									<span class="text-surface-600-400">Opening balance</span><span
										class="tabular-nums">{formatCents(amountToCents(openingBalance))}</span
									>
								</div>
								<div class="flex justify-between gap-2">
									<span class="text-surface-600-400"
										>Statement activity, including approved exceptions</span
									><span class="tabular-nums">{formatCents(statementActivityCents)}</span>
								</div>
								<div class="flex justify-between gap-2 font-semibold">
									<span>Calculated ending balance</span><span class="tabular-nums"
										>{formatCents(amountToCents(openingBalance) + statementActivityCents)}</span
									>
								</div>
								<div class="flex justify-between gap-2">
									<span class="text-surface-600-400">Statement ending balance</span><span
										class="tabular-nums">{formatCents(amountToCents(endingBalance))}</span
									>
								</div>
								<div class="border-surface-500/10 flex justify-between gap-2 border-t pt-2 text-sm">
									<span class="font-semibold">Difference</span><strong
										class="tabular-nums {rollforwardDifference === 0
											? 'text-success-700-300'
											: 'text-warning-700-300'}">{formatCents(rollforwardDifference)}</strong
									>
								</div>
							</div>
						{/if}
					</div>
					<div class="border-surface-500/10 space-y-2 rounded-xl border p-4">
						<h3 class="font-bold">Rows that will be cleared on approval</h3>
						<p class="text-surface-500 text-xs">
							Only rows explicitly marked Matched, plus the balance-only manual selections, are sent
							to close.
						</p>
						{#if selectedFeedRows.length || selectedLedgerRows.length}
							<div class="space-y-2 text-xs">
								{#each selectedFeedRows as item (item.id)}<p
										class="bg-surface-500/5 rounded-lg p-2"
									>
										<span class="font-semibold">Bank feed:</span>
										{feedLabel(item)}
									</p>{/each}
								{#each selectedLedgerRows as entry (entry.id)}<p
										class="bg-surface-500/5 rounded-lg p-2"
									>
										<span class="font-semibold">Ledger:</span>
										{ledgerLabel(entry)}
									</p>{/each}
							</div>
						{:else}<p class="preset-tonal-warning rounded-lg p-3 text-xs">
								No rows are selected to clear. Confirm matches or, for an empty period, use
								balance-only review and attest.
							</p>{/if}
					</div>

					<div class="border-surface-500/10 space-y-2 rounded-xl border p-4">
						<h3 class="font-bold">Discrepancy queue</h3>
						{#if outstandingLines.length || unmatchedFeedCandidates.length || unmatchedLedgerCandidates.length || excludedLines.length}
							<div class="max-h-80 space-y-2 overflow-y-auto">
								{#each outstandingLines as line (line.clientId)}
									<div class="bg-warning-500/10 rounded-lg p-3 text-xs">
										<p class="font-semibold">
											Statement line needs review: {line.description || 'Unlabeled line'}
										</p>
										<p class="text-surface-500 mt-1">
											{line.transactionDate ? formatDate(line.transactionDate) : 'Date missing'} · {formatCents(
												amountToCents(line.amount)
											)}{line.feedItemId
												? ' · feed linked'
												: line.resolution === 'matched' && line.entryId
													? ' · direct ledger match'
													: ' · no feed row'}{line.entryId
												? ' · ledger linked'
												: ' · no ledger entry'}
										</p>
										{#if !line.entryId}<a
												class="text-primary-700-300 mt-2 inline-block font-semibold underline"
												href={line.feedItemId ? '?tab=banking' : '?tab=enter'}
												>{line.feedItemId
													? 'Review or post bank feed activity'
													: 'Record ledger activity'}</a
											>{/if}
									</div>
								{/each}
								{#each excludedLines as line (`excluded-${line.clientId}`)}
									<div class="bg-warning-500/10 rounded-lg p-3 text-xs">
										<p class="font-semibold">
											{line.resolution === 'ignored'
												? 'Ignored source row · omitted from statement activity'
												: 'Approved exception · included in statement activity'}
										</p>
										<p class="text-surface-500 mt-1">
											{line.transactionDate
												? formatDate(line.transactionDate)
												: 'Date not required for ignored row'} · {line.description ||
												'Unlabeled line'} · {line.amount === ''
												? 'No amount'
												: formatCents(amountToCents(line.amount))}
										</p>
										<p class="mt-1">{line.excludeReason || 'No reason supplied.'}</p>
									</div>
								{/each}
								{#each unmatchedFeedCandidates.slice(0, 12) as item (item.id)}
									<div class="bg-surface-500/5 rounded-lg p-3 text-xs">
										<p class="font-semibold">Bank activity not matched to a statement line</p>
										<p class="text-surface-500 mt-1">{feedLabel(item)}</p>
										<a
											class="text-primary-700-300 mt-2 inline-block font-semibold underline"
											href="?tab=banking">Review, post, or match this feed item</a
										>
									</div>
								{/each}
								{#each unmatchedLedgerCandidates.slice(0, 12) as entry (entry.id)}
									<div class="bg-surface-500/5 rounded-lg p-3 text-xs">
										<p class="font-semibold">Ledger activity not matched to a statement line</p>
										<p class="text-surface-500 mt-1">{ledgerLabel(entry)}</p>
										<a
											class="text-primary-700-300 mt-2 inline-block font-semibold underline"
											href="?tab=enter">Review ledger activity</a
										>
									</div>
								{/each}
							</div>
						{:else}
							<p class="preset-tonal-success rounded-lg p-3 text-xs">
								Every available statement, feed, and ledger row is matched or explicitly excluded.
							</p>
						{/if}
					</div>
				</aside>
			</div>

			<details
				class="border-surface-500/10 rounded-xl border"
				open={verificationMode === 'balance_only'}
			>
				<summary class="cursor-pointer px-4 py-3 text-sm font-bold"
					>Balance-only manual review</summary
				>
				<div class="border-surface-500/10 space-y-4 border-t p-4">
					<label class="flex cursor-pointer items-start gap-3 rounded-lg p-2">
						<input
							type="radio"
							name="modePicker"
							value="statement"
							checked={verificationMode === 'statement'}
							onchange={() => {
								verificationMode = 'statement';
								markWorkspaceDirty();
							}}
						/>
						<span
							><strong class="block text-sm">Statement-line review</strong><span
								class="text-surface-500 text-xs"
								>Use extracted or manually entered lines and review all three sources.</span
							></span
						>
					</label>
					<label class="flex cursor-pointer items-start gap-3 rounded-lg p-2">
						<input
							type="radio"
							name="modePicker"
							value="balance_only"
							checked={verificationMode === 'balance_only'}
							onchange={() => {
								verificationMode = 'balance_only';
								markWorkspaceDirty();
							}}
							disabled={statementModeLocked}
						/>
						<span
							><strong class="block text-sm">Balance-only, statement lines unverified</strong><span
								class="text-surface-500 text-xs"
								>Select cleared feed and ledger activity, then attest that transaction-line matching
								was not performed.</span
							></span
						>
					</label>
					{#if statementModeLocked}<p class="text-warning-700-300 px-2 text-xs">
							This draft contains statement lines, so its verification mode cannot be changed to
							balance-only.
						</p>{/if}
					{#if verificationMode === 'balance_only'}
						<div class="grid gap-4 lg:grid-cols-2">
							<div class="space-y-2">
								<p class="text-surface-700-300 text-xs font-semibold">Bank feed items to clear</p>
								<div
									class="border-surface-500/10 max-h-52 divide-y overflow-y-auto rounded-lg border"
								>
									{#each workspaceFeedCandidates as item (item.id)}
										<label
											class="hover:bg-surface-500/5 flex cursor-pointer items-center gap-2 p-2 text-xs"
											><input
												class="checkbox"
												type="checkbox"
												value={item.id}
												bind:group={manualFeedItemIds}
												onchange={markWorkspaceDirty}
											/><span class="min-w-0 flex-1 truncate">{feedLabel(item)}</span></label
										>
									{:else}<p class="text-surface-500 p-3 text-xs">
											No eligible bank activity for this account and period.
										</p>{/each}
								</div>
							</div>
							<div class="space-y-2">
								<p class="text-surface-700-300 text-xs font-semibold">Ledger entries to clear</p>
								<div
									class="border-surface-500/10 max-h-52 divide-y overflow-y-auto rounded-lg border"
								>
									{#each workspaceLedgerCandidates as entry (entry.id)}
										<label
											class="hover:bg-surface-500/5 flex cursor-pointer items-center gap-2 p-2 text-xs"
											><input
												class="checkbox"
												type="checkbox"
												value={entry.id}
												bind:group={manualLedgerEntryIds}
												onchange={markWorkspaceDirty}
											/><span class="min-w-0 flex-1 truncate">{ledgerLabel(entry)}</span></label
										>
									{:else}<p class="text-surface-500 p-3 text-xs">
											No eligible ledger activity for this account and period.
										</p>{/each}
								</div>
							</div>
						</div>
						<label
							class="bg-warning-500/10 flex cursor-pointer items-start gap-3 rounded-xl p-3 text-xs"
						>
							<input
								class="checkbox mt-0.5"
								type="checkbox"
								bind:checked={balanceOnlyAttestation}
								onchange={markWorkspaceDirty}
							/>
							<span
								>I reviewed the opening and ending balances and selected cleared activity. I
								understand the statement transaction lines were not verified.</span
							>
						</label>
					{/if}
				</div>
			</details>

			{#if workspaceError}<p role="alert" class="preset-tonal-error rounded-lg p-3 text-sm">
					{workspaceError}
				</p>{/if}
			{#if workspaceNotice}<p role="status" class="preset-tonal-primary rounded-lg p-3 text-sm">
					{workspaceNotice}
				</p>{/if}
			{#if excludedLines.length}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					<strong
						>{ignoredLineCount} ignored row{ignoredLineCount === 1 ? '' : 's'} will be omitted from activity;
						{approvedExceptionCount} approved exception{approvedExceptionCount === 1 ? '' : 's'} will
						remain in statement activity.</strong
					> The closed period will be marked qualified. Review each reason in the discrepancy queue before
					approval.
				</p>
			{/if}
			{#if exceptionMatchConflict}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					Clear the proposed bank-feed and ledger selections from each ignored row or approved
					exception before saving it. Suggestions remain visible until you remove or confirm them.
				</p>
			{:else if verificationMode === 'statement' && outstandingLines.length}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					Match, mark outstanding, approve as an exception, or ignore every statement row.
					Outstanding rows block close; exceptions and ignored artifacts need reasons.
				</p>
			{:else if verificationMode === 'statement' && incompleteLines.length}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					Close is unavailable until real statement rows have dates, descriptions, and amounts, and
					every ignored row or exception has a reason. Ignored rows may omit transaction details;
					save the draft and correct other flagged rows later.
				</p>
			{:else if verificationMode === 'statement' && workspaceLines.length && rollforwardDifference !== 0}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					The statement does not roll forward to the ending balance yet. Correct the opening
					balance, ending balance, or statement lines, then save the draft; approval stays disabled
					until the difference is zero.
				</p>
			{:else if verificationMode === 'balance_only' && !balanceOnlyAttestation}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					Balance-only close is disabled until you explicitly attest that transaction lines were not
					verified.
				</p>
			{/if}
			{#if workspaceDirty && workspaceDraftId}
				<p class="preset-tonal-warning rounded-lg p-3 text-xs">
					Save your latest edits before approval. Closing uses the saved draft and its confirmed
					matches.
				</p>
			{/if}

			<div
				class="border-surface-500/10 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
			>
				<p class="text-surface-500 text-xs">
					Save your review as a draft before approving it. A draft can be reopened and edited later.
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="btn preset-tonal-surface font-semibold"
						type="submit"
						formaction="?/saveReconciliationDraft"
						disabled={workspaceBusy !== '' ||
							workspaceClosed ||
							currencyMismatch ||
							exceptionMatchConflict ||
							(verificationMode === 'statement' && !workspaceLines.length)}
					>
						{workspaceBusy === 'save' ? 'Saving…' : 'Save draft'}
					</button>
					<button
						class="btn preset-filled-primary-500 font-bold"
						type="submit"
						formaction="?/closeReconciliation"
						disabled={workspaceBusy !== '' ||
							workspaceClosed ||
							workspaceDirty ||
							currencyMismatch ||
							exceptionMatchConflict ||
							!workspaceDraftId ||
							(verificationMode === 'statement' &&
								(!workspaceLines.length ||
									outstandingLines.length > 0 ||
									incompleteLines.length > 0 ||
									rollforwardDifference !== 0)) ||
							(verificationMode === 'balance_only' && !balanceOnlyAttestation)}
					>
						<IconCheckCircle2 class="h-4 w-4" />
						{workspaceBusy === 'close' ? 'Closing…' : 'Approve and close'}
					</button>
				</div>
			</div>
		</fieldset>
	</form>

	<section class="card preset-tonal-surface border-surface-500/10 space-y-3 border p-4 sm:p-5">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h3 class="text-base font-bold">Reconciliation history</h3>
				<p class="text-surface-500 mt-1 text-xs">
					Open a draft to continue it, inspect a closed period, or reopen a completed reconciliation
					with a reason.
				</p>
			</div>
			<span class="text-surface-500 text-xs">{reconciliations.length} recent</span>
		</div>
		{#if reconciliations.length}
			<div class="divide-surface-500/10 divide-y">
				{#each reconciliations as reconciliation (reconciliation.id)}
					<article class="py-3 first:pt-0">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-semibold">
										{reconciliation.account?.code
											? `${reconciliation.account.code} · `
											: ''}{reconciliation.account?.name || 'Account'}
									</p>
									<span
										class="badge {reconciliation.status === 'completed'
											? 'preset-tonal-success'
											: 'preset-tonal-warning'} px-2 py-0.5 text-[10px] font-bold uppercase"
										>{reconciliation.status === 'completed' ? 'Closed' : 'Draft'}</span
									>{#if reconciliation.verification_mode === 'balance_only'}<span
											class="badge preset-tonal-warning px-2 py-0.5 text-[10px] font-bold"
											>Balance-only</span
										>{/if}
								</div>
								<p class="text-surface-500 mt-1 text-xs">
									{reconciliation.period_start_date || reconciliation.statement_starting_date
										? `${formatDate(reconciliation.period_start_date || reconciliation.statement_starting_date)} – `
										: ''}{formatDate(reconciliation.statement_ending_date)} · Statement {formatCents(
										reconciliation.statement_ending_balance_cents
									)} · Ledger {formatCents(reconciliation.book_balance_cents)}
								</p>
								<p class="text-surface-500 mt-1 text-xs">
									Difference {formatCents(
										reconciliation.difference_cents
									)}{reconciliation.statement_file_name
										? ` · ${reconciliation.statement_file_name}`
										: ''}
								</p>
								<p class="text-surface-500 mt-1 text-xs">
									Verification: {['balance_only', 'legacy'].includes(
										reconciliation.verification_mode
									)
										? 'Balance-only · statement lines unverified'
										: reconciliation.verification_status === 'qualified'
											? 'Qualified · exception or ignored rows'
											: reconciliation.verification_status === 'verified'
												? 'Verified'
												: reconciliation.verification_status === 'unverified'
													? 'Unverified'
													: reconciliation.verification_status || 'Pending review'}
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<button
									class="btn btn-sm preset-tonal-surface font-semibold"
									type="button"
									onclick={() =>
										(expandedReconciliationId =
											expandedReconciliationId === reconciliation.id ? '' : reconciliation.id)}
									>{expandedReconciliationId === reconciliation.id
										? 'Hide history'
										: 'View history'}</button
								>
								{#if reconciliation.status !== 'completed'}<button
										class="btn btn-sm preset-outlined-primary-500 font-semibold"
										type="button"
										onclick={() => openReconciliation(reconciliation)}>Continue draft</button
									>{/if}
								{#if reconciliation.statement_file_name}<form
										method="POST"
										action="?/downloadReconciliationStatement"
									>
										<input type="hidden" name="reconciliationId" value={reconciliation.id} /><button
											class="btn btn-sm preset-tonal-surface font-semibold"
											type="submit">Statement file</button
										>
									</form>{/if}
							</div>
						</div>
						{#if expandedReconciliationId === reconciliation.id}
							<div class="bg-surface-500/5 mt-3 space-y-2 rounded-xl p-3">
								<p class="text-xs font-bold">Saved statement lines and match history</p>
								{#if storedLinesFor(reconciliation.id).length}
									<div class="divide-surface-500/10 divide-y">
										{#each storedLinesFor(reconciliation.id) as line (line.clientId)}<div
												class="flex flex-wrap justify-between gap-2 py-2 text-xs"
											>
												<span
													>{line.transactionDate ? formatDate(line.transactionDate) : 'No date'} · {line.description ||
														'Statement line'} · {formatCents(amountToCents(line.amount))}</span
												><span class="text-surface-500"
													>{line.resolution}{line.feedItemId ? ' · feed matched' : ''}{line.entryId
														? ' · ledger matched'
														: ''}{line.excludeReason ? ` · ${line.excludeReason}` : ''}</span
												>
											</div>{/each}
									</div>
								{:else}<p class="text-surface-500 text-xs">
										No transaction lines were stored for this reconciliation.
									</p>{/if}
								{#if reconciliation.status === 'completed'}
									<form
										method="POST"
										use:enhance={enhanceReopen(reconciliation.id)}
										action="?/reopenReconciliation"
										class="flex flex-col gap-2 sm:flex-row"
									>
										<input type="hidden" name="reconciliationId" value={reconciliation.id} />
										<input
											class="input preset-tonal-surface min-w-0 text-xs"
											name="reason"
											placeholder="Reason for reopening"
											required
										/>
										<button
											class="btn btn-sm preset-tonal-warning shrink-0 font-semibold"
											type="submit">Reopen period</button
										>
									</form>
								{/if}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{:else}
			<p class="text-surface-600-400 rounded-xl border border-dashed p-6 text-center text-sm">
				No statements reconciled yet.
			</p>
		{/if}
	</section>
</section>
