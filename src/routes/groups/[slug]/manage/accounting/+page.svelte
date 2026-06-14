<script>
	import IconArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import IconArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBadgeDollarSign from '@lucide/svelte/icons/badge-dollar-sign';
	import IconBanknote from '@lucide/svelte/icons/banknote';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconChartColumn from '@lucide/svelte/icons/chart-column';
	import IconCheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import IconCog from '@lucide/svelte/icons/cog';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconLandmark from '@lucide/svelte/icons/landmark';
	import IconListChecks from '@lucide/svelte/icons/list-checks';
	import IconLockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import IconPencil from '@lucide/svelte/icons/pencil';
	import IconGripVertical from '@lucide/svelte/icons/grip-vertical';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconReceipt from '@lucide/svelte/icons/receipt';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconScale from '@lucide/svelte/icons/scale';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';
	import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';

	let { data, form } = $props();
	let activeTab = $state('overview');
	let moneyFlow = $state('expense');
	let financialConnectionsBusy = $state(false);
	let financialConnectionsMessage = $state('');
	let journalLines = $state([
		{ account_id: '', debit: '', credit: '', description: '' },
		{ account_id: '', debit: '', credit: '', description: '' }
	]);

	const accounts = $derived(Array.isArray(data.accounts) ? data.accounts : []);
	const report = $derived(
		data.report ?? {
			totals: {},
			monthly: [],
			income: [],
			expenses: [],
			assets: [],
			liabilities: [],
			equity: []
		}
	);
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
	const needsReview = $derived(feedItems.filter((item) => item.status === 'needs_review'));
	const matchedItems = $derived(feedItems.filter((item) => item.status === 'matched'));
	const providerAccounts = $derived(
		Array.isArray(data.provider_accounts) ? data.provider_accounts : []
	);
	const receipts = $derived(Array.isArray(data.receipts) ? data.receipts : []);
	const auditEvents = $derived(Array.isArray(data.audit_events) ? data.audit_events : []);
	const visibility = $derived(data.settings?.public_visibility ?? {});
	const accountKinds = ['asset', 'income', 'expense', 'liability', 'equity'];
	let accountGroups = $state(groupAccountsByKind([]));
	let editingGroupKey = $state('');
	let editingGroupValue = $state('');
	let groupLabelInput = $state(null);

	const tabs = [
		{ id: 'overview', label: 'Overview', icon: IconChartColumn },
		{ id: 'enter', label: 'Add Activity', icon: IconPlus },
		{ id: 'accounts', label: 'Buckets', icon: IconWalletCards },
		{ id: 'budgets', label: 'Budgets', icon: IconBadgeDollarSign },
		{ id: 'reports', label: 'Reports', icon: IconFileText },
		{ id: 'banking', label: 'Bank Review', icon: IconLandmark },
		{ id: 'advanced', label: 'Advanced', icon: IconBookOpen },
		{ id: 'settings', label: 'Settings', icon: IconCog }
	];

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

	function monthLabel(value) {
		return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
			month: 'short',
			year: 'numeric'
		});
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
			document
				.querySelector(`form[data-account-id="${CSS.escape(item.id)}"]`)
				?.requestSubmit();
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
					<p
						class="text-surface-600 dark:text-surface-400 text-xs font-semibold tracking-wider uppercase"
					>
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
					<p
						class="text-surface-600 dark:text-surface-400 text-xs font-semibold tracking-wider uppercase"
					>
						Money in
					</p>
					<p class="text-success-600 dark:text-success-400 text-2xl font-bold tracking-tight">
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
					<p
						class="text-surface-600 dark:text-surface-400 text-xs font-semibold tracking-wider uppercase"
					>
						Money out
					</p>
					<p class="text-warning-600 dark:text-warning-400 text-2xl font-bold tracking-tight">
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
					<p
						class="text-surface-600 dark:text-surface-400 text-xs font-semibold tracking-wider uppercase"
					>
						Net this year
					</p>
					<p
						class="text-2xl font-bold tracking-tight {report.totals?.net_cents >= 0
							? 'text-secondary-600 dark:text-secondary-400'
							: 'text-error-600 dark:text-error-400'}"
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
					: 'text-surface-600 dark:text-surface-400 hover:bg-surface-500/10'}"
				onclick={() => (activeTab = tab.id)}
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
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Monthly Performance
						</h2>
					</div>
					<span class="badge preset-outlined-surface-500 font-semibold">{data.year}</span>
				</div>

				<div class="space-y-2">
					{#if report.monthly.length > 0}
						<div
							class="text-surface-500 dark:text-surface-400 grid grid-cols-[minmax(80px,1.2fr)_1fr_1fr_1fr] gap-3 px-4 pb-1 text-xs font-bold tracking-wider uppercase"
						>
							<div>Month</div>
							<div class="text-success-600 dark:text-success-400">Income</div>
							<div class="text-warning-600 dark:text-warning-400">Expenses</div>
							<div class="text-right">Net</div>
						</div>
					{/if}

					{#each report.monthly as month}
						<div
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 grid grid-cols-[minmax(80px,1.2fr)_1fr_1fr_1fr] items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-colors duration-150"
						>
							<div class="text-surface-900 dark:text-surface-100 font-semibold">
								{monthLabel(month.month)}
							</div>
							<div class="text-success-600 dark:text-success-400">
								{formatCents(month.income_cents)}
							</div>
							<div class="text-warning-600 dark:text-warning-400">
								{formatCents(month.expense_cents)}
							</div>
							<div
								class="text-right font-bold {month.net_cents >= 0
									? 'text-surface-900 dark:text-surface-100'
									: 'text-error-600 dark:text-error-400'}"
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
							<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
								Needs Review
							</h2>
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
						<p class="text-surface-600 dark:text-surface-400 text-sm leading-relaxed">
							You have <span class="text-warning-600 dark:text-warning-400 font-semibold"
								>{needsReview.length}</span
							> imported bank transactions that need to be categorized.
						</p>
						<button
							class="btn btn-sm preset-filled-warning-500 flex w-full items-center justify-center gap-2 font-bold"
							type="button"
							onclick={() => (activeTab = 'banking')}
						>
							<IconListChecks class="h-4 w-4" />
							<span>Review Transactions</span>
						</button>
					{:else}
						<div class="flex flex-col items-center justify-center py-4 text-center">
							<div class="bg-success-500/10 text-success-500 mb-2 rounded-full p-3">
								<IconCheckCircle2 class="h-6 w-6" />
							</div>
							<p class="text-success-600 dark:text-success-400 text-sm font-semibold">
								All caught up!
							</p>
							<p class="text-surface-500 mt-1 text-xs">No transaction items need review.</p>
						</div>
					{/if}
				</div>

				<!-- Recent Activity -->
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
					<div class="border-surface-500/10 flex items-center justify-between border-b pb-3">
						<div class="flex items-center gap-2">
							<IconReceipt class="text-secondary-500 h-5 w-5" />
							<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
								Recent Activity
							</h2>
						</div>
					</div>

					<div class="space-y-2">
						{#each recentEntries.slice(0, 6) as entry}
							<form
								method="POST" use:enhance
								action="?/voidEntry"
								class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-sm transition-all duration-150"
							>
								<input type="hidden" name="entryId" value={entry.id} />
								<input type="hidden" name="reason" value="Voided from dashboard" />
								<div class="min-w-0 space-y-1">
									<p class="text-surface-900 dark:text-surface-100 truncate font-semibold">
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
									<span class="text-surface-900 dark:text-surface-100 font-bold tabular-nums"
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
									onclick={() => (activeTab = 'enter')}
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
				method="POST" use:enhance
				action="?/recordMoney"
				enctype="multipart/form-data"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm lg:col-span-2"
			>
				<div
					class="border-surface-500/10 flex flex-wrap items-center justify-between gap-4 border-b pb-4"
				>
					<div class="flex items-center gap-2">
						<IconPlus class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Record Money
						</h2>
					</div>

					<!-- Segmented selector -->
					<div class="card bg-surface-500/10 flex gap-1 rounded-lg p-1">
						<button
							type="button"
							class="btn btn-xs rounded px-3 py-1.5 font-semibold transition-all {moneyFlow ===
							'income'
								? 'preset-filled-success-500 text-white shadow-sm'
								: 'text-surface-600 dark:text-surface-400'}"
							onclick={() => (moneyFlow = 'income')}
						>
							Money in
						</button>
						<button
							type="button"
							class="btn btn-xs rounded px-3 py-1.5 font-semibold transition-all {moneyFlow ===
							'expense'
								? 'preset-filled-warning-500 text-white shadow-sm'
								: 'text-surface-600 dark:text-surface-400'}"
							onclick={() => (moneyFlow = 'expense')}
						>
							Money out
						</button>
					</div>
				</div>

				<input type="hidden" name="flow" value={moneyFlow} />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Date</span>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="entryDate"
							value={today}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Amount</span>
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
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>{moneyFlow === 'income' ? 'Where did it land?' : 'Where did it come from?'}</span
						>
						<select class="select preset-tonal-surface" name="cashAccountId" required>
							{#each cashAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Category</span
						>
						<select class="select preset-tonal-surface" name="categoryAccountId" required>
							{#each currentCategories as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Description</span
						>
						<input
							class="input preset-tonal-surface"
							name="description"
							placeholder="Bike valet supplies, member dues, grant deposit"
							required
						/>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Note</span>
						<textarea
							class="textarea preset-tonal-surface"
							name="memo"
							rows="2"
							placeholder="Add custom memo or notes..."
						></textarea>
					</label>
					<label class="label sm:col-span-2">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Receipt</span
						>
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
					method="POST" use:enhance
					action="?/transfer"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconArrowRightLeft class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Move Money
						</h2>
					</div>
					<div class="space-y-4">
						<input type="hidden" name="entryDate" value={today} />
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">From</span>
							<select class="select preset-tonal-surface" name="fromAccountId">
								{#each cashAccounts as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">To</span>
							<select class="select preset-tonal-surface" name="toAccountId">
								{#each cashAccounts as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Amount</span
							>
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
					method="POST" use:enhance
					action="?/openingBalance"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconBanknote class="text-secondary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Starting Balance
						</h2>
					</div>
					<div class="space-y-4">
						<input type="hidden" name="entryDate" value={today} />
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Account</span
							>
							<select class="select preset-tonal-surface" name="accountId">
								{#each cashAccounts.filter((account) => account.kind === 'asset') as account}
									<option value={account.id}>{account.name}</option>
								{/each}
							</select>
						</label>
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Amount</span
							>
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Buckets & Categories
					</h2>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					{#each accountKinds as kind}
						<div class="bg-surface-500/5 border-surface-500/5 space-y-4 rounded-2xl border p-4">
							<h3
								class="text-surface-500 dark:text-surface-400 text-xs font-bold tracking-wider uppercase"
							>
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
													<input type="hidden" name="currentDisplayGroup" value={group.displayGroup} />
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
													<div class="min-w-0 text-surface-900 dark:text-surface-100 truncate text-sm font-bold">
														{group.displayGroup}
													</div>
													<button
														class="text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 shrink-0"
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
														class="text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 flex items-center justify-center rounded-lg border border-dashed border-transparent px-2"
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
				method="POST" use:enhance
				action="?/createAccount"
				class="card preset-tonal-surface border-surface-500/10 h-fit space-y-4 border p-5 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconPlus class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Add Bucket
					</h2>
				</div>
				<div class="space-y-4">
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Name</span>
						<input
							class="input preset-tonal-surface"
							name="name"
							placeholder="e.g. Stripe Account, General Fund"
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Code</span>
						<input
							class="input preset-tonal-surface"
							name="code"
							placeholder="e.g. 1000, 5010"
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Type</span>
						<select class="select preset-tonal-surface" name="kind">
							<option value="expense">Money out (Expense)</option>
							<option value="income">Money in (Income)</option>
							<option value="asset">Where money lives (Asset)</option>
							<option value="liability">What we owe (Liability)</option>
							<option value="equity">Group balance (Equity)</option>
						</select>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Label group</span
						>
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
				method="POST" use:enhance
				action="?/updateBudget"
				class="card preset-tonal-surface border-surface-500/10 h-fit space-y-4 border p-5 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconBadgeDollarSign class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Set Budget
					</h2>
				</div>
				<div class="space-y-4">
					<input type="hidden" name="year" value={data.year} />
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Category</span
						>
						<select class="select preset-tonal-surface" name="accountId">
							{#each budgetAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Annual amount</span
						>
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
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Notes</span>
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Budget vs Actual
					</h2>
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
									<span
										class="text-surface-900 dark:text-surface-100 block truncate text-sm font-bold"
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
		<section class="grid gap-6 lg:grid-cols-2">
			<!-- Activity Report -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconFileText class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Activity Report
					</h2>
				</div>

				<div class="space-y-4">
					<div>
						<h3
							class="text-success-600 dark:text-success-400 mb-2 text-xs font-bold tracking-wider uppercase"
						>
							📥 Money in
						</h3>
						<div class="divide-surface-500/10 divide-y">
							{#each report.income as account}
								<div class="flex items-center justify-between py-2.5 text-sm">
									<span class="text-surface-700 dark:text-surface-300 font-medium"
										>{account.name}</span
									>
									<span class="text-success-600 dark:text-success-400 font-semibold tabular-nums"
										>{formatCents(account.period_balance_cents)}</span
									>
								</div>
							{:else}
								<p class="text-xs text-surface-500 py-2 italic">No income recorded.</p>
							{/each}
						</div>
					</div>

					<div>
						<h3
							class="text-warning-600 dark:text-warning-400 mb-2 text-xs font-bold tracking-wider uppercase"
						>
							📤 Money out
						</h3>
						<div class="divide-surface-500/10 divide-y">
							{#each report.expenses as account}
								<div class="flex items-center justify-between py-2.5 text-sm">
									<span class="text-surface-700 dark:text-surface-300 font-medium"
										>{account.name}</span
									>
									<span class="text-warning-600 dark:text-warning-400 font-semibold tabular-nums"
										>{formatCents(account.period_balance_cents)}</span
									>
								</div>
							{:else}
								<p class="text-xs text-surface-500 py-2 italic">No expenses recorded.</p>
							{/each}
						</div>
					</div>

					<div
						class="border-surface-500/20 flex items-center justify-between border-t pt-3 text-base font-bold"
					>
						<span class="text-surface-900 dark:text-surface-100">Net Activity</span>
						<span
							class="tabular-nums {report.totals?.net_cents >= 0
								? 'text-success-600 dark:text-success-400'
								: 'text-error-600 dark:text-error-400'}"
						>
							{formatCents(report.totals?.net_cents)}
						</span>
					</div>
				</div>
			</div>

			<!-- Balance Sheet / Position -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconLandmark class="text-secondary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						What We Have / Owe
					</h2>
				</div>

				<div class="space-y-4">
					<div>
						<h3 class="text-surface-500 mb-2 text-xs font-bold tracking-wider uppercase">
							💼 What we have (Assets)
						</h3>
						<div class="divide-surface-500/10 divide-y">
							{#each report.assets as account}
								<div class="flex items-center justify-between py-2.5 text-sm">
									<span class="text-surface-700 dark:text-surface-300 font-medium"
										>{account.name}</span
									>
									<span class="text-surface-900 dark:text-surface-100 font-semibold tabular-nums"
										>{formatCents(account.balance_cents)}</span
									>
								</div>
							{:else}
								<p class="text-xs text-surface-500 py-2 italic">No assets recorded.</p>
							{/each}
						</div>
					</div>

					<div>
						<h3 class="text-surface-500 mb-2 text-xs font-bold tracking-wider uppercase">
							💸 What we owe (Liabilities)
						</h3>
						<div class="divide-surface-500/10 divide-y">
							{#each report.liabilities as account}
								<div class="flex items-center justify-between py-2.5 text-sm">
									<span class="text-surface-700 dark:text-surface-300 font-medium"
										>{account.name}</span
									>
									<span class="text-error-600 dark:text-error-400 font-semibold tabular-nums"
										>{formatCents(account.balance_cents)}</span
									>
								</div>
							{:else}
								<p class="text-xs text-surface-500 py-2 italic">No liabilities recorded.</p>
							{/each}
						</div>
					</div>

					<div
						class="border-surface-500/20 flex items-center justify-between border-t pt-3 text-base font-bold"
					>
						<span class="text-surface-900 dark:text-surface-100">Net Position</span>
						<span class="text-surface-900 dark:text-surface-100 tabular-nums">
							{formatCents(report.totals?.assets_cents - report.totals?.liabilities_cents)}
						</span>
					</div>
				</div>
			</div>

			<!-- Publish Snapshot Form -->
			<form
				method="POST" use:enhance
				action="?/publishSnapshot"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm lg:col-span-2"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconUpload class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Publish Fixed Snapshot
					</h2>
				</div>

				<div class="grid gap-4 md:grid-cols-3">
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Title</span>
						<input
							class="input preset-tonal-surface"
							name="title"
							value="Financial snapshot {data.year}"
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">From</span>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="from"
							value={yearStart}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">To</span>
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
					<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
						>Snapshot Visibility Settings</span
					>
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
					<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Notes</span>
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
		</section>
	{/if}

	{#if activeTab === 'banking'}
		<section class="grid gap-6 lg:grid-cols-[380px_1fr]">
			<!-- Sidebar Controls (Sync, Manual CSV, Accounts) -->
			<div class="space-y-6">
				<!-- Connections -->
				<form
					method="POST" use:enhance
					action="?/saveConnections"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconLockKeyhole class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Connections
						</h2>
					</div>
					<div class="space-y-4">
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Mercury API key</span
							>
							<input
								class="input preset-tonal-surface"
								type="password"
								name="mercuryApiKey"
								placeholder="Stored for this group"
							/>
						</label>
						<button
							class="btn preset-filled-primary-500 flex w-full items-center justify-center gap-2 font-bold"
							type="submit"
						>
							<IconLockKeyhole class="h-4 w-4" />
							<span>Save Connections</span>
						</button>
					</div>
				</form>

				<!-- Sync Feeds -->
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconRefreshCw class="text-secondary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Sync Feeds
						</h2>
					</div>
					<div class="space-y-3">
						<button
							class="btn preset-filled-primary-500 flex w-full items-center justify-center gap-2 font-bold"
							type="button"
							disabled={financialConnectionsBusy}
							onclick={connectFinancialAccounts}
						>
							<IconLandmark class="h-4 w-4" />
							<span>{financialConnectionsBusy ? 'Opening Stripe...' : 'Connect bank or card'}</span>
						</button>

						<p
							class="text-surface-500 bg-surface-500/5 border-surface-500/5 rounded-lg border p-3 text-xs leading-relaxed"
						>
							Uses Stripe Financial Connections. Transaction access costs $0.30/month per linked
							institution account holder.
						</p>

						{#if financialConnectionsMessage}
							<p
								class="text-primary-500 bg-primary-500/10 border-primary-500/10 animate-fade rounded-lg border p-3 text-xs font-semibold"
							>
								{financialConnectionsMessage}
							</p>
						{/if}

						<div class="grid grid-cols-2 gap-2">
							<form method="POST" use:enhance action="?/syncStripe" class="w-full">
								<button
									class="btn btn-sm preset-outlined-surface-500 w-full font-semibold"
									type="submit"
								>
									Sync Stripe
								</button>
							</form>
							<form method="POST" use:enhance action="?/syncMercury" class="w-full">
								<button
									class="btn btn-sm preset-outlined-surface-500 w-full font-semibold"
									type="submit"
								>
									Sync Mercury
								</button>
							</form>
						</div>

						<form method="POST" use:enhance action="?/syncLinkedAccounts">
							<button
								class="btn btn-sm preset-outlined-primary-500 flex w-full items-center justify-center gap-2 font-semibold"
								type="submit"
							>
								<IconRefreshCw class="h-3.5 w-3.5" />
								<span>Sync linked accounts</span>
							</button>
						</form>

						<form method="POST" use:enhance action="?/autoMatch">
							<button
								class="btn preset-filled-secondary-500 flex w-full items-center justify-center gap-2 font-bold"
								type="submit"
							>
								<IconListChecks class="h-4 w-4" />
								<span>Auto-match activity</span>
							</button>
						</form>
					</div>
				</div>

				<!-- Connected Accounts List -->
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm">
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconLandmark class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Connected Accounts
						</h2>
					</div>
					<div class="space-y-2">
						{#each providerAccounts as providerAccount}
							<div
								class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 rounded-xl border p-3.5 text-sm transition-colors duration-150"
							>
								<div class="flex items-start justify-between gap-2">
									<span class="text-surface-900 dark:text-surface-100 leading-tight font-bold"
										>{providerAccount.display_name}</span
									>
									<span
										class="badge preset-outlined-surface-500 shrink-0 px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
										>{providerAccount.provider}</span
									>
								</div>
								<p class="text-surface-500 mt-1 text-xs">
									{providerAccount.account_subtype || providerAccount.account_type || 'Account'}
									{providerAccount.mask ? ` · •••• ${providerAccount.mask}` : ''}
								</p>
							</div>
						{:else}
							<p class="text-xs text-surface-500 italic py-2 text-center">
								No provider accounts synced yet.
							</p>
						{/each}
					</div>
				</div>

				<!-- Manual Bank Item -->
				<form
					method="POST" use:enhance
					action="?/addManualFeedItem"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconPlus class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Manual Bank Item
						</h2>
					</div>
					<div class="space-y-4">
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Date</span>
							<input
								class="input preset-tonal-surface"
								type="date"
								name="transactionDate"
								value={today}
								required
							/>
						</label>
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Amount</span
							>
							<input
								class="input preset-tonal-surface"
								type="number"
								step="0.01"
								name="amount"
								placeholder="-25.00 or 100.00"
								required
							/>
						</label>
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Description</span
							>
							<input
								class="input preset-tonal-surface"
								name="description"
								placeholder="Description of feed item"
								required
							/>
						</label>
						<button class="btn preset-outlined-primary-500 w-full font-semibold" type="submit">
							Add review item
						</button>
					</div>
				</form>

				<!-- Import CSV -->
				<form
					method="POST" use:enhance
					action="?/importBankCsv"
					enctype="multipart/form-data"
					class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-5 shadow-sm"
				>
					<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
						<IconUpload class="text-secondary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Import CSV
						</h2>
					</div>
					<div class="space-y-4">
						<label class="label">
							<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
								>Bank CSV</span
							>
							<input
								class="input preset-tonal-surface file:bg-surface-500/10 file:text-surface-700 hover:file:bg-surface-500/20 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-xs file:font-semibold"
								type="file"
								name="csvFile"
								accept=".csv,text/csv"
								required
							/>
						</label>
						<button
							class="btn preset-outlined-primary-500 flex w-full items-center justify-center gap-2 font-bold"
							type="submit"
						>
							<IconUpload class="h-4 w-4" />
							<span>Import for Review</span>
						</button>
					</div>
				</form>
			</div>

			<!-- Review Bank Activity workspace -->
			<div class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm">
				<div class="border-surface-500/10 flex items-center justify-between border-b pb-3">
					<div class="flex items-center gap-2">
						<IconListChecks class="text-primary-500 h-5 w-5" />
						<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
							Review Bank Activity
						</h2>
					</div>
					<span
						class="badge {needsReview.length > 0
							? 'preset-filled-warning-500'
							: 'preset-tonal-success'} font-bold"
					>
						{needsReview.length} items
					</span>
				</div>

				<div class="space-y-4">
					{#each needsReview as item}
						<form
							method="POST" use:enhance
							action="?/postFeedItem"
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/10 space-y-4 rounded-2xl border p-4 transition-all duration-150"
						>
							<input type="hidden" name="feedItemId" value={item.id} />
							<div
								class="border-surface-500/10 flex flex-wrap items-center justify-between gap-3 border-b pb-3"
							>
								<div class="min-w-0 space-y-0.5">
									<p class="text-surface-900 dark:text-surface-100 truncate text-base font-bold">
										{item.description}
									</p>
									<div class="text-surface-500 flex items-center gap-2 text-xs">
										<span>{formatDate(item.transaction_date)}</span>
										<span>•</span>
										<span class="text-[10px] font-semibold tracking-wider uppercase"
											>{item.provider}</span
										>
									</div>
								</div>
								<span
									class="text-lg font-bold tabular-nums {item.amount_cents >= 0
										? 'text-success-600 dark:text-success-400'
										: 'text-warning-600 dark:text-warning-400'}"
								>
									{item.amount_cents >= 0 ? '+' : ''}{formatCents(item.amount_cents)}
								</span>
							</div>

							<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
								<label class="label">
									<span class="text-surface-500 text-[10px] font-bold tracking-wider uppercase"
										>Post to Account</span
									>
									<select
										class="select preset-tonal-surface py-1.5 text-sm"
										name="accountId"
										required
									>
										{#each cashAccounts as account}
											<option value={account.id}>{account.name}</option>
										{/each}
									</select>
								</label>
								<label class="label">
									<span class="text-surface-500 text-[10px] font-bold tracking-wider uppercase"
										>Categorize As</span
									>
									<select
										class="select preset-tonal-surface py-1.5 text-sm"
										name="categoryAccountId"
										required
									>
										{#each item.amount_cents >= 0 ? incomeAccounts : expenseAccounts as account}
											<option value={account.id}>{account.name}</option>
										{/each}
									</select>
								</label>
								<div class="flex w-full items-end gap-2 pt-2 sm:w-auto sm:pt-0">
									<button
										class="btn btn-sm preset-filled-primary-500 flex-1 px-5 py-2 font-bold sm:flex-initial"
										type="submit"
									>
										Post
									</button>
									<button
										class="btn btn-sm preset-tonal-error px-3 py-2 font-medium"
										formaction="?/ignoreFeedItem"
										type="submit"
									>
										Ignore
									</button>
								</div>
							</div>
						</form>
					{:else}
						<div
							class="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-surface-500/20 rounded-2xl bg-surface-500/5"
						>
							<IconCheckCircle2 class="h-10 w-10 text-success-500 mb-3" />
							<h3 class="text-base font-bold text-surface-900 dark:text-surface-100">
								All caught up!
							</h3>
							<p class="text-sm text-surface-500 mt-1 max-w-sm">
								No bank transactions need review. Connect card/bank feeds or import CSV to fetch
								latest records.
							</p>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	{#if activeTab === 'advanced'}
		<section class="grid gap-6 lg:grid-cols-[1fr_360px]">
			<!-- Advanced Journal Form -->
			<form
				method="POST" use:enhance
				action="?/journal"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconBookOpen class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Advanced Journal
					</h2>
				</div>
				<input type="hidden" name="linesJson" value={journalJson} />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Date</span>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="entryDate"
							value={today}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Description</span
						>
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
							Debits: <span class="text-success-600 dark:text-success-400 font-bold"
								>{formatCents(journalDebitTotal)}</span
							>
						</div>
						<div>
							Credits: <span class="text-secondary-600 dark:text-secondary-400 font-bold"
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

			<!-- Reconcile Form -->
			<form
				method="POST" use:enhance
				action="?/completeReconciliation"
				class="card preset-tonal-surface border-surface-500/10 h-fit space-y-4 border p-5 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconRefreshCw class="text-secondary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Reconcile
					</h2>
				</div>

				<div class="space-y-4">
					<input
						type="hidden"
						name="checkedFeedItemIds"
						value={matchedItems.map((item) => item.id).join(',')}
					/>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold">Account</span
						>
						<select class="select preset-tonal-surface" name="accountId" required>
							{#each cashAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Statement ending date</span
						>
						<input
							class="input preset-tonal-surface"
							type="date"
							name="statementEndingDate"
							value={today}
							required
						/>
					</label>
					<label class="label">
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
							>Statement ending balance</span
						>
						<div class="relative">
							<span
								class="text-surface-500 absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold"
								>$</span
							>
							<input
								class="input preset-tonal-surface pl-7"
								type="number"
								step="0.01"
								name="statementEndingBalance"
								placeholder="0.00"
								required
							/>
						</div>
					</label>

					<button
						class="btn preset-filled-primary-500 flex w-full items-center justify-center gap-2 font-bold"
						type="submit"
					>
						<IconRefreshCw class="h-4 w-4" />
						<span>Save Reconciliation</span>
					</button>

					<p
						class="text-surface-500 bg-surface-500/5 border-surface-500/5 rounded-lg border p-3 text-xs leading-relaxed"
					>
						Uses <span class="text-surface-950 dark:text-surface-50 font-bold"
							>{matchedItems.length}</span
						> auto-matched bank items as checked activity.
					</p>
				</div>
			</form>
		</section>
	{/if}

	{#if activeTab === 'settings'}
		<section class="grid gap-6 lg:grid-cols-2">
			<!-- Public Defaults Form -->
			<form
				method="POST" use:enhance
				action="?/saveSettings"
				class="card preset-tonal-surface border-surface-500/10 space-y-5 border p-6 shadow-sm"
			>
				<div class="border-surface-500/10 flex items-center gap-2 border-b pb-3">
					<IconCog class="text-primary-500 h-5 w-5" />
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
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
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
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
						<span class="text-surface-600 dark:text-surface-400 text-xs font-semibold"
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Published Snapshots
					</h2>
				</div>
				<div class="space-y-3">
					{#each data.public_reports as snapshot}
						<form
							method="POST" use:enhance
							action="?/unpublishSnapshot"
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 flex items-center justify-between gap-4 rounded-xl border p-4 text-sm transition-all duration-150"
						>
							<input type="hidden" name="reportId" value={snapshot.id} />
							<div class="min-w-0 space-y-1">
								<p class="text-surface-900 dark:text-surface-100 truncate font-bold">
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Exports
					</h2>
				</div>
				<p class="text-surface-600 dark:text-surface-400 text-sm leading-relaxed">
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Receipt Review
					</h2>
				</div>
				<div class="space-y-3">
					{#each receipts.slice(0, 5) as receipt}
						<form
							method="POST" use:enhance
							action="?/reclassifyReceipt"
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 space-y-3 rounded-xl border p-4 transition-colors duration-150"
						>
							<input type="hidden" name="receiptId" value={receipt.id} />
							<div
								class="border-surface-500/10 flex items-start justify-between gap-2 border-b pb-2"
							>
								<span class="text-surface-900 dark:text-surface-100 truncate text-sm font-bold"
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
					<h2 class="text-surface-900 dark:text-surface-100 text-lg font-bold tracking-tight">
						Audit Trail
					</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each auditEvents.slice(0, 8) as event}
						<div
							class="bg-surface-500/5 hover:bg-surface-500/10 border-surface-500/5 space-y-1 rounded-xl border p-4 transition-colors duration-150"
						>
							<div class="flex items-start justify-between gap-2">
								<span class="text-surface-900 dark:text-surface-100 text-xs font-bold"
									>{event.event_type}</span
								>
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
