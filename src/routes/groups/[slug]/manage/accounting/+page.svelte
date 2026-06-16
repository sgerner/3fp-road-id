<script>
	import IconArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import IconArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBadgeDollarSign from '@lucide/svelte/icons/badge-dollar-sign';
	import IconBanknote from '@lucide/svelte/icons/banknote';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconChartColumn from '@lucide/svelte/icons/chart-column';
	import IconCheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconCog from '@lucide/svelte/icons/cog';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconLandmark from '@lucide/svelte/icons/landmark';
	import IconListChecks from '@lucide/svelte/icons/list-checks';
	import IconLockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import IconPencil from '@lucide/svelte/icons/pencil';
	import IconGripVertical from '@lucide/svelte/icons/grip-vertical';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconPrinter from '@lucide/svelte/icons/printer';
	import IconReceipt from '@lucide/svelte/icons/receipt';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconScale from '@lucide/svelte/icons/scale';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';
	import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { loadStripe } from '@stripe/stripe-js';
	import SearchableSelect from '$lib/components/ui/SearchableSelect.svelte';

	let { data, form } = $props();
	let activeTab = $state('overview');
	let moneyFlow = $state('expense');
	let financialConnectionsBusy = $state(false);
	let financialConnectionsMessage = $state('');
	let reportPeriodKey = $state('this_year');
	let reportFrom = $state('');
	let reportTo = $state('');
	let reportSyncSignature = $state('');
	let journalLines = $state([
		{ account_id: '', debit: '', credit: '', description: '' },
		{ account_id: '', debit: '', credit: '', description: '' }
	]);

	const accounts = $derived(Array.isArray(data.accounts) ? data.accounts : []);
	const groupSlug = $derived(data.group?.slug || '');
	const currency = $derived(data.settings?.currency || 'usd');
	const cashAccounts = $derived(
		accounts.filter(
			(account) => ['asset', 'liability'].includes(account.kind) && !account.is_archived
		)
	);
	const incomeAccounts = $derived(
		accounts.filter((account) => account.kind === 'income' && !account.is_archived)
	);
	const expenseAccounts = $derived(
		accounts.filter((account) => account.kind === 'expense' && !account.is_archived)
	);
	const budgetAccounts = $derived([...expenseAccounts, ...incomeAccounts]);
	const currentCategories = $derived(moneyFlow === 'income' ? incomeAccounts : expenseAccounts);
	const recentEntries = $derived(Array.isArray(data.entries) ? data.entries : []);
	const feedItems = $derived(Array.isArray(data.feed_items) ? data.feed_items : []);
	const needsReview = $derived(
		feedItems.filter((item) => ['needs_review', 'matched'].includes(item.status))
	);
	const bankReviewTotal = $derived(Number(data.bank_review_total ?? needsReview.length));
	const bankReviewPage = $derived(Number(data.bank_review_page ?? 1));
	const bankReviewPageSize = $derived(Number(data.bank_review_page_size ?? 50));
	const bankReviewTotalPages = $derived(Number(data.bank_review_total_pages ?? 0));
	const bankReviewRangeStart = $derived(
		bankReviewTotal > 0 ? (bankReviewPage - 1) * bankReviewPageSize + 1 : 0
	);
	const bankReviewRangeEnd = $derived(
		bankReviewTotal > 0
			? Math.min(bankReviewRangeStart + needsReview.length - 1, bankReviewTotal)
			: 0
	);
	const bankReviewHasPrev = $derived(bankReviewPage > 1);
	const bankReviewHasNext = $derived(bankReviewPage < bankReviewTotalPages);
	const matchedItems = $derived(feedItems.filter((item) => item.status === 'matched'));
	const providerAccounts = $derived(
		Array.isArray(data.provider_accounts) ? data.provider_accounts : []
	);
	const bankFeedAccounts = $derived(
		providerAccounts.filter((account) => account.is_enabled !== false)
	);
	const mappedBankFeedAccounts = $derived(
		bankFeedAccounts.filter((account) => account.account_id)
	);
	const receipts = $derived(Array.isArray(data.receipts) ? data.receipts : []);
	const auditEvents = $derived(Array.isArray(data.audit_events) ? data.audit_events : []);
	const visibility = $derived(data.settings?.public_visibility ?? {});
	const mercuryInitialConnected = $derived(Boolean(data.settings?.mercury_api_key_ciphertext));
	const stripeConnection = $derived(data.stripe_connection || null);
	const stripeConnected = $derived(Boolean(stripeConnection?.connected));
	const stripeConnectUrl = $derived(
		groupSlug
			? `/api/donations/connect/start?recipient=group&group=${encodeURIComponent(groupSlug)}`
			: '#'
	);
	let reviewSelections = $state({});
	let activeReviewCategoryItemId = $state('');
	let postingFeedItemIds = $state({});
	let syncedTabUrl = $state('');
	let syncAllBusy = $state(false);
	let mercuryEditMode = $state(false);
	let transactionSearch = $state('');
	let transactionViewMode = $state('recent');
	let transactionPeriodKey = $state('all');
	let transactionFrom = $state('');
	let transactionTo = $state('');
	let transactionAccountId = $state('all');
	let transactionSource = $state('all');
	let csvImportAccountId = $state('');
	let editingTransactionId = $state('');
	let savingTransactionIds = $state({});
	let editingTransactionDraft = $state({
		entryDate: '',
		description: '',
		memo: '',
		lineAccounts: []
	});
	const report = $derived(
		data.report ?? {
			from: reportFrom,
			to: reportTo,
			totals: {},
			monthly: [],
			income: [],
			expenses: [],
			assets: [],
			liabilities: [],
			equity: []
		}
	);
	const accountKinds = ['asset', 'income', 'expense', 'liability', 'equity'];
	let accountGroups = $state(groupAccountsByKind([]));
	let editingGroupKey = $state('');
	let editingGroupValue = $state('');
	let groupLabelInput = $state(null);
	const reportPeriodOptions = [
		{ value: 'all', label: 'All time' },
		{ value: 'this_month', label: 'This month' },
		{ value: 'last_month', label: 'Last month' },
		{ value: 'this_quarter', label: 'This quarter' },
		{ value: 'last_quarter', label: 'Last quarter' },
		{ value: 'this_year', label: 'This year' },
		{ value: 'last_year', label: 'Last year' },
		{ value: 'custom', label: 'Custom range' }
	];
	const reportPeriodLabel = $derived(
		data.report_period_label ??
			reportPeriodOptions.find((option) => option.value === reportPeriodKey)?.label ??
			'Reporting period'
	);
	const transactionPeriodOptions = reportPeriodOptions;
	const mercuryConnection = $derived(
		(Array.isArray(data.connections) ? data.connections : []).find(
			(connection) => connection.provider === 'mercury'
		)
	);
	const mercuryConnected = $derived(
		Boolean(
			data.settings?.mercury_api_key_ciphertext ||
			data.settings?.mercury_api_key_hint ||
			data.settings?.mercury_connected_at
		)
	);

	let showBankConfig = $state(false);
	$effect(() => {
		if (!mercuryConnected && bankFeedAccounts.length === 0) {
			showBankConfig = true;
		}
	});
	const transactionEntries = $derived(Array.isArray(data.entries) ? data.entries : []);
	const transactionAccountOptions = $derived(accounts.filter((account) => !account.is_archived));
	const transactionSourceOptions = $derived(
		[
			...new Set(
				transactionEntries.map((entry) => String(entry.source || entry.entry_type || 'manual'))
			)
		].sort()
	);
	const transactionDefaultEntries = $derived(transactionEntries.slice(0, 20));
	const transactionPeriodLabel = $derived(
		transactionPeriodOptions.find((option) => option.value === transactionPeriodKey)?.label ??
			'Transactions'
	);
	const filteredTransactions = $derived(
		transactionEntries
			.filter((entry) => transactionPeriodMatches(entry))
			.filter((entry) => transactionAccountMatches(entry, transactionAccountId))
			.filter((entry) => transactionSourceMatches(entry, transactionSource))
			.filter((entry) => matchesTransaction(entry, transactionSearch))
	);
	const transactionDisplayEntries = $derived(
		transactionViewMode === 'recent' ? transactionDefaultEntries : filteredTransactions
	);

	const tabs = [
		{ id: 'overview', label: 'Overview', icon: IconChartColumn },
		{ id: 'enter', label: 'Add Activity', icon: IconPlus },
		{ id: 'accounts', label: 'Buckets', icon: IconWalletCards },
		{ id: 'budgets', label: 'Budgets', icon: IconBadgeDollarSign },
		{ id: 'reports', label: 'Reports', icon: IconFileText },
		{ id: 'transactions', label: 'Transactions', icon: IconArrowRightLeft },
		{ id: 'banking', label: 'Bank Review', icon: IconLandmark },
		{ id: 'advanced', label: 'Advanced', icon: IconBookOpen },
		{ id: 'settings', label: 'Settings', icon: IconCog }
	];
	const tabIds = new Set(tabs.map((tab) => tab.id));

	function setActiveTab(tabId, { replaceState = false } = {}) {
		if (!tabIds.has(tabId)) return;
		activeTab = tabId;
		const url = new URL(page.url);
		if (tabId === 'overview') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', tabId);
		}
		goto(`${url.pathname}${url.search}`, {
			replaceState,
			noScroll: true,
			keepFocus: true
		});
	}

	function setBankReviewPage(pageNumber) {
		const nextPage = Math.max(1, Number.parseInt(String(pageNumber), 10) || 1);
		const url = new URL(page.url);
		if (nextPage === 1) {
			url.searchParams.delete('bankReviewPage');
		} else {
			url.searchParams.set('bankReviewPage', String(nextPage));
		}
		goto(`${url.pathname}${url.search}`, {
			noScroll: true,
			keepFocus: true
		});
	}

	$effect(() => {
		const href = page.url.href;
		if (href === syncedTabUrl) return;
		syncedTabUrl = href;
		const tab = page.url.searchParams.get('tab');
		activeTab = tab && tabIds.has(tab) ? tab : data.report_filter_active ? 'reports' : 'overview';
	});

	function formatCents(cents) {
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

	function formatDate(value) {
		if (!value) return '';
		return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function matchCandidateLabel(candidate) {
		return `${formatDate(candidate.entry_date)} · ${candidate.description} · ${formatCents(
			candidate.amount_cents
		)}`;
	}

	function selectedMatchCandidate(item) {
		const candidates = item.match_candidates ?? [];
		if (!candidates.length) return null;
		return (
			candidates.find((candidate) => candidate.id === item.matched_entry_id) ??
			candidates[0] ??
			null
		);
	}

	function monthLabel(value) {
		return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
			month: 'short',
			year: 'numeric'
		});
	}

	function startOfLocalDay(value) {
		if (!value) return null;
		return new Date(`${String(value).slice(0, 10)}T00:00:00`);
	}

	function endOfLocalDay(value) {
		if (!value) return null;
		return new Date(`${String(value).slice(0, 10)}T23:59:59.999`);
	}

	function resolveTransactionPeriodBounds() {
		if (transactionPeriodKey === 'all') return { from: null, to: null };
		const todayDate = new Date();
		const currentYear = todayDate.getFullYear();
		const currentMonth = todayDate.getMonth();
		const currentQuarter = Math.floor(currentMonth / 3);
		const now = new Date(todayDate);
		const start = new Date(todayDate);
		switch (transactionPeriodKey) {
			case 'last_month':
				start.setMonth(currentMonth - 1, 1);
				now.setMonth(currentMonth, 0);
				break;
			case 'this_quarter':
				start.setMonth(currentQuarter * 3, 1);
				break;
			case 'last_quarter':
				start.setMonth((currentQuarter - 1) * 3, 1);
				now.setMonth(currentQuarter * 3, 0);
				break;
			case 'this_year':
				start.setMonth(0, 1);
				break;
			case 'last_year':
				start.setFullYear(currentYear - 1, 0, 1);
				now.setFullYear(currentYear - 1, 11, 31);
				break;
			case 'custom':
				return {
					from: startOfLocalDay(transactionFrom),
					to: endOfLocalDay(transactionTo)
				};
			default:
				start.setMonth(currentMonth, 1);
				break;
		}
		return {
			from: new Date(start.setHours(0, 0, 0, 0)),
			to: new Date(now.setHours(23, 59, 59, 999))
		};
	}

	function transactionSearchAmount(query) {
		const normalized = String(query || '')
			.trim()
			.replace(/[$,]/g, '');
		if (!normalized) return null;
		const parsed = Number(normalized);
		if (!Number.isFinite(parsed)) return null;
		return Math.round(parsed * 100);
	}

	function transactionTextIndex(entry) {
		const lineText = (entry.lines ?? [])
			.map(
				(line) =>
					`${line.account?.code || ''} ${line.account?.name || ''} ${line.description || ''}`
			)
			.join(' ');
		const receiptText = (entry.receipts ?? []).map((receipt) => receipt.file_name).join(' ');
		return `${entry.description || ''} ${entry.memo || ''} ${entry.entry_type || ''} ${entry.source || ''} ${lineText} ${receiptText} ${formatCents(
			Math.abs(entry.amount_cents || 0)
		)}`.toLowerCase();
	}

	function transactionAccountMatches(entry, accountId) {
		if (accountId === 'all') return true;
		return (entry.lines ?? []).some((line) => line.account_id === accountId);
	}

	function getTransactionAccountOptions(query = '') {
		const normalized = String(query || '')
			.trim()
			.toLowerCase();
		if (!normalized) return transactionAccountOptions;
		return transactionAccountOptions.filter((account) => {
			const haystack =
				`${account.code} ${account.name} ${account.display_group || ''}`.toLowerCase();
			return haystack.includes(normalized);
		});
	}

	function transactionAmountPresentation(entry) {
		const cashLines = (entry.lines ?? []).filter((line) =>
			['asset', 'liability'].includes(line.account?.kind)
		);
		if (!cashLines.length) {
			return {
				sign: '',
				className: 'text-surface-700-300'
			};
		}
		const sourceLine =
			cashLines.find((line) => Number(line.credit_cents || 0) > 0) ??
			cashLines.find((line) => Number(line.debit_cents || 0) > 0) ??
			null;
		if (!sourceLine) {
			return {
				sign: '',
				className: 'text-surface-700-300'
			};
		}
		if (Number(sourceLine.credit_cents || 0) > 0) {
			return {
				sign: '-',
				className: 'text-warning-700-300'
			};
		}
		return {
			sign: '+',
			className: 'text-success-700-300'
		};
	}

	function transactionSourceMatches(entry, source) {
		if (source === 'all') return true;
		return String(entry.source || entry.entry_type || '').toLowerCase() === source;
	}

	function transactionPeriodMatches(entry) {
		const bounds = resolveTransactionPeriodBounds();
		const entryDate = startOfLocalDay(entry.entry_date);
		if (!entryDate) return true;
		if (bounds.from && entryDate < bounds.from) return false;
		if (bounds.to && entryDate > bounds.to) return false;
		return true;
	}

	function matchesTransaction(entry, query) {
		const normalized = String(query || '')
			.trim()
			.toLowerCase();
		if (!normalized) return true;
		const amountMatch = transactionSearchAmount(normalized);
		if (
			amountMatch !== null &&
			Math.abs(Number(entry.amount_cents || 0)) === Math.abs(amountMatch)
		) {
			return true;
		}
		return transactionTextIndex(entry).includes(normalized);
	}

	function groupAccountsByKind(list) {
		return accountKinds.reduce((result, kind) => {
			const grouped = new Map();
			for (const account of list.filter((candidate) => candidate.kind === kind)) {
				const displayGroup = String(account.display_group || 'Other').trim() || 'Other';
				if (!grouped.has(displayGroup)) grouped.set(displayGroup, []);
				grouped.get(displayGroup).push(account);
			}
			result[kind] = Array.from(grouped, ([displayGroup, accounts]) => ({
				displayGroup,
				accounts
			}));
			return result;
		}, {});
	}

	function groupKey(kind, displayGroup) {
		return `${kind}::${displayGroup}`;
	}

	$effect(() => {
		accountGroups = groupAccountsByKind(accounts);
		editingGroupKey = '';
		editingGroupValue = '';
	});

	function addJournalLine() {
		journalLines = [...journalLines, { account_id: '', debit: '', credit: '', description: '' }];
	}

	function removeJournalLine(index) {
		if (journalLines.length <= 2) return;
		journalLines = journalLines.filter((_, rowIndex) => rowIndex !== index);
	}

	function updateJournalLine(index, key, value) {
		journalLines = journalLines.map((line, rowIndex) =>
			rowIndex === index ? { ...line, [key]: value } : line
		);
	}

	function requestInlineSave(event) {
		event.currentTarget.form?.requestSubmit();
	}

	function accountLabel(account) {
		return `${account.code} · ${account.name}`;
	}

	function bankFeedLabel(account) {
		const mappedAccount = accounts.find((candidate) => candidate.id === account.account_id);
		const suffix = mappedAccount ? ` · ${accountLabel(mappedAccount)}` : '';
		const mask = account.mask ? ` · •••• ${account.mask}` : '';
		return `${account.display_name || 'Bank feed'}${suffix}${mask}`;
	}

	function getReviewSelection(item) {
		const state = reviewSelections[item.id] ?? {};
		const hasAccountId = Object.hasOwn(state, 'accountId');
		const hasCategoryAccountId = Object.hasOwn(state, 'categoryAccountId');
		const hasCategoryQuery = Object.hasOwn(state, 'categoryQuery');
		const accountId = hasAccountId
			? state.accountId
			: item.account_id || mappedBankFeedAccounts[0]?.account_id || '';
		const fallbackCategory =
			item.amount_cents >= 0 ? incomeAccounts[0]?.id : expenseAccounts[0]?.id;
		const categoryAccountId = hasCategoryAccountId
			? state.categoryAccountId
			: item.suggested_account_id || fallbackCategory || '';
		const categoryAccount = accounts.find((account) => account.id === categoryAccountId);
		const categoryQuery = hasCategoryQuery
			? state.categoryQuery
			: categoryAccount
				? accountLabel(categoryAccount)
				: '';
		return {
			accountId,
			categoryAccountId,
			categoryQuery,
			categoryOpen: activeReviewCategoryItemId === item.id
		};
	}

	function setReviewSelection(itemId, patch) {
		reviewSelections = {
			...reviewSelections,
			[itemId]: {
				...(reviewSelections[itemId] ?? {}),
				...patch
			}
		};
	}

	function getReviewCategoryOptions(item, query = '') {
		const sourceAccounts = [
			...(item.amount_cents >= 0 ? incomeAccounts : expenseAccounts),
			...cashAccounts
		].filter(
			(account, index, list) => list.findIndex((candidate) => candidate.id === account.id) === index
		);
		const normalized = query.trim().toLowerCase();
		if (!normalized) return sourceAccounts;
		return sourceAccounts.filter((account) => {
			const haystack =
				`${account.code} ${account.name} ${account.display_group || ''}`.toLowerCase();
			return haystack.includes(normalized);
		});
	}

	function selectReviewCategory(itemId, account) {
		activeReviewCategoryItemId = '';
		setReviewSelection(itemId, {
			categoryAccountId: account.id,
			categoryQuery: accountLabel(account)
		});
	}

	function updateReviewCategoryQuery(itemId, amountCents, query) {
		const normalized = query.trim();
		const matches = getReviewCategoryOptions({ amount_cents: amountCents }, query);
		activeReviewCategoryItemId = itemId;
		setReviewSelection(itemId, {
			categoryQuery: query,
			// Clear selection when query is empty; auto-select only on exact single match
			categoryAccountId: !normalized
				? ''
				: matches.length === 1
					? matches[0].id
					: reviewSelections[itemId]?.categoryAccountId
		});
	}

	function startTransactionFiltering() {
		transactionViewMode = 'filtered';
	}

	function startTransactionEdit(entry) {
		transactionViewMode = 'filtered';
		editingTransactionId = entry.id;
		editingTransactionDraft = {
			entryDate: entry.entry_date || '',
			description: entry.description || '',
			memo: entry.memo || '',
			lineAccounts: (entry.lines ?? []).map((line) => ({
				lineId: line.id,
				accountId: line.account_id || '',
				query: line.account ? accountLabel(line.account) : ''
			}))
		};
	}

	function stopTransactionEdit() {
		editingTransactionId = '';
		editingTransactionDraft = {
			entryDate: '',
			description: '',
			memo: '',
			lineAccounts: []
		};
	}

	function updateTransactionLineAccount(lineId, accountId, query = '') {
		editingTransactionDraft = {
			...editingTransactionDraft,
			lineAccounts: (editingTransactionDraft.lineAccounts ?? []).map((line) =>
				line.lineId === lineId ? { ...line, accountId, query } : line
			)
		};
	}

	function updateTransactionLineAccountQuery(lineId, query) {
		editingTransactionDraft = {
			...editingTransactionDraft,
			lineAccounts: (editingTransactionDraft.lineAccounts ?? []).map((line) =>
				line.lineId === lineId ? { ...line, query } : line
			)
		};
	}

	function getEditingTransactionLine(lineId) {
		return (
			(editingTransactionDraft.lineAccounts ?? []).find((line) => line.lineId === lineId) ?? null
		);
	}

	function isSavingTransaction(entryId) {
		return Boolean(savingTransactionIds[entryId]);
	}

	function setSavingTransaction(entryId, value) {
		savingTransactionIds = {
			...savingTransactionIds,
			[entryId]: value
		};
	}

	function enhanceTransactionEdit(entryId) {
		return () => {
			setSavingTransaction(entryId, true);
			return async ({ result, update }) => {
				try {
					if (typeof update === 'function') {
						await update({ reset: false, invalidateAll: false });
					}
					if (result?.type === 'success') {
						stopTransactionEdit();
						await invalidateAll();
					}
				} finally {
					setSavingTransaction(entryId, false);
				}
			};
		};
	}

	function groupBankReviewItems(items) {
		const grouped = new Map();
		for (const item of items) {
			const selection = getReviewSelection(item);
			const account = accounts.find((candidate) => candidate.id === selection.accountId);
			const key = selection.accountId || '__unassigned__';
			if (!grouped.has(key)) {
				grouped.set(key, {
					accountId: selection.accountId,
					account,
					items: []
				});
			}
			grouped.get(key).items.push(item);
		}
		return Array.from(grouped.values()).sort((left, right) => {
			const leftIndex = mappedBankFeedAccounts.findIndex(
				(account) => account.account_id === left.accountId
			);
			const rightIndex = mappedBankFeedAccounts.findIndex(
				(account) => account.account_id === right.accountId
			);
			if (leftIndex === rightIndex)
				return String(left.accountId).localeCompare(String(right.accountId));
			if (leftIndex === -1) return 1;
			if (rightIndex === -1) return -1;
			return leftIndex - rightIndex;
		});
	}

	function isPostingFeedItem(feedItemId) {
		return Boolean(postingFeedItemIds[feedItemId]);
	}

	function setPostingFeedItem(feedItemId, value) {
		postingFeedItemIds = {
			...postingFeedItemIds,
			[feedItemId]: value
		};
	}

	const bankReviewGroups = $derived(groupBankReviewItems(needsReview));

	function enhancePostFeedItem(feedItemId) {
		return () => {
			setPostingFeedItem(feedItemId, true);
			return async ({ result, update }) => {
				try {
					await update({ reset: false, invalidateAll: false });
					if (result.type === 'success') {
						await invalidateAll();
					}
				} finally {
					setPostingFeedItem(feedItemId, false);
				}
			};
		};
	}

	function enhanceInlineAccount() {
		return async ({ result, update }) => {
			await update({ reset: false, invalidateAll: false });
			if (result.type === 'success') {
				await invalidateAll();
			}
		};
	}

	async function startGroupEdit(kind, displayGroup) {
		editingGroupKey = groupKey(kind, displayGroup);
		editingGroupValue = displayGroup;
		await tick();
		groupLabelInput?.focus?.();
	}

	function stopGroupEdit() {
		editingGroupKey = '';
		editingGroupValue = '';
	}

	function enhanceGroupEdit() {
		return async ({ result, update }) => {
			await update({ reset: false, invalidateAll: false });
			if (result.type === 'success') {
				stopGroupEdit();
				await invalidateAll();
			}
		};
	}

	function enhanceSaveConnections() {
		return async ({ result, update }) => {
			await update({ reset: false, invalidateAll: false });
			if (result.type === 'success') {
				mercuryEditMode = false;
				await invalidateAll();
			}
		};
	}

	function enhanceSyncAll() {
		syncAllBusy = true;
		return async ({ result, update }) => {
			try {
				await update({ reset: false, invalidateAll: false });
				if (result.type === 'success') {
					await invalidateAll();
				}
			} finally {
				syncAllBusy = false;
			}
		};
	}

	$effect(() => {
		if (!mercuryConnected) mercuryEditMode = true;
	});

	$effect(() => {
		if (!bankFeedAccounts.length || !needsReview.length) return;
		let nextSelections = reviewSelections;
		let didChange = false;
		for (const item of needsReview) {
			if (Object.hasOwn(nextSelections, item.id)) continue;
			const categoryAccount = accounts.find((account) => account.id === item.suggested_account_id);
			nextSelections = {
				...nextSelections,
				[item.id]: {
					accountId: bankFeedAccounts[0]?.account_id || '',
					categoryAccountId:
						item.suggested_account_id ||
						(item.amount_cents >= 0 ? incomeAccounts[0]?.id : expenseAccounts[0]?.id) ||
						'',
					categoryQuery: categoryAccount ? accountLabel(categoryAccount) : ''
				}
			};
			didChange = true;
		}
		if (didChange) {
			reviewSelections = nextSelections;
		}
	});

	$effect(() => {
		if (!csvImportAccountId && cashAccounts.length) {
			csvImportAccountId = cashAccounts[0]?.id || '';
			return;
		}
		if (csvImportAccountId && !cashAccounts.some((account) => account.id === csvImportAccountId)) {
			csvImportAccountId = cashAccounts[0]?.id || '';
		}
	});

	$effect(() => {
		const signature = `${data.report_period_key ?? 'this_year'}|${data.report_from ?? ''}|${data.report_to ?? ''}`;
		if (signature === reportSyncSignature) return;
		reportSyncSignature = signature;
		reportPeriodKey = data.report_period_key ?? 'this_year';
		reportFrom = data.report_from ?? '';
		reportTo = data.report_to ?? '';
		if (data.report_filter_active) setActiveTab('reports', { replaceState: true });
	});

	function reportExportHref(format, type) {
		const params = new URLSearchParams();
		params.set('period', reportPeriodKey);
		if (reportPeriodKey === 'custom') {
			if (reportFrom) params.set('from', reportFrom);
			if (reportTo) params.set('to', reportTo);
		}
		if (type) {
			params.set('type', type);
		}
		return `/api/groups/${encodeURIComponent(data.group?.slug)}/accounting/export/report.${format}?${params.toString()}`;
	}

	function printReport(type) {
		const isPL = type === 'pl';
		const reportTitle = isPL ? 'Profit & Loss Statement' : 'Balance Sheet';
		const groupName = data.group?.name || 'Organization';
		const periodStr =
			report.from && report.to
				? `${formatDate(report.from)} – ${formatDate(report.to)}`
				: reportPeriodLabel;

		let sectionsHtml = '';

		if (isPL) {
			const incomeRows =
				report.income
					.map(
						(acc) => `
				<tr>
					<td class="code-name">${acc.code} &middot; ${acc.name}</td>
					<td class="amount positive">${formatCents(acc.period_balance_cents)}</td>
				</tr>
			`
					)
					.join('') || `<tr><td colspan="2" class="empty">No income recorded.</td></tr>`;

			const expenseRows =
				report.expenses
					.map(
						(acc) => `
				<tr>
					<td class="code-name">${acc.code} &middot; ${acc.name}</td>
					<td class="amount negative">${formatCents(acc.period_balance_cents)}</td>
				</tr>
			`
					)
					.join('') || `<tr><td colspan="2" class="empty">No expenses recorded.</td></tr>`;

			sectionsHtml = `
				<div class="section">
					<div class="section-header">
						<span>Money In</span>
						<span class="total">${formatCents(report.totals?.income_cents)}</span>
					</div>
					<table>
						<tbody>
							${incomeRows}
						</tbody>
					</table>
				</div>

				<div class="section">
					<div class="section-header">
						<span>Money Out</span>
						<span class="total">${formatCents(report.totals?.expense_cents)}</span>
					</div>
					<table>
						<tbody>
							${expenseRows}
						</tbody>
					</table>
				</div>

				<div class="grand-total-row">
					<span>Net Activity</span>
					<span class="${(report.totals?.net_cents ?? 0) >= 0 ? 'positive' : 'negative'}">
						${formatCents(report.totals?.net_cents)}
					</span>
				</div>
			`;
		} else {
			const assetRows =
				report.assets
					.map(
						(acc) => `
				<tr>
					<td class="code-name">${acc.code} &middot; ${acc.name}</td>
					<td class="amount">${formatCents(acc.balance_cents)}</td>
				</tr>
			`
					)
					.join('') || `<tr><td colspan="2" class="empty">No assets recorded.</td></tr>`;

			const liabilityRows =
				report.liabilities
					.map(
						(acc) => `
				<tr>
					<td class="code-name">${acc.code} &middot; ${acc.name}</td>
					<td class="amount negative">${formatCents(acc.balance_cents)}</td>
				</tr>
			`
					)
					.join('') || `<tr><td colspan="2" class="empty">No liabilities recorded.</td></tr>`;

			const netPosition =
				(report.totals?.assets_cents || 0) - (report.totals?.liabilities_cents || 0);

			sectionsHtml = `
				<div class="section">
					<div class="section-header">
						<span>What We Have (Assets)</span>
						<span class="total">${formatCents(report.totals?.assets_cents)}</span>
					</div>
					<table>
						<tbody>
							${assetRows}
						</tbody>
					</table>
				</div>

				<div class="section">
					<div class="section-header">
						<span>What We Owe (Liabilities)</span>
						<span class="total">${formatCents(report.totals?.liabilities_cents)}</span>
					</div>
					<table>
						<tbody>
							${liabilityRows}
						</tbody>
					</table>
				</div>

				<div class="grand-total-row">
					<span>Net Position</span>
					<span class="${netPosition >= 0 ? 'positive' : 'negative'}">
						${formatCents(netPosition)}
					</span>
				</div>
			`;
		}

		const html = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>\${groupName} - \${reportTitle}</title>
				<style>
					@page {
						size: letter;
						margin: 1in;
					}
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
						color: #1e293b;
						margin: 0;
						padding: 40px;
						line-height: 1.5;
					}
					.header {
						border-bottom: 2px solid #e2e8f0;
						padding-bottom: 20px;
						margin-bottom: 30px;
					}
					.org-name {
						font-size: 14px;
						font-weight: 600;
						text-transform: uppercase;
						letter-spacing: 0.1em;
						color: #64748b;
						margin-bottom: 4px;
					}
					.report-title {
						font-size: 28px;
						font-weight: 800;
						color: #0f172a;
						margin: 0 0 8px 0;
					}
					.period {
						font-size: 14px;
						color: #475569;
						font-weight: 500;
					}
					.section {
						margin-bottom: 30px;
						page-break-inside: avoid;
					}
					.section-header {
						display: flex;
						justify-content: space-between;
						align-items: baseline;
						border-bottom: 1.5px solid #cbd5e1;
						padding-bottom: 6px;
						margin-bottom: 10px;
						font-weight: 700;
						font-size: 15px;
						color: #334155;
						text-transform: uppercase;
						letter-spacing: 0.05em;
					}
					.section-header .total {
						font-size: 16px;
						font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
					}
					table {
						width: 100%;
						border-collapse: collapse;
					}
					td {
						padding: 8px 0;
						border-bottom: 1px dashed #e2e8f0;
						font-size: 14px;
					}
					tr:last-child td {
						border-bottom: none;
					}
					.code-name {
						color: #475569;
					}
					.amount {
						text-align: right;
						font-weight: 500;
						font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
					}
					.empty {
						color: #94a3b8;
						font-style: italic;
						padding: 12px 0;
					}
					.positive {
						color: #15803d;
					}
					.negative {
						color: #b91c1c;
					}
					.grand-total-row {
						display: flex;
						justify-content: space-between;
						align-items: center;
						border-top: 2.5px double #cbd5e1;
						border-bottom: 2.5px double #cbd5e1;
						padding: 12px 0;
						margin-top: 40px;
						font-weight: 800;
						font-size: 18px;
						color: #0f172a;
						page-break-inside: avoid;
					}
					.grand-total-row span:last-child {
						font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
					}
					@media print {
						body {
							padding: 0;
							font-size: 12pt;
						}
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<div class="org-name">\${groupName}</div>
						<h1 class="report-title">\${reportTitle}</h1>
						<div class="period">\${reportPeriodLabel} &middot; \${periodStr}</div>
					</div>

					\${sectionsHtml}
				</div>
				<script>
					window.onload = function() {
						window.print();
					};
				</scr${'ipt'}>
			</body>
			</html>
		`;

		const printWindow = window.open('', '_blank');
		if (printWindow) {
			printWindow.document.write(html);
			printWindow.document.close();
		}
	}

	async function applyReportFilters(nextPeriod = reportPeriodKey) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('tab', 'reports');
		url.searchParams.set('period', nextPeriod);
		if (nextPeriod === 'custom') {
			url.searchParams.set('from', reportFrom);
			url.searchParams.set('to', reportTo);
		} else {
			url.searchParams.delete('from');
			url.searchParams.delete('to');
		}
		activeTab = 'reports';
		await goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
	}

	function updateAccountGroupZone(kind, displayGroup, items) {
		accountGroups = {
			...accountGroups,
			[kind]: (accountGroups[kind] ?? []).map((group) =>
				group.displayGroup === displayGroup ? { ...group, accounts: items } : group
			)
		};
	}

	function handleAccountConsider(kind, displayGroup, event) {
		updateAccountGroupZone(kind, displayGroup, event.detail.items);
	}

	async function handleAccountFinalize(kind, displayGroup, event) {
		const items = event.detail.items ?? [];
		updateAccountGroupZone(kind, displayGroup, items);
		const movedItems = items.filter((item) => item.display_group !== displayGroup);
		if (!movedItems.length) return;
		await tick();
		for (const item of movedItems) {
			document.querySelector(`form[data-account-id="${CSS.escape(item.id)}"]`)?.requestSubmit();
		}
	}

	async function connectFinancialAccounts() {
		financialConnectionsBusy = true;
		financialConnectionsMessage = '';
		try {
			const sessionResponse = await fetch(
				`/api/groups/${encodeURIComponent(data.group?.slug)}/accounting/stripe-financial-connections/session`,
				{ method: 'POST' }
			);
			const sessionPayload = await sessionResponse.json().catch(() => ({}));
			if (!sessionResponse.ok) {
				throw new Error(sessionPayload.error || 'Unable to start bank linking.');
			}
			const stripe = await loadStripe(sessionPayload.publishableKey);
			if (!stripe) throw new Error('Unable to load Stripe.');
			const result = await stripe.collectFinancialConnectionsAccounts({
				clientSecret: sessionPayload.clientSecret
			});
			if (result.error) throw new Error(result.error.message || 'Bank linking was cancelled.');
			const completeResponse = await fetch(
				`/api/groups/${encodeURIComponent(data.group?.slug)}/accounting/stripe-financial-connections/complete`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						session_id: result.financialConnectionsSession?.id || sessionPayload.sessionId
					})
				}
			);
			const completePayload = await completeResponse.json().catch(() => ({}));
			if (!completeResponse.ok) {
				throw new Error(completePayload.error || 'Unable to finish bank linking.');
			}
			financialConnectionsMessage = 'Bank accounts linked. Refreshing activity...';
			await invalidateAll();
		} catch (error) {
			financialConnectionsMessage = error?.message || 'Unable to link bank accounts.';
		} finally {
			financialConnectionsBusy = false;
		}
	}

	const journalJson = $derived(JSON.stringify(journalLines));
	const journalDebitTotal = $derived(
		journalLines.reduce((sum, line) => sum + Math.round(Number(line.debit || 0) * 100), 0)
	);
	const journalCreditTotal = $derived(
		journalLines.reduce((sum, line) => sum + Math.round(Number(line.credit || 0) * 100), 0)
	);
	const today = new Date().toISOString().slice(0, 10);
	const selectedYear = $derived(data.year || new Date().getFullYear());
	const yearStart = $derived(`${selectedYear}-01-01`);
	const yearEnd = $derived(`${selectedYear}-12-31`);
</script>

<svelte:head>
	<title>Accounting | {data.group?.name ?? 'Group'}</title>
</svelte:head>

<div class="space-y-6 pb-8">
	{#if form?.accounting_error || data.accounting_error}
		<div
			class="card border-error-500/30 bg-error-500/10 text-error-700-300 rounded-xl p-4 text-sm font-semibold"
		>
			{form?.accounting_error || data.accounting_error}
		</div>
	{:else if form?.accounting_success}
		<div
			class="card border-success-500/30 bg-success-500/10 text-success-700-300 rounded-xl p-4 text-sm font-semibold"
		>
			Saved successfully.
		</div>
	{/if}

	<!-- Metric Cards Grid -->
	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Cash on Hand -->
		<div
			class="card preset-tonal-surface border-surface-500/10 border p-5 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="space-y-1">
					<p class="text-surface-700-300 text-xs font-semibold tracking-wider uppercase">
						Cash on hand
					</p>
					<p class="text-2xl font-bold tracking-tight">
						{formatCents(report.totals?.assets_cents - report.totals?.liabilities_cents)}
					</p>
				</div>
				<div
					class="bg-primary-500/10 text-primary-500 dark:bg-primary-500/20 shrink-0 rounded-xl p-3"
				>
					<IconBanknote class="h-6 w-6" />
				</div>
			</div>
		</div>
		<!-- Money In -->
		<div
			class="card preset-tonal-surface border-surface-500/10 border p-5 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="space-y-1">
					<p class="text-surface-700-300 text-xs font-semibold tracking-wider uppercase">
						Money in
					</p>
					<p class="text-success-700-300 text-2xl font-bold tracking-tight">
						{formatCents(report.totals?.income_cents)}
					</p>
				</div>
				<div
					class="bg-success-500/10 text-success-500 dark:bg-success-500/20 shrink-0 rounded-xl p-3"
				>
					<IconArrowDownLeft class="h-6 w-6" />
				</div>
			</div>
		</div>
		<!-- Money Out -->
		<div
			class="card preset-tonal-surface border-surface-500/10 border p-5 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="space-y-1">
					<p class="text-surface-700-300 text-xs font-semibold tracking-wider uppercase">
						Money out
					</p>
					<p class="text-warning-700-300 text-2xl font-bold tracking-tight">
						{formatCents(report.totals?.expense_cents)}
					</p>
				</div>
				<div
					class="bg-warning-500/10 text-warning-500 dark:bg-warning-500/20 shrink-0 rounded-xl p-3"
				>
					<IconArrowUpRight class="h-6 w-6" />
				</div>
			</div>
		</div>
		<!-- Net This Year -->
		<div
			class="card preset-tonal-surface border-surface-500/10 border p-5 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="space-y-1">
					<p class="text-surface-700-300 text-xs font-semibold tracking-wider uppercase">
						Net this year
					</p>
					<p
						class="text-2xl font-bold tracking-tight {report.totals?.net_cents >= 0
							? 'text-secondary-700-300'
							: 'text-error-700-300'}"
					>
						{formatCents(report.totals?.net_cents)}
					</p>
				</div>
				<div
					class="bg-secondary-500/10 text-secondary-500 dark:bg-secondary-500/20 shrink-0 rounded-xl p-3"
				>
					<IconScale class="h-6 w-6" />
				</div>
			</div>
		</div>
	</section>

	<!-- Tabs Navigation Container -->
	<div
		class="card preset-tonal-surface scrollbar-none border-surface-500/10 flex gap-1.5 overflow-x-auto rounded-xl border p-1.5 shadow-sm"
	>
		{#each tabs as tab}
			{@const Icon = tab.icon}
			<button
				type="button"
				class="btn btn-sm flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 font-semibold tracking-wide transition-all {activeTab ===
				tab.id
					? 'preset-filled-primary-500 shadow-sm'
					: 'text-surface-700-300 hover:bg-surface-500/10'}"
				onclick={() => setActiveTab(tab.id)}
			>
				<Icon class="h-4 w-4" />
				<span>{tab.label}</span>
			</button>
		{/each}
	</div>

	<!-- Tab Panels -->
	{#if activeTab === 'overview'}
		<section class="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
			<!-- Monthly Stats -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
				<div class="border-surface-500/10 flex items-center justify-between border-b pb-3">
					<div class="flex items-center gap-2">
						<IconChartColumn class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">
							Monthly Performance
						</h2>
					</div>
					<span class="badge preset-outlined-surface-500 font-semibold">{data.year}</span>
				</div>

				<div class="space-y-2">
					{#if report.monthly.length > 0}
						<div
							class="text-surface-700-300 grid grid-cols-[minmax(80px,1.2fr)_1fr_1fr_1fr] gap-3 px-4 pb-1 text-xs font-bold tracking-wider uppercase"
						>
							<div>Month</div>
							<div class="text-success-700-300">Income</div>
							<div class="text-warning-700-300">Expenses</div>
							<div class="text-right">Net</div>
						</div>
					{/if}

					{#each report.monthly as month}
						<div
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 grid grid-cols-[minmax(80px,1.2fr)_1fr_1fr_1fr] items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-colors duration-150"
						>
							<div class="text-surface-900-100 font-semibold">
								{monthLabel(month.month)}
							</div>
							<div class="text-success-700-300">
								{formatCents(month.income_cents)}
							</div>
							<div class="text-warning-700-300">
								{formatCents(month.expense_cents)}
							</div>
							<div
								class="text-right font-bold {month.net_cents >= 0
									? 'text-surface-900-100'
									: 'text-error-700-300'}"
							>
								{formatCents(month.net_cents)}
							</div>
						</div>
					{:else}
						<div
							class="flex flex-col items-center justify-center p-8 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
						>
							<IconChartColumn class="h-8 w-8 text-surface-400 mb-2 opacity-50" />
							<p class="text-sm font-medium text-surface-500">No activity recorded yet.</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Action Center -->
			<div class="space-y-6">
				<!-- Needs Review -->
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
					<div class="border-surface-500/10 flex items-center justify-between border-b pb-3">
						<div class="flex items-center gap-2">
							<IconListChecks class="text-warning-500 h-5 w-5" />
							<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Needs Review</h2>
						</div>
						<span
							class="badge {needsReview.length > 0
								? 'preset-filled-warning-500 animate-pulse'
								: 'preset-tonal-success'} font-bold"
						>
							{needsReview.length}
						</span>
					</div>

					{#if needsReview.length > 0}
						<p class="text-surface-700-300 text-sm leading-relaxed">
							You have <span class="text-warning-700-300 font-semibold">{needsReview.length}</span> imported
							bank transactions that need to be categorized.
						</p>
						<button
							class="btn btn-sm preset-filled-warning-500 flex w-full items-center justify-center gap-2 font-bold"
							type="button"
							onclick={() => setActiveTab('banking')}
						>
							<IconListChecks class="h-4 w-4" />
							<span>Review Transactions</span>
						</button>
					{:else}
						<div class="flex flex-col items-center justify-center py-4 text-center">
							<div class="bg-success-500/10 text-success-500 mb-2 rounded-full p-3">
								<IconCheckCircle2 class="h-6 w-6" />
							</div>
							<p class="text-success-700-300 text-sm font-semibold">All caught up!</p>
							<p class="text-surface-500 mt-1 text-xs">No transaction items need review.</p>
						</div>
					{/if}
				</div>

				<!-- Recent Activity -->
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
					<div class="border-surface-500/10 flex items-center justify-between border-b pb-3">
						<div class="flex items-center gap-2">
							<IconReceipt class="text-secondary-500 h-5 w-5" />
							<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Recent Activity</h2>
						</div>
					</div>

					<div class="space-y-2">
						{#each recentEntries.slice(0, 6) as entry}
							<form
								method="POST"
								use:enhance
								action="?/voidEntry"
								class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-sm transition-all duration-150"
							>
								<input type="hidden" name="entryId" value={entry.id} />
								<input type="hidden" name="reason" value="Voided from dashboard" />
								<div class="min-w-0 space-y-1">
									<p class="text-surface-900-100 truncate font-semibold">
										{entry.description}
									</p>
									<div class="text-surface-500 flex flex-wrap items-center gap-2 text-xs">
										<span>{formatDate(entry.entry_date)}</span>
										<span class="opacity-30">•</span>
										<span
											class="badge preset-outlined-surface-500 px-1.5 py-0 text-[10px] font-medium uppercase"
											>{entry.entry_type}</span
										>
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<span class="text-surface-900-100 font-bold tabular-nums"
										>{formatCents(entry.amount_cents)}</span
									>
									{#if entry.status !== 'void' && !entry.locked_at}
										<button
											class="btn btn-sm preset-tonal-error px-2.5 py-1 text-xs font-medium"
											type="submit">Void</button
										>
									{/if}
								</div>
							</form>
						{:else}
							<div
								class="flex flex-col items-center justify-center p-6 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
							>
								<IconBanknote class="h-8 w-8 text-surface-400 mb-2 opacity-50" />
								<p class="text-sm text-surface-500 font-medium">No activity recorded yet.</p>
								<button
									class="btn btn-xs preset-filled-primary-500 mt-3"
									type="button"
									onclick={() => setActiveTab('enter')}
								>
									Add Balance or Entry
								</button>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>
	{/if}

	{#if activeTab === 'enter'}
		<section class="grid gap-6 lg:grid-cols-3">
			<!-- Record Money Form -->
			<form
				method="POST"
				use:enhance
				action="?/recordMoney"
				enctype="multipart/form-data"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm lg:col-span-2"
			>
				<div
					class="border-surface-500/10 flex flex-wrap items-center justify-between gap-4 border-b pb-4"
				>
					<div class="flex items-center gap-2">
						<IconPlus class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Record Money</h2>
					</div>

					<!-- Segmented selector -->
					<div class="card bg-surface-500/10 flex gap-1 rounded-lg p-1">
						<button
							type="button"
							class="btn btn-xs rounded px-3 py-1.5 font-semibold transition-all {moneyFlow ===
							'income'
								? 'preset-filled-success-500 text-white shadow-sm'
								: 'text-surface-700-300'}"
							onclick={() => (moneyFlow = 'income')}
						>
							Money in
						</button>
						<button
							type="button"
							class="btn btn-xs rounded px-3 py-1.5 font-semibold transition-all {moneyFlow ===
							'expense'
								? 'preset-filled-warning-500 text-white shadow-sm'
								: 'text-surface-700-300'}"
							onclick={() => (moneyFlow = 'expense')}
						>
							Money out
						</button>
					</div>
				</div>

				<input type="hidden" name="flow" value={moneyFlow} />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Date</span>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="entryDate"
							value={today}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Amount</span>
						<div class="relative">
							<span
								class="text-surface-500 absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold"
								>$</span
							>
							<input
								class="input preset-tonal-surface pl-7"
								type="number"
								step="0.01"
								min="0.01"
								name="amount"
								placeholder="0.00"
								required
							/>
						</div>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold"
							>{moneyFlow === 'income' ? 'Where did it land?' : 'Where did it come from?'}</span
						>
						<select class="select preset-tonal-surface" name="cashAccountId" required>
							{#each cashAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Category</span>
						<select class="select preset-tonal-surface" name="categoryAccountId" required>
							{#each currentCategories as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-700-300 text-xs font-semibold">Description</span>
						<input
							class="input preset-tonal-surface"
							name="description"
							placeholder="Bike valet supplies, member dues, grant deposit"
							required
						/>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-700-300 text-xs font-semibold">Note</span>
						<textarea
							class="textarea preset-tonal-surface"
							name="memo"
							rows="2"
							placeholder="Add custom memo or notes..."
						></textarea>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-700-300 text-xs font-semibold">Receipt</span>
						<input
							class="input preset-tonal-surface file:bg-surface-500/10 file:text-surface-700 hover:file:bg-surface-500/20 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-xs file:font-semibold"
							type="file"
							name="receipt"
							accept="image/*,.pdf,.txt,.csv"
						/>
					</label>
				</div>

				<button
					class="btn preset-filled-primary-500 mt-2 flex w-full items-center justify-center gap-2 font-bold sm:w-auto"
					type="submit"
				>
					<IconReceipt class="h-4 w-4" />
					<span>Save Activity</span>
				</button>
			</form>

			<!-- Stacked sidebar forms -->
			<div class="space-y-6">
				<!-- Move Money -->
				<form
					method="POST"
					use:enhance
					action="?/transfer"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconArrowRightLeft class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Move Money</h2>
					</div>
					<div class="space-y-4">
						<input type="hidden" name="entryDate" value={today} />
						<label class="label">
							<span class="text-surface-700-300 text-xs font-semibold">From</span>
							<select class="select preset-tonal-surface" name="fromAccountId">
								{#each cashAccounts as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-700-300 text-xs font-semibold">To</span>
							<select class="select preset-tonal-surface" name="toAccountId">
								{#each cashAccounts as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-700-300 text-xs font-semibold">Amount</span>
							<div class="relative">
								<span
									class="text-surface-500 absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold"
									>$</span
								>
								<input
									class="input preset-tonal-surface pl-7"
									type="number"
									step="0.01"
									min="0.01"
									name="amount"
									placeholder="0.00"
									required
								/>
							</div>
						</label>
						<input type="hidden" name="description" value="Transfer" />
						<button
							class="btn preset-outlined-primary-500 flex w-full items-center justify-center gap-2 font-bold"
							type="submit"
						>
							<IconArrowRightLeft class="h-4 w-4" />
							<span>Record Transfer</span>
						</button>
					</div>
				</form>

				<!-- Starting Balance -->
				<form
					method="POST"
					use:enhance
					action="?/openingBalance"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconBanknote class="text-secondary-500 h-5 w-5" />
						<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Starting Balance</h2>
					</div>
					<div class="space-y-4">
						<input type="hidden" name="entryDate" value={today} />
						<label class="label">
							<span class="text-surface-700-300 text-xs font-semibold">Account</span>
							<select class="select preset-tonal-surface" name="accountId">
								{#each cashAccounts.filter((account) => account.kind === 'asset') as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-700-300 text-xs font-semibold">Amount</span>
							<div class="relative">
								<span
									class="text-surface-500 absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold"
									>$</span
								>
								<input
									class="input preset-tonal-surface pl-7"
									type="number"
									step="0.01"
									min="0.01"
									name="amount"
									placeholder="0.00"
									required
								/>
							</div>
						</label>
						<button class="btn preset-outlined-surface-500 w-full font-semibold" type="submit">
							Save Starting Balance
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	{#if activeTab === 'accounts'}
		<section class="grid gap-6 lg:grid-cols-[1fr_360px]">
			<!-- Buckets & Categories list -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconWalletCards class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">
						Buckets & Categories
					</h2>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					{#each accountKinds as kind}
						<div class="bg-surface-500/5 border-surface-500/5 space-y-4 rounded-2xl border p-4">
							<h3 class="text-surface-700-300 text-xs font-bold tracking-wider uppercase">
								{kind === 'asset'
									? '💼 Where money lives (Assets)'
									: kind === 'income'
										? '📥 Money in (Income)'
										: kind === 'expense'
											? '📤 Money out (Expense)'
											: kind === 'liability'
												? '💸 What we owe (Liability)'
												: '📈 Group balance (Equity)'}
							</h3>
							<div class="space-y-4">
								{#each accountGroups[kind] ?? [] as group (groupKey(kind, group.displayGroup))}
									{@const groupKeyValue = groupKey(kind, group.displayGroup)}
									{@const isEditingGroup = editingGroupKey === groupKeyValue}
									<div class="space-y-3">
										<div class="flex items-center justify-between gap-3">
											{#if isEditingGroup}
												<form
													method="POST"
													action="?/updateAccountGroup"
													use:enhance={enhanceGroupEdit}
													class="flex min-w-0 flex-1 items-center gap-2"
												>
													<input type="hidden" name="kind" value={kind} />
													<input
														type="hidden"
														name="currentDisplayGroup"
														value={group.displayGroup}
													/>
													<input
														class="input preset-tonal-surface min-w-0 flex-1"
														name="displayGroup"
														value={editingGroupValue}
														bind:this={groupLabelInput}
														oninput={(event) => (editingGroupValue = event.currentTarget.value)}
														onblur={requestInlineSave}
														onkeydown={(event) => {
															if (event.key === 'Escape') {
																event.preventDefault();
																stopGroupEdit();
															}
														}}
													/>
												</form>
											{:else}
												<div class="flex min-w-0 items-center gap-2">
													<div class="text-surface-900-100 min-w-0 truncate text-sm font-bold">
														{group.displayGroup}
													</div>
													<button
														class="text-surface-500 hover:text-surface-900-100 shrink-0"
														type="button"
														onclick={() => startGroupEdit(kind, group.displayGroup)}
														aria-label={`Edit ${group.displayGroup} label`}
														title="Edit label"
													>
														<IconPencil class="h-3.5 w-3.5" />
													</button>
												</div>
											{/if}
											<span class="badge preset-tonal-surface text-xs font-semibold">
												{group.accounts.length} subaccount{group.accounts.length === 1 ? '' : 's'}
											</span>
										</div>
										<div
											use:dragHandleZone={{
												items: group.accounts,
												flipDurationMs: 180,
												type: `account-${kind}`
											}}
											onconsider={(event) => handleAccountConsider(kind, group.displayGroup, event)}
											onfinalize={(event) => handleAccountFinalize(kind, group.displayGroup, event)}
											aria-label={`${group.displayGroup} accounts`}
											class="space-y-2"
										>
											{#each group.accounts as account (account.id)}
												<form
													method="POST"
													action="?/updateAccount"
													use:enhance={enhanceInlineAccount}
													data-account-id={account.id}
													class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 grid gap-2 rounded-xl border p-3 transition-colors md:grid-cols-[minmax(0,1fr)_140px_auto]"
												>
													<input type="hidden" name="accountId" value={account.id} />
													<input type="hidden" name="displayGroup" value={group.displayGroup} />
													<input
														class="input preset-tonal-surface"
														type="text"
														name="name"
														value={account.name}
														onchange={requestInlineSave}
														autocomplete="off"
														spellcheck="false"
														aria-label="Account name"
														title="Account name"
													/>
													<input
														class="input preset-tonal-surface font-mono"
														type="text"
														name="code"
														value={account.code}
														onchange={requestInlineSave}
														autocomplete="off"
														spellcheck="false"
														aria-label="Account number"
														title="Account number"
													/>
													<button
														class="text-surface-500 hover:text-surface-900-100 flex items-center justify-center rounded-lg border border-dashed border-transparent px-2"
														type="button"
														use:dragHandle
														aria-label={`Drag ${account.name} to another label group`}
														title="Drag to another group"
													>
														<IconGripVertical class="h-4 w-4" />
													</button>
												</form>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Add Bucket Form -->
			<form
				method="POST"
				use:enhance
				action="?/createAccount"
				class="card preset-tonal-surface border-surface-500/10 h-fit space-y-4 border p-5 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconPlus class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Add Bucket</h2>
				</div>
				<div class="space-y-4">
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Name</span>
						<input
							class="input preset-tonal-surface"
							name="name"
							placeholder="e.g. Stripe Account, General Fund"
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Code</span>
						<input
							class="input preset-tonal-surface"
							name="code"
							placeholder="e.g. 1000, 5010"
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Type</span>
						<select class="select preset-tonal-surface" name="kind">
							<option value="expense">Money out (Expense)</option>
							<option value="income">Money in (Income)</option>
							<option value="asset">Where money lives (Asset)</option>
							<option value="liability">What we owe (Liability)</option>
							<option value="equity">Group balance (Equity)</option>
						</select>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Label group</span>
						<input
							class="input preset-tonal-surface"
							name="displayGroup"
							placeholder="e.g. Operating Expenses"
						/>
					</label>
					<button class="btn preset-filled-primary-500 mt-2 w-full font-bold" type="submit"
						>Add Bucket</button
					>
				</div>
			</form>
		</section>
	{/if}

	{#if activeTab === 'budgets'}
		<section class="grid gap-6 lg:grid-cols-[360px_1fr]">
			<!-- Set Budget Form -->
			<form
				method="POST"
				use:enhance
				action="?/updateBudget"
				class="card preset-tonal-surface border-surface-500/10 h-fit space-y-4 border p-5 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconBadgeDollarSign class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Set Budget</h2>
				</div>
				<div class="space-y-4">
					<input type="hidden" name="year" value={data.year} />
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Category</span>
						<select class="select preset-tonal-surface" name="accountId">
							{#each budgetAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Annual amount</span>
						<div class="relative">
							<span
								class="text-surface-500 absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold"
								>$</span
							>
							<input
								class="input preset-tonal-surface pl-7"
								type="number"
								step="0.01"
								min="0"
								name="amount"
								placeholder="0.00"
								required
							/>
						</div>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Notes</span>
						<textarea
							class="textarea preset-tonal-surface"
							name="notes"
							rows="3"
							placeholder="Optional details..."
						></textarea>
					</label>
					<button class="btn preset-filled-primary-500 mt-2 w-full font-bold" type="submit"
						>Save Budget</button
					>
				</div>
			</form>

			<!-- Budget vs Actual list -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconChartColumn class="text-secondary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Budget vs Actual</h2>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					{#each data.budgets as budget}
						{@const used =
							budget.amount_cents > 0
								? Math.round((budget.actual_cents / budget.amount_cents) * 100)
								: 0}
						{@const usedBar = Math.min(100, used)}
						{@const colorClass =
							used < 75 ? 'bg-success-500' : used <= 100 ? 'bg-warning-500' : 'bg-error-500'}

						<div class="bg-surface-500/5 border-surface-500/5 space-y-2 rounded-xl border p-4">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 space-y-0.5">
									<span class="text-surface-900-100 block truncate text-sm font-bold"
										>{budget.account?.name}</span
									>
									{#if budget.notes}
										<p class="text-surface-500 truncate text-xs italic">{budget.notes}</p>
									{/if}
								</div>
								<span
									class="badge preset-outlined-surface-500 shrink-0 px-2 py-0.5 text-[10px] font-bold"
									>{used}% used</span
								>
							</div>

							<div class="flex items-baseline justify-between pt-1 text-xs font-semibold">
								<span class="text-surface-700 dark:text-surface-300 font-medium"
									>Actual: {formatCents(budget.actual_cents)}</span
								>
								<span class="text-surface-500">Limit: {formatCents(budget.amount_cents)}</span>
							</div>

							<div class="bg-surface-500/20 mt-1.5 h-2.5 overflow-hidden rounded-full">
								<div
									class="{colorClass} h-full rounded-full transition-all duration-300"
									style="width: {usedBar}%"
								></div>
							</div>
						</div>
					{:else}
						<div
							class="sm:col-span-2 flex flex-col items-center justify-center p-8 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
						>
							<IconBadgeDollarSign class="h-8 w-8 text-surface-400 mb-2 opacity-50" />
							<p class="text-sm text-surface-500 font-medium">No budgets created yet.</p>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	{#if activeTab === 'reports'}
		<!-- Reports toolbar -->
		<div
			class="card preset-tonal-surface border-surface-500/10 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 shadow-sm"
		>
			<!-- Left: title + period badge -->
			<div class="flex min-w-0 items-center gap-3">
				<IconFileText class="text-primary-500 h-4 w-4 shrink-0" />
				<div class="min-w-0">
					<span class="text-surface-900-100 text-sm font-bold">Financial Reports</span>
					<span class="text-surface-500 mx-1.5 text-sm">·</span>
					<span class="text-surface-500 text-xs font-medium">{reportPeriodLabel}</span>
					{#if report.from && report.to}
						<span class="text-surface-400 mx-1 text-xs"
							>{formatDate(report.from)} – {formatDate(report.to)}</span
						>
					{/if}
				</div>
			</div>
			<!-- Right: controls -->
			<div class="flex flex-wrap items-center gap-2">
				<select
					class="select preset-tonal-surface h-9 text-sm"
					bind:value={reportPeriodKey}
					onchange={(event) => {
						const nextPeriod = event.currentTarget.value;
						reportPeriodKey = nextPeriod;
						if (nextPeriod !== 'custom') void applyReportFilters(nextPeriod);
					}}
				>
					{#each reportPeriodOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				{#if reportPeriodKey === 'custom'}
					<input
						class="input preset-tonal-surface h-9 w-32 text-sm"
						type="date"
						bind:value={reportFrom}
					/>
					<input
						class="input preset-tonal-surface h-9 w-32 text-sm"
						type="date"
						bind:value={reportTo}
					/>
					<button
						class="btn btn-sm preset-filled-primary-500 h-9 items-center gap-1.5 font-bold"
						type="button"
						onclick={() => void applyReportFilters('custom')}
					>
						<IconCheckCircle2 class="h-3.5 w-3.5" />
						Apply
					</button>
				{/if}
			</div>
		</div>

		<!-- Report cards: P&L + Balance Sheet side by side -->
		<section class="grid gap-6 lg:grid-cols-2">
			<!-- Profit & Loss -->
			<div class="card preset-tonal-surface border-surface-500/10 flex flex-col border shadow-sm">
				<div class="border-surface-500/10 flex items-center justify-between border-b px-5 py-3">
					<div class="flex items-center gap-3">
						<div class="bg-primary-500/10 text-primary-500 shrink-0 rounded-lg p-2">
							<IconFileText class="h-4 w-4" />
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-surface-900-100 text-base font-bold tracking-tight">
								Profit &amp; Loss
							</h2>
							<span
								class="badge preset-outlined-surface-500 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] uppercase"
							>
								P&amp;L
							</span>
						</div>
					</div>
					<div class="flex items-center gap-1.5">
						<button
							class="btn btn-sm preset-tonal-surface h-8 items-center gap-1 px-2.5 text-xs font-semibold"
							type="button"
							onclick={() => printReport('pl')}
						>
							<IconPrinter class="h-3 w-3" />
							PDF
						</button>
						<a
							class="btn btn-sm preset-tonal-surface h-8 items-center gap-1 px-2.5 text-xs font-semibold"
							href={reportExportHref('csv', 'pl')}
						>
							<IconFileText class="h-3 w-3" />
							CSV
						</a>
					</div>
				</div>
				<div class="divide-surface-500/10 flex-1 divide-y">
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<h3
								class="text-success-700-300 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
							>
								<IconArrowDownLeft class="h-3.5 w-3.5" />
								Money In
							</h3>
							<span class="text-success-700-300 text-xs font-bold tabular-nums">
								{formatCents(report.totals?.income_cents)}
							</span>
						</div>
						<div class="divide-surface-500/10 divide-y">
							{#each report.income as account}
								<div class="flex items-center justify-between py-2 text-sm">
									<span class="text-surface-700-300 truncate pr-4"
										>{account.code} · {account.name}</span
									>
									<span class="text-success-700-300 shrink-0 font-semibold tabular-nums">
										{formatCents(account.period_balance_cents)}
									</span>
								</div>
							{:else}
								<p class="text-surface-500 py-2 text-xs italic">No income recorded.</p>
							{/each}
						</div>
					</div>
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<h3
								class="text-warning-700-300 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
							>
								<IconArrowUpRight class="h-3.5 w-3.5" />
								Money Out
							</h3>
							<span class="text-warning-700-300 text-xs font-bold tabular-nums">
								{formatCents(report.totals?.expense_cents)}
							</span>
						</div>
						<div class="divide-surface-500/10 divide-y">
							{#each report.expenses as account}
								<div class="flex items-center justify-between py-2 text-sm">
									<span class="text-surface-700-300 truncate pr-4"
										>{account.code} · {account.name}</span
									>
									<span class="text-warning-700-300 shrink-0 font-semibold tabular-nums">
										{formatCents(account.period_balance_cents)}
									</span>
								</div>
							{:else}
								<p class="text-surface-500 py-2 text-xs italic">No expenses recorded.</p>
							{/each}
						</div>
					</div>
				</div>
				<div
					class="border-surface-500/20 bg-surface-500/5 flex items-center justify-between border-t px-5 py-3.5"
				>
					<span class="text-surface-900-100 text-sm font-bold">Net Activity</span>
					<span
						class="text-sm font-bold tabular-nums {report.totals?.net_cents >= 0
							? 'text-success-700-300'
							: 'text-error-700-300'}"
					>
						{formatCents(report.totals?.net_cents)}
					</span>
				</div>
			</div>

			<!-- Balance Sheet -->
			<div class="card preset-tonal-surface border-surface-500/10 flex flex-col border shadow-sm">
				<div class="border-surface-500/10 flex items-center justify-between border-b px-5 py-3">
					<div class="flex items-center gap-3">
						<div class="bg-secondary-500/10 text-secondary-500 shrink-0 rounded-lg p-2">
							<IconLandmark class="h-4 w-4" />
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-surface-900-100 text-base font-bold tracking-tight">
								What We Have / Owe
							</h2>
							<span
								class="badge preset-outlined-surface-500 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] uppercase"
							>
								Balance Sheet
							</span>
						</div>
					</div>
					<div class="flex items-center gap-1.5">
						<button
							class="btn btn-sm preset-tonal-surface h-8 items-center gap-1 px-2.5 text-xs font-semibold"
							type="button"
							onclick={() => printReport('bs')}
						>
							<IconPrinter class="h-3 w-3" />
							PDF
						</button>
						<a
							class="btn btn-sm preset-tonal-surface h-8 items-center gap-1 px-2.5 text-xs font-semibold"
							href={reportExportHref('csv', 'bs')}
						>
							<IconFileText class="h-3 w-3" />
							CSV
						</a>
					</div>
				</div>
				<div class="divide-surface-500/10 flex-1 divide-y">
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<h3
								class="text-surface-700-300 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
							>
								<IconBanknote class="h-3.5 w-3.5" />
								What We Have (Assets)
							</h3>
							<span class="text-surface-700 dark:text-surface-300 text-xs font-bold tabular-nums">
								{formatCents(report.totals?.assets_cents)}
							</span>
						</div>
						<div class="divide-surface-500/10 divide-y">
							{#each report.assets as account}
								<div class="flex items-center justify-between py-2 text-sm">
									<span class="text-surface-700-300 truncate pr-4"
										>{account.code} · {account.name}</span
									>
									<span class="text-surface-900-100 shrink-0 font-semibold tabular-nums">
										{formatCents(account.balance_cents)}
									</span>
								</div>
							{:else}
								<p class="text-surface-500 py-2 text-xs italic">No assets recorded.</p>
							{/each}
						</div>
					</div>
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<h3
								class="text-error-700-300 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
							>
								<IconScale class="h-3.5 w-3.5" />
								What We Owe (Liabilities)
							</h3>
							<span class="text-error-700-300 text-xs font-bold tabular-nums">
								{formatCents(report.totals?.liabilities_cents)}
							</span>
						</div>
						<div class="divide-surface-500/10 divide-y">
							{#each report.liabilities as account}
								<div class="flex items-center justify-between py-2 text-sm">
									<span class="text-surface-700-300 truncate pr-4"
										>{account.code} · {account.name}</span
									>
									<span class="text-error-700-300 shrink-0 font-semibold tabular-nums">
										{formatCents(account.balance_cents)}
									</span>
								</div>
							{:else}
								<p class="text-surface-500 py-2 text-xs italic">No liabilities recorded.</p>
							{/each}
						</div>
					</div>
				</div>
				<div
					class="border-surface-500/20 bg-surface-500/5 flex items-center justify-between border-t px-5 py-3.5"
				>
					<span class="text-surface-900-100 text-sm font-bold">Net Position</span>
					<span class="text-surface-900-100 text-sm font-bold tabular-nums">
						{formatCents(report.totals?.assets_cents - report.totals?.liabilities_cents)}
					</span>
				</div>
			</div>
		</section>

		<!-- Publish Snapshot Form -->
		<form
			method="POST"
			use:enhance
			action="?/publishSnapshot"
			class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm"
		>
			<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
				<IconUpload class="text-primary-500 h-5 w-5" />
				<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">
					Publish Fixed Snapshot
				</h2>
			</div>
			<div class="grid gap-4 md:grid-cols-3">
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">Title</span>
					<input
						class="input preset-tonal-surface"
						name="title"
						value="Financial snapshot {data.year}"
						required
					/>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">From</span>
					<input
						class="input preset-tonal-surface"
						type="date"
						name="from"
						value={yearStart}
						required
					/>
				</label>
				<label class="label">
					<span class="text-surface-700-300 text-xs font-semibold">To</span>
					<input
						class="input preset-tonal-surface"
						type="date"
						name="to"
						value={today < yearEnd ? today : yearEnd}
						required
					/>
				</label>
			</div>
			<div class="space-y-2">
				<span class="text-surface-700-300 text-xs font-semibold">Snapshot Visibility Settings</span>
				<div
					class="bg-surface-500/5 border-surface-500/5 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border p-4"
				>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							class="checkbox"
							type="checkbox"
							name="showActivity"
							checked={visibility.activity !== false}
						/>
						<span>Activity</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							class="checkbox"
							type="checkbox"
							name="showPosition"
							checked={visibility.position !== false}
						/>
						<span>Position</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							class="checkbox"
							type="checkbox"
							name="showBudgets"
							checked={visibility.budgets === true}
						/>
						<span>Budgets</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							class="checkbox"
							type="checkbox"
							name="showCash"
							checked={visibility.cash !== false}
						/>
						<span>Cash totals</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							class="checkbox"
							type="checkbox"
							name="showNotes"
							checked={visibility.notes !== false}
						/>
						<span>Notes</span>
					</label>
				</div>
			</div>
			<label class="label">
				<span class="text-surface-700-300 text-xs font-semibold">Notes</span>
				<textarea
					class="textarea preset-tonal-surface"
					name="notes"
					rows="2"
					placeholder="Add optional details for this snapshot..."
				></textarea>
			</label>
			<button
				class="btn preset-filled-primary-500 mt-2 flex w-full items-center justify-center gap-2 font-bold sm:w-auto"
				type="submit"
			>
				<IconUpload class="h-4 w-4" />
				<span>Publish Snapshot</span>
			</button>
		</form>
	{/if}

	{#if activeTab === 'transactions'}
		<section class="space-y-6">
			<div class="card preset-tonal-surface border-surface-500/10 space-y-6 border p-6 shadow-sm">
				<!-- Header section -->
				<div
					class="border-surface-500/10 flex flex-wrap items-center justify-between gap-4 border-b pb-4"
				>
					<div class="flex items-center gap-3">
						<div
							class="bg-surface-500/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
						>
							<IconArrowRightLeft class="text-primary-500 h-5 w-5" />
						</div>
						<div class="min-w-0">
							<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">
								Transactions Ledger
							</h2>
							<p class="text-surface-500 text-xs font-semibold">
								{transactionViewMode === 'recent'
									? `Showing ${transactionDisplayEntries.length} most recent of ${transactionEntries.length} records`
									: `Found ${transactionDisplayEntries.length} of ${transactionEntries.length} records`}
								· {transactionPeriodLabel}
							</p>
						</div>
					</div>
					<form method="POST" use:enhance action="?/autoMatch">
						<button
							class="btn btn-sm preset-filled-secondary-500 flex items-center gap-2 font-bold shadow-sm transition-all hover:scale-[1.02]"
							type="submit"
						>
							<IconListChecks class="h-4 w-4" />
							<span>Auto-Match Activity</span>
						</button>
					</form>
				</div>

				<!-- Filters section -->
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Search -->
					<div class="flex flex-col gap-1.5">
						<span class="text-surface-700-300 text-xs font-semibold">Search</span>
						<div class="relative">
							<span
								class="text-surface-500 pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
							>
								<IconSearch class="h-4 w-4" />
							</span>
							<input
								class="input preset-tonal-surface pl-9"
								type="search"
								placeholder="Descriptions, accounts, amounts..."
								value={transactionSearch}
								oninput={(event) => {
									transactionSearch = event.currentTarget.value;
									startTransactionFiltering();
								}}
							/>
						</div>
					</div>

					<!-- Account Filter -->
					<div class="flex flex-col gap-1.5">
						<span class="text-surface-700-300 text-xs font-semibold">Account</span>
						<select
							class="select preset-tonal-surface"
							value={transactionAccountId}
							onchange={(event) => {
								transactionAccountId = event.currentTarget.value;
								startTransactionFiltering();
							}}
						>
							<option value="all">All accounts</option>
							{#each transactionAccountOptions as account}
								<option value={account.id}>{accountLabel(account)}</option>
							{/each}
						</select>
					</div>

					<!-- Source Filter -->
					<div class="flex flex-col gap-1.5">
						<span class="text-surface-700-300 text-xs font-semibold">Source</span>
						<select
							class="select preset-tonal-surface"
							value={transactionSource}
							onchange={(event) => {
								transactionSource = event.currentTarget.value;
								startTransactionFiltering();
							}}
						>
							<option value="all">All sources</option>
							{#each transactionSourceOptions as source}
								<option value={source}>{source.replaceAll('_', ' ')}</option>
							{/each}
						</select>
					</div>

					<!-- Date Range Filter -->
					<div class="flex flex-col gap-1.5">
						<span class="text-surface-700-300 text-xs font-semibold">Date range</span>
						<select
							class="select preset-tonal-surface"
							value={transactionPeriodKey}
							onchange={(event) => {
								transactionPeriodKey = event.currentTarget.value;
								startTransactionFiltering();
							}}
						>
							{#each transactionPeriodOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Custom Date selectors -->
				{#if transactionPeriodKey === 'custom'}
					<div
						class="border-surface-500/10 grid gap-4 border-t pt-4 sm:grid-cols-2"
						transition:slide={{ duration: 150 }}
					>
						<div class="flex flex-col gap-1.5">
							<span class="text-surface-700-300 text-xs font-semibold">From</span>
							<input
								class="input preset-tonal-surface"
								type="date"
								value={transactionFrom}
								onchange={(event) => {
									transactionFrom = event.currentTarget.value;
									startTransactionFiltering();
								}}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<span class="text-surface-700-300 text-xs font-semibold">To</span>
							<input
								class="input preset-tonal-surface"
								type="date"
								value={transactionTo}
								onchange={(event) => {
									transactionTo = event.currentTarget.value;
									startTransactionFiltering();
								}}
							/>
						</div>
					</div>
				{/if}

				<!-- Ledger Entries -->
				<div class="space-y-4">
					{#each transactionDisplayEntries as entry}
						<form
							method="POST"
							use:enhance={enhanceTransactionEdit(entry.id)}
							action="?/updateTransaction"
							class="block w-full text-left"
						>
							<input type="hidden" name="entryId" value={entry.id} />
							<input
								type="hidden"
								name="lineAccountsJson"
								value={JSON.stringify(editingTransactionDraft.lineAccounts ?? [])}
							/>

							{#if editingTransactionId === entry.id}
								<!-- Edit Mode Layout -->
								<div
									class="card preset-tonal-surface border-surface-500/15 border-l-secondary-500 space-y-5 rounded-2xl border border-l-4 p-5 shadow-md sm:p-6"
								>
									<!-- Header info -->
									<div
										class="border-surface-500/10 flex items-center justify-between gap-3 border-b pb-3"
									>
										<div class="flex min-w-0 items-center gap-2.5">
											<div
												class="bg-secondary-500/15 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
											>
												<IconPencil class="text-secondary-400 h-3.5 w-3.5" />
											</div>
											<div class="min-w-0">
												<h3 class="text-surface-900-100 text-sm font-bold">Edit Transaction</h3>
												<p class="text-surface-500 text-xs">
													{entry.entry_type} · {entry.source || 'manual'}
												</p>
											</div>
										</div>
										<span
											class="badge preset-tonal-secondary text-[10px] font-bold tracking-wider uppercase"
										>
											Editing
										</span>
									</div>

									<!-- Edit Grid fields -->
									<div class="grid gap-4 sm:grid-cols-[160px_1fr]">
										<label class="label">
											<span class="text-surface-700-300 text-xs font-semibold"> Date </span>
											<input
												class="input preset-tonal-surface"
												type="date"
												name="entryDate"
												value={editingTransactionDraft.entryDate}
												oninput={(event) =>
													(editingTransactionDraft = {
														...editingTransactionDraft,
														entryDate: event.currentTarget.value
													})}
												required
											/>
										</label>
										<label class="label">
											<span class="text-surface-700-300 text-xs font-semibold"> Description </span>
											<input
												class="input preset-tonal-surface"
												type="text"
												name="description"
												value={editingTransactionDraft.description}
												oninput={(event) =>
													(editingTransactionDraft = {
														...editingTransactionDraft,
														description: event.currentTarget.value
													})}
												required
											/>
										</label>
									</div>

									<label class="label">
										<span class="text-surface-700-300 text-xs font-semibold">
											Memo (Optional)
										</span>
										<textarea
											class="textarea preset-tonal-surface"
											name="memo"
											rows="2"
											value={editingTransactionDraft.memo}
											oninput={(event) =>
												(editingTransactionDraft = {
													...editingTransactionDraft,
													memo: event.currentTarget.value
												})}
											placeholder="Optional internal memo"
										></textarea>
									</label>

									<!-- Line accounts allocation -->
									<div class="border-surface-500/10 space-y-3 border-t pt-4">
										<h4
											class="text-surface-700-300 text-[10px] font-bold tracking-widest uppercase"
										>
											Account Allocations
										</h4>
										<div class="grid gap-4 sm:grid-cols-2">
											{#each entry.lines ?? [] as line, index}
												{@const lineDraft = getEditingTransactionLine(line.id)}
												{@const lineLabel =
													index === 0
														? 'Where did it come from?'
														: index === 1
															? 'Category'
															: `Account ${index + 1}`}
												<div class="flex flex-col gap-1.5">
													<span class="text-surface-700-300 text-xs font-semibold">
														{lineLabel}
													</span>
													<SearchableSelect
														items={getTransactionAccountOptions(lineDraft?.query ?? '')}
														query={lineDraft?.query ??
															(line.account ? accountLabel(line.account) : '')}
														placeholder="Search accounts"
														emptyMessage="No matching accounts."
														itemLabel={accountLabel}
														itemMeta={(account) => account.display_group || 'Other'}
														onQueryChange={(value) =>
															updateTransactionLineAccountQuery(line.id, value)}
														onSelect={(account) =>
															updateTransactionLineAccount(
																line.id,
																account.id,
																accountLabel(account)
															)}
													/>
												</div>
											{/each}
										</div>
									</div>

									<!-- Actions -->
									<div
										class="border-surface-500/10 flex items-center justify-end gap-2 border-t pt-4"
									>
										<button
											class="btn btn-sm preset-outlined-surface-500 font-semibold"
											type="button"
											onclick={stopTransactionEdit}
											disabled={isSavingTransaction(entry.id)}
										>
											Cancel
										</button>
										<button
											class="btn btn-sm preset-filled-secondary-500 flex items-center gap-2 font-bold"
											type="submit"
											disabled={isSavingTransaction(entry.id)}
										>
											{#if isSavingTransaction(entry.id)}
												<IconRefreshCw class="h-4 w-4 animate-spin" />
												<span>Saving...</span>
											{:else}
												<span>Save Changes</span>
											{/if}
										</button>
									</div>
								</div>
							{:else}
								<!-- View Mode Layout -->
								{@const presentation = transactionAmountPresentation(entry)}
								{@const isDebit = presentation.sign === '+'}
								{@const isCredit = presentation.sign === '-'}
								{@const entryDateObj = entry.entry_date
									? new Date(String(entry.entry_date).slice(0, 10) + 'T12:00:00')
									: null}
								<div
									class="group bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/10 flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all duration-150 sm:flex-row sm:items-center"
								>
									<!-- Left side: Date Badge & Desc/Memo & Lines -->
									<div class="flex min-w-0 flex-1 items-start gap-3">
										<!-- Transaction Icon / Date Indicator -->
										<div
											class="bg-surface-500/10 flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg text-center"
										>
											{#if entryDateObj}
												<span
													class="text-surface-500 text-[10px] leading-tight font-extrabold tracking-wider uppercase"
												>
													{entryDateObj.toLocaleString(undefined, { month: 'short' })}
												</span>
												<span class="text-surface-900-100 text-lg leading-none font-extrabold">
													{entryDateObj.getDate()}
												</span>
											{:else}
												<span class="text-surface-500">—</span>
											{/if}
										</div>

										<!-- Details -->
										<div class="min-w-0 flex-1 space-y-1">
											<div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
												<h3
													class="text-surface-900-100 min-w-0 truncate text-sm leading-snug font-semibold"
												>
													{entry.description}
												</h3>
												<div class="flex shrink-0 items-center gap-1">
													<span
														class="badge preset-tonal-surface px-1.5 py-0.5 text-[9px] font-semibold capitalize"
													>
														{entry.entry_type.replaceAll('_', ' ')}
													</span>
													{#if (entry.receipts ?? []).length}
														<span
															class="badge preset-tonal-surface flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold"
															title="{(entry.receipts ?? []).length} Receipt(s)"
														>
															<IconReceipt class="h-2.5 w-2.5" />
															<span>{entry.receipts.length}</span>
														</span>
													{/if}
												</div>
											</div>

											<!-- Accounts & Memo -->
											<div class="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
												<div class="flex flex-wrap gap-1">
													{#each entry.lines ?? [] as line}
														<span
															class="bg-surface-500/10 text-surface-700-300 rounded px-1.5 py-0.5 font-mono text-xs font-medium"
														>
															{line.account?.code} · {line.account?.name || 'Unknown'}
														</span>
													{/each}
												</div>
												{#if entry.memo}
													<span class="text-surface-500 text-xs opacity-60">•</span>
													<span
														class="text-surface-500 max-w-full truncate text-xs italic sm:max-w-[200px] md:max-w-[300px]"
														title={entry.memo}
													>
														"{entry.memo}"
													</span>
												{/if}
											</div>
										</div>
									</div>

									<!-- Right side: Amount & Source & Actions -->
									<div
										class="border-surface-500/10 flex shrink-0 items-center justify-between gap-3 border-t pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0"
									>
										<!-- Source Badge for Mobile -->
										<span
											class="text-surface-500 text-[9px] font-bold tracking-wider uppercase sm:hidden"
										>
											{entry.source || 'manual'}
										</span>

										<div class="flex items-center gap-2.5">
											<div class="text-right">
												<p class="text-base font-bold tabular-nums {presentation.className}">
													{presentation.sign}{formatCents(
														Math.abs(Number(entry.amount_cents || 0))
													)}
												</p>
											</div>

											<button
												class="text-surface-400 hover:text-surface-900-100"
												type="button"
												onclick={() => startTransactionEdit(entry)}
												aria-label={`Edit transaction ${entry.description}`}
												title="Edit transaction"
											>
												<IconPencil class="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
								</div>
							{/if}
						</form>
					{:else}
						<div
							class="rounded-2xl border border-dashed border-surface-500/20 bg-surface-500/5 p-10 text-center"
						>
							<p class="text-surface-500 text-sm font-medium">
								No transactions match the current filters.
							</p>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	{#if activeTab === 'banking'}
		<section class="space-y-4">
			<!-- Header -->
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<h2 class="text-2xl font-bold tracking-tight">Bank Review</h2>
					<span
						class="badge {bankReviewTotal > 0
							? 'preset-filled-warning-500'
							: 'preset-tonal-success'} font-bold"
					>
						{bankReviewTotal}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="btn btn-sm preset-tonal-surface font-semibold"
						onclick={() => (showBankConfig = !showBankConfig)}
					>
						<IconCog class="h-4 w-4" />
						<span class="hidden sm:inline">{showBankConfig ? 'Hide Settings' : 'Settings'}</span>
					</button>
					<form method="POST" use:enhance={enhanceSyncAll} action="?/syncAll">
						<button
							class="btn btn-sm preset-filled-primary-500 font-bold"
							type="submit"
							disabled={syncAllBusy}
						>
							<IconRefreshCw class="h-4 w-4 {syncAllBusy ? 'animate-spin' : ''}" />
							<span>{syncAllBusy ? 'Syncing…' : 'Sync All'}</span>
						</button>
					</form>
				</div>
			</div>

			{#if bankReviewTotalPages > 1}
				<div
					class="border-surface-500/10 bg-surface-500/5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
				>
					<p class="text-sm font-semibold">
						Showing {bankReviewRangeStart}-{bankReviewRangeEnd} of {bankReviewTotal}
					</p>
					<div class="flex items-center gap-2">
						<button
							class="btn btn-sm preset-tonal-surface font-semibold"
							type="button"
							disabled={!bankReviewHasPrev}
							onclick={() => setBankReviewPage(bankReviewPage - 1)}
						>
							Previous
						</button>
						<span class="text-surface-500 text-xs font-semibold uppercase tracking-wider">
							Page {bankReviewPage} of {bankReviewTotalPages}
						</span>
						<button
							class="btn btn-sm preset-tonal-surface font-semibold"
							type="button"
							disabled={!bankReviewHasNext}
							onclick={() => setBankReviewPage(bankReviewPage + 1)}
						>
							Next
						</button>
					</div>
				</div>
			{/if}

			<!-- Settings Panel -->
			{#if showBankConfig}
				<div transition:slide={{ duration: 180 }} class="card preset-tonal-surface p-5">
					<div class="grid gap-6 md:grid-cols-2">
						<!-- Connected Accounts -->
						<div class="space-y-3">
							<p class="text-xs font-bold tracking-wider uppercase opacity-60">
								Connected Accounts
							</p>

							{#if mercuryConnected && !mercuryEditMode}
								<div class="card preset-tonal-success flex items-center justify-between gap-3 p-3">
									<div>
										<p class="text-sm font-semibold">
											Mercury · ••••{data.settings?.mercury_api_key_hint || '????'}
										</p>
										{#if mercuryConnection?.last_synced_at}
											<p class="text-xs opacity-70">
												Synced {formatDate(mercuryConnection.last_synced_at)}
											</p>
										{/if}
									</div>
									<button
										class="btn btn-sm preset-tonal-surface shrink-0 font-semibold"
										type="button"
										onclick={() => (mercuryEditMode = true)}
									>
										<IconPencil class="h-3.5 w-3.5" />
									</button>
								</div>
							{:else}
								<form
									method="POST"
									use:enhance={enhanceSaveConnections}
									action="?/saveConnections"
									class="flex gap-2"
								>
									<input
										class="input preset-tonal-surface flex-1 text-sm"
										type="password"
										name="mercuryApiKey"
										placeholder={mercuryConnected ? 'Replace Mercury API key…' : 'Mercury API key…'}
										autocomplete="off"
										required={!mercuryConnected || mercuryEditMode}
									/>
									<button
										class="btn btn-sm preset-filled-primary-500 shrink-0 font-bold"
										type="submit"
									>
										{mercuryConnected ? 'Update' : 'Save'}
									</button>
									{#if mercuryConnected}
										<button
											class="btn btn-sm preset-tonal-surface shrink-0"
											type="button"
											onclick={() => (mercuryEditMode = false)}>Cancel</button
										>
									{/if}
								</form>
							{/if}

								{#if bankFeedAccounts.length > 0}
									<div class="space-y-1.5">
										{#each bankFeedAccounts as providerAccount}
											<form
												method="POST"
												use:enhance
												action="?/updateProviderAccountMapping"
												class="card preset-tonal-surface flex flex-col gap-3 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
											>
												<input type="hidden" name="providerAccountId" value={providerAccount.id} />
												<div class="min-w-0">
													<div class="flex min-w-0 items-center gap-2">
														<span class="truncate font-semibold">{bankFeedLabel(providerAccount)}</span>
														<span
															class="badge preset-outlined-surface-500 shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
														>
															{providerAccount.provider}
														</span>
													</div>
													{#if !providerAccount.account_id}
														<p class="text-warning-700-300 mt-1 text-xs font-semibold">
															Map this feed before reviewing its transactions.
														</p>
													{/if}
												</div>
												<select
													class="select preset-tonal-surface w-full text-xs sm:max-w-[240px]"
													name="accountId"
													value={providerAccount.account_id || ''}
													onchange={requestInlineSave}
												>
													<option value="">Unmapped</option>
													{#each cashAccounts as account}
														<option value={account.id}>{accountLabel(account)}</option>
													{/each}
												</select>
											</form>
										{/each}
									</div>
								{/if}

							{#if !stripeConnected}
								<div class="rounded-xl border border-warning-500/20 bg-warning-500/10 p-3">
									<div class="flex items-center justify-between gap-3">
										<p class="min-w-0 truncate text-sm font-semibold leading-tight">
											Connect Stripe to link bank accounts
										</p>
										<a
											class="btn btn-sm preset-filled-primary-500 shrink-0 whitespace-nowrap font-bold"
											href={stripeConnectUrl}
										>
											<IconCreditCard class="h-4 w-4" />
											<span>Connect Stripe</span>
										</a>
									</div>
								</div>
							{/if}
							<button
								class="btn btn-sm preset-outlined-primary-500 w-full font-bold"
								type="button"
								disabled={!stripeConnected || financialConnectionsBusy}
								onclick={connectFinancialAccounts}
							>
								<IconLandmark class="h-4 w-4" />
								<span>{financialConnectionsBusy ? 'Opening Stripe…' : 'Connect Bank Account'}</span>
							</button>
							<p class="text-xs font-medium leading-snug opacity-60">
								Each linked bank costs $0.30 per month to import transactions, deducted from the group's
								Stripe balance.
							</p>
							{#if financialConnectionsMessage}
								<p class="card preset-tonal-primary p-2 text-xs font-semibold">
									{financialConnectionsMessage}
								</p>
							{/if}
						</div>

						<!-- Manual Import -->
						<div class="space-y-3">
							<p class="text-xs font-bold tracking-wider uppercase opacity-60">Import CSV</p>
							<form
								method="POST"
								use:enhance
								action="?/importBankCsv"
								enctype="multipart/form-data"
								class="space-y-3"
							>
								<input
									class="input preset-tonal-surface text-sm"
									type="file"
									name="csvFile"
									accept=".csv,text/csv"
									required
								/>
								<select
									class="select preset-tonal-surface text-sm"
									name="accountId"
									bind:value={csvImportAccountId}
									disabled={!cashAccounts.length}
									required
								>
									<option value=""
										>{cashAccounts.length
											? 'Select target account…'
											: 'No bank accounts available'}</option
									>
									{#each cashAccounts as account}
										<option value={account.id}>{accountLabel(account)}</option>
									{/each}
								</select>
								<button
									class="btn btn-sm preset-outlined-primary-500 w-full font-bold"
									type="submit"
									disabled={!cashAccounts.length}
								>
									<IconUpload class="h-4 w-4" />
									<span>Import CSV</span>
								</button>
							</form>
						</div>
					</div>
				</div>
			{/if}

			<!-- Transaction Review -->
			{#if bankReviewGroups.length > 0}
				<div class="space-y-3">
					{#each bankReviewGroups as group (group.accountId)}
						<div
							class="card preset-tonal-surface transition-opacity duration-150 {group.items.some(
								(item) => isPostingFeedItem(item.id)
							)
								? 'opacity-75'
								: ''}"
						>
							<!-- Group header -->
							<div
								class="border-surface-500/15 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b px-4 py-3"
							>
								<div class="flex min-w-0 items-center gap-2">
									<IconLandmark class="text-primary-500 h-4 w-4 shrink-0" />
									<span class="truncate font-bold"
										>{group.account ? accountLabel(group.account) : 'Unassigned'}</span
									>
									<span class="badge preset-tonal-surface px-2 py-0.5 text-[10px] font-semibold"
										>{group.items.length}</span
									>
								</div>
									<select
										class="select preset-tonal-surface max-w-[220px] py-1 text-xs"
										value={group.accountId}
										aria-label="Bank feed source"
										disabled={!mappedBankFeedAccounts.length}
									onchange={(event) => {
										const nextAccountId = event.currentTarget.value;
										for (const item of group.items)
											setReviewSelection(item.id, { accountId: nextAccountId });
									}}
									>
										<option value=""
											>{mappedBankFeedAccounts.length ? 'Select source…' : 'No mapped feeds'}</option
										>
										{#each mappedBankFeedAccounts as account}
											<option value={account.account_id}>{bankFeedLabel(account)}</option>
										{/each}
									</select>
							</div>

							<!-- Transactions -->
							<div class="divide-surface-500/10 divide-y">
									{#each group.items as item (item.id)}
										{@const selection = getReviewSelection(item)}
										{@const categoryOptions = getReviewCategoryOptions(item, selection.categoryQuery)}
										{@const selectedMatch = selectedMatchCandidate(item)}
										<form
										method="POST"
										use:enhance={enhancePostFeedItem(item.id)}
										action="?/postFeedItem"
										class="px-4 py-3 transition-opacity duration-100 {isPostingFeedItem(item.id)
											? 'opacity-60'
											: ''}"
									>
										<input type="hidden" name="feedItemId" value={item.id} />
										<input type="hidden" name="accountId" value={selection.accountId} />
											<input
												type="hidden"
												name="categoryAccountId"
												value={selection.categoryAccountId}
											/>

										<!-- Line 1: description + amount -->
										<div class="mb-2 flex items-baseline gap-3">
											<p class="truncate text-sm leading-snug font-semibold capitalize">
												{item.description.toLowerCase()}
											</p>
											<span
												class="shrink-0 text-sm font-bold tabular-nums {item.amount_cents >= 0
													? 'text-success-500'
													: 'text-error-500'}"
											>
												{item.amount_cents >= 0 ? '+' : ''}{formatCents(item.amount_cents)}
											</span>
												<span class="shrink-0 text-xs opacity-40"
													>{formatDate(item.transaction_date)} · {item.provider}</span
												>
												{#if item.status === 'matched'}
													<span
														class="badge preset-tonal-success shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
														>Match found</span
													>
												{/if}
											</div>

											{#if (item.match_candidates ?? []).length > 0}
												<div
													class="bg-surface-500/5 border-surface-500/10 mb-2 flex max-w-3xl flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center"
												>
													<select
														class="select preset-tonal-surface min-w-0 flex-1 py-1 text-xs"
														name="entryId"
														value={selectedMatch?.id || ''}
														aria-label="Existing transaction match"
													>
														{#each item.match_candidates as candidate}
															<option value={candidate.id}>
																{matchCandidateLabel(candidate)}
																{candidate.reason ? ` (${candidate.reason})` : ''}
															</option>
														{/each}
													</select>
													<button
														class="btn btn-sm preset-outlined-primary-500 shrink-0 font-bold"
														formaction="?/matchFeedItem"
														type="submit"
														disabled={isPostingFeedItem(item.id)}
													>
														Match
													</button>
												</div>
											{/if}

											<!-- Line 2: category + actions -->
										<div class="flex max-w-xl items-center gap-2">
											<div class="min-w-0 flex-1">
												<SearchableSelect
													items={categoryOptions}
													query={selection.categoryQuery}
													placeholder="Category or transfer account…"
													emptyMessage="No matches."
													itemLabel={accountLabel}
													itemMeta={(account) =>
														['asset', 'liability'].includes(account.kind)
															? 'Transfer'
															: account.display_group || 'Other'}
													onQueryChange={(value) =>
														updateReviewCategoryQuery(item.id, item.amount_cents, value)}
													onSelect={(account) => selectReviewCategory(item.id, account)}
												/>
											</div>
											<button
												class="btn btn-sm preset-filled-primary-500 shrink-0 font-bold"
												type="submit"
												disabled={isPostingFeedItem(item.id)}
											>
												{#if isPostingFeedItem(item.id)}
													<IconRefreshCw class="h-3.5 w-3.5 animate-spin" />
												{:else}
													Post
												{/if}
											</button>
											<button
												class="btn btn-sm preset-tonal-error shrink-0 font-medium"
												formaction="?/ignoreFeedItem"
												type="submit"
												disabled={isPostingFeedItem(item.id)}
											>
												Ignore
											</button>
										</div>
									</form>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="card preset-tonal-surface flex flex-col items-center justify-center p-16 text-center"
				>
					<div class="preset-tonal-success mb-4 rounded-full p-4">
						<IconCheckCircle2 class="text-success-500 h-10 w-10" />
					</div>
					<h3 class="text-lg font-bold">All caught up!</h3>
					<p class="mt-1 max-w-xs text-sm opacity-60">
						No transactions need review. Sync your bank feeds or import a CSV to get started.
					</p>
					{#if !showBankConfig}
						<button
							class="btn btn-sm preset-tonal-surface mt-4 font-semibold"
							onclick={() => (showBankConfig = true)}
						>
							<IconCog class="h-4 w-4" />
							<span>Manage Connections</span>
						</button>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	{#if activeTab === 'advanced'}
		<section class="max-w-4xl space-y-6">
			<!-- Advanced Journal Form -->
			<form
				method="POST"
				use:enhance
				action="?/journal"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconBookOpen class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Advanced Journal</h2>
				</div>
				<input type="hidden" name="linesJson" value={journalJson} />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Date</span>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="entryDate"
							value={today}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold">Description</span>
						<input
							class="input preset-tonal-surface"
							name="description"
							placeholder="e.g. Closing ledger adjustments"
							required
						/>
					</label>
				</div>

				<div class="mt-4 space-y-3">
					<!-- Table Headers on desktop -->
					<div
						class="text-surface-500 hidden grid-cols-[1.5fr_1fr_1fr_1.5fr_auto] gap-2 px-2 text-xs font-bold tracking-wider uppercase md:grid"
					>
						<div>Account</div>
						<div>Debit ($)</div>
						<div>Credit ($)</div>
						<div>Line Note</div>
						<div class="w-8"></div>
					</div>

					{#each journalLines as line, index}
						<div
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 grid gap-2 rounded-xl border p-3 transition-colors md:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]"
						>
							<span
								class="text-surface-500 text-[10px] font-bold tracking-wider uppercase md:hidden"
								>Account</span
							>
							<select
								class="select preset-tonal-surface text-sm"
								value={line.account_id}
								onchange={(event) =>
									updateJournalLine(index, 'account_id', event.currentTarget.value)}
								required
							>
								<option value="">Select Account</option>
								{#each accounts as account}
									<option value={account.id}>{account.code} · {account.name}</option>
								{/each}
							</select>

							<span
								class="text-surface-500 text-[10px] font-bold tracking-wider uppercase md:hidden"
								>Debit</span
							>
							<input
								class="input preset-tonal-surface text-sm"
								placeholder="Debit"
								type="number"
								step="0.01"
								value={line.debit}
								oninput={(event) => updateJournalLine(index, 'debit', event.currentTarget.value)}
							/>

							<span
								class="text-surface-500 text-[10px] font-bold tracking-wider uppercase md:hidden"
								>Credit</span
							>
							<input
								class="input preset-tonal-surface text-sm"
								placeholder="Credit"
								type="number"
								step="0.01"
								value={line.credit}
								oninput={(event) => updateJournalLine(index, 'credit', event.currentTarget.value)}
							/>

							<span
								class="text-surface-500 text-[10px] font-bold tracking-wider uppercase md:hidden"
								>Line Note</span
							>
							<input
								class="input preset-tonal-surface text-sm"
								placeholder="Line note"
								value={line.description}
								oninput={(event) =>
									updateJournalLine(index, 'description', event.currentTarget.value)}
							/>

							<button
								class="btn btn-icon btn-sm preset-outlined-surface-500 hover:preset-filled-error-500 mt-2 shrink-0 self-center hover:text-white md:mt-0"
								type="button"
								onclick={() => removeJournalLine(index)}
								disabled={journalLines.length <= 2}
								title="Remove Line"
							>
								×
							</button>
						</div>
					{/each}
				</div>

				<div
					class="bg-surface-500/5 border-surface-500/5 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 text-sm font-semibold"
				>
					<div class="flex gap-4">
						<div>
							Debits: <span class="text-success-700-300 font-bold"
								>{formatCents(journalDebitTotal)}</span
							>
						</div>
						<div>
							Credits: <span class="text-secondary-700-300 font-bold"
								>{formatCents(journalCreditTotal)}</span
							>
						</div>
					</div>

					<button
						class="btn btn-sm preset-outlined-surface-500 font-semibold"
						type="button"
						onclick={addJournalLine}
					>
						+ Add Line
					</button>
				</div>

				<div class="flex items-center gap-4 pt-2">
					<button
						class="btn preset-filled-primary-500 flex items-center justify-center gap-2 font-bold"
						type="submit"
						disabled={journalDebitTotal !== journalCreditTotal || journalDebitTotal === 0}
					>
						<IconCheckCircle2 class="h-4 w-4" />
						<span>Post Journal</span>
					</button>
					{#if journalDebitTotal !== journalCreditTotal}
						<span class="text-error-500 animate-pulse text-xs font-semibold"
							>Debits and credits must balance.</span
						>
					{/if}
				</div>
			</form>
		</section>
	{/if}

	{#if activeTab === 'settings'}
		<section class="grid gap-6 lg:grid-cols-2">
			<!-- Public Defaults Form -->
			<form
				method="POST"
				use:enhance
				action="?/saveSettings"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconCog class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">
						Public Reporting Defaults
					</h2>
				</div>

				<div class="space-y-4">
					<label class="flex cursor-pointer items-center gap-2.5 py-1 text-sm font-semibold">
						<input
							class="checkbox"
							type="checkbox"
							name="publicReportsEnabled"
							checked={data.settings?.public_reports_enabled}
						/>
						<span>Allow public financial snapshots</span>
					</label>

					<label class="label">
						<span class="text-surface-700-300 text-xs font-semibold"
							>Fiscal year starts (Month #)</span
						>
						<input
							class="input preset-tonal-surface"
							type="number"
							min="1"
							max="12"
							name="fiscalYearStartMonth"
							value={data.settings?.fiscal_year_start_month || 1}
							required
						/>
					</label>

					<div class="mt-2 space-y-2">
						<span class="text-surface-700-300 text-xs font-semibold"
							>Visible Reports by Default</span
						>
						<div
							class="bg-surface-500/5 border-surface-500/5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-4"
						>
							<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
								<input
									class="checkbox"
									type="checkbox"
									name="showActivity"
									checked={visibility.activity !== false}
								/>
								<span>Activity report</span>
							</label>
							<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
								<input
									class="checkbox"
									type="checkbox"
									name="showPosition"
									checked={visibility.position !== false}
								/>
								<span>Position report</span>
							</label>
							<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
								<input
									class="checkbox"
									type="checkbox"
									name="showBudgets"
									checked={visibility.budgets === true}
								/>
								<span>Budgets</span>
							</label>
							<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
								<input
									class="checkbox"
									type="checkbox"
									name="showCash"
									checked={visibility.cash !== false}
								/>
								<span>Cash totals</span>
							</label>
							<label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
								<input
									class="checkbox"
									type="checkbox"
									name="showNotes"
									checked={visibility.notes !== false}
								/>
								<span>Notes</span>
							</label>
						</div>
					</div>

					<button
						class="btn preset-filled-primary-500 mt-2 w-full font-bold sm:w-auto"
						type="submit">Save Settings</button
					>
				</div>
			</form>

			<!-- Published Snapshots List -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconFileText class="text-secondary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Published Snapshots</h2>
				</div>
				<div class="space-y-3">
					{#each data.public_reports as snapshot}
						<form
							method="POST"
							use:enhance
							action="?/unpublishSnapshot"
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 flex items-center justify-between gap-4 rounded-xl border p-4 text-sm transition-all duration-150"
						>
							<input type="hidden" name="reportId" value={snapshot.id} />
							<div class="min-w-0 space-y-1">
								<p class="text-surface-900-100 truncate font-bold">
									{snapshot.title}
								</p>
								<p class="text-surface-500 text-xs">
									{formatDate(snapshot.report_period_start)} to {formatDate(
										snapshot.report_period_end
									)}
								</p>
								{#if snapshot.slug}
									<a
										class="text-primary-500 mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
										href={`/groups/${data.group?.slug}/reports/${snapshot.slug}`}
										target="_blank"
									>
										<span>Public link</span>
										<IconExternalLink class="h-3 w-3" />
									</a>
								{/if}
							</div>
							<button
								class="btn btn-sm preset-outlined-surface-500 shrink-0 font-medium"
								type="submit"
								disabled={!snapshot.published}
							>
								Unpublish
							</button>
						</form>
					{:else}
						<div
							class="flex flex-col items-center justify-center p-8 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
						>
							<IconUpload class="h-8 w-8 text-surface-400 mb-2 opacity-50" />
							<p class="text-sm text-surface-500 font-medium">No public snapshots published yet.</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Exports -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconFileText class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Exports</h2>
				</div>
				<p class="text-surface-700-300 text-sm leading-relaxed">
					Download the complete general ledger history for this group in CSV format for local backup
					or importing into other tools.
				</p>
				<a
					class="btn preset-outlined-primary-500 flex h-fit w-full items-center justify-center gap-2 font-bold sm:w-auto"
					href={`/api/groups/${data.group?.slug}/accounting/export/entries.csv`}
				>
					<IconFileText class="h-4 w-4" />
					<span>Download entries CSV</span>
				</a>
			</div>

			<!-- Receipt Review -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconReceipt class="text-secondary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Receipt Review</h2>
				</div>
				<div class="space-y-3">
					{#each receipts.slice(0, 5) as receipt}
						<form
							method="POST"
							use:enhance
							action="?/reclassifyReceipt"
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 space-y-3 rounded-xl border p-4 transition-colors duration-150"
						>
							<input type="hidden" name="receiptId" value={receipt.id} />
							<div
								class="border-surface-500/10 flex items-start justify-between gap-2 border-b pb-2"
							>
								<span class="text-surface-900-100 truncate text-sm font-bold"
									>{receipt.file_name}</span
								>
								<span
									class="badge preset-outlined-surface-500 px-1.5 py-0.5 text-[10px] font-semibold capitalize"
									>{receipt.classification_status}</span
								>
							</div>

							<div class="grid gap-2 sm:grid-cols-3">
								<input
									class="input preset-tonal-surface text-xs"
									name="vendor"
									placeholder="Vendor"
									required
								/>
								<input
									class="input preset-tonal-surface text-xs"
									name="amount"
									type="number"
									step="0.01"
									placeholder="Amount"
									required
								/>
								<button
									class="btn btn-sm preset-filled-primary-500 text-xs font-bold"
									type="submit"
								>
									Classify
								</button>
							</div>
						</form>
					{:else}
						<div
							class="flex flex-col items-center justify-center p-8 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
						>
							<IconReceipt class="h-8 w-8 text-surface-400 mb-2 opacity-50" />
							<p class="text-sm text-surface-500 font-medium">No receipts uploaded yet.</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Audit Trail -->
			<div
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm lg:col-span-2"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconCog class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900-100 text-lg font-bold tracking-tight">Audit Trail</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each auditEvents.slice(0, 8) as event}
						<div
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 space-y-1 rounded-xl border p-4 transition-colors duration-150"
						>
							<div class="flex items-start justify-between gap-2">
								<span class="text-surface-900-100 text-xs font-bold">{event.event_type}</span>
								<span class="text-surface-500 text-[9px] font-medium"
									>{formatDate(event.created_at)}</span
								>
							</div>
							<p class="text-surface-500 text-[10px] font-semibold tracking-wider uppercase">
								{event.entity_type}
							</p>
						</div>
					{:else}
						<div
							class="col-span-full flex flex-col items-center justify-center p-8 text-center bg-surface-500/5 rounded-xl border border-dashed border-surface-500/20"
						>
							<p class="text-sm text-surface-500 font-medium">No audit events logged yet.</p>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
