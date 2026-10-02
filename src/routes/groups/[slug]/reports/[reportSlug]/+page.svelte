<script>
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconWallet from '@lucide/svelte/icons/wallet';
	import IconTrendingUp from '@lucide/svelte/icons/trending-up';
	import IconTrendingDown from '@lucide/svelte/icons/trending-down';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';

	let { data } = $props();

	const report = $derived(data.report ?? null);
	const snapshot = $derived(report?.snapshot ?? {});
	const financial = $derived(snapshot.report ?? {});
	const budgets = $derived(Array.isArray(snapshot.budgets) ? snapshot.budgets : []);
	const retainedActivityCents = $derived(
		Number(financial.totals?.equity_cents || 0) -
			(financial.equity ?? []).reduce((sum, account) => sum + Number(account.balance_cents || 0), 0)
	);
	const visibility = $derived(report?.visibility ?? {});
	const positionCards = $derived([
		{
			title: 'What We Have',
			accounts: financial.assets ?? [],
			total: financial.totals?.assets_cents
		},
		{
			title: 'What We Owe',
			accounts: financial.liabilities ?? [],
			total: financial.totals?.liabilities_cents
		},
		{
			title: 'Equity',
			accounts: financial.equity ?? [],
			total: financial.totals?.equity_cents
		}
	]);
	const spendingAccounts = $derived(
		(financial.expenses ?? [])
			.filter((account) => Number(account.period_balance_cents) !== 0)
			.sort((left, right) => Number(right.period_balance_cents) - Number(left.period_balance_cents))
	);
	const visibleSummaryCards = $derived(
		(visibility.cash !== false ? 1 : 0) + (visibility.activity !== false ? 2 : 0)
	);
	const summaryColumns = $derived(
		visibleSummaryCards >= 3
			? 'md:grid-cols-3'
			: visibleSummaryCards === 2
				? 'md:grid-cols-2 max-w-2xl'
				: 'max-w-xl'
	);

	function formatCents(cents, currency = financial.currency || snapshot.currency || 'usd') {
		const numericCents = Number(cents);
		if (!Number.isFinite(numericCents)) return '—';
		const amount = numericCents / 100;
		try {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: String(currency || 'usd').toUpperCase()
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
</script>

<svelte:head>
	<title>{report?.title ?? 'Financial Report'} | {data.group?.name ?? 'Group'}</title>
</svelte:head>

<main class="mx-auto max-w-4xl space-y-6 px-4 py-8">
	{#if data.error}
		<section
			class="card border-error-500/30 bg-error-500/10 flex items-center gap-3 rounded-xl p-6"
		>
			<IconAlertCircle class="text-error-500 h-6 w-6 shrink-0" />
			<div>
				<h3 class="text-error-500 text-lg font-bold">Report Unavailable</h3>
				<p class="mt-1 text-sm opacity-85">{data.error}</p>
			</div>
		</section>
	{:else}
		<nav class="flex items-center gap-2 text-sm">
			<a
				class="btn preset-tonal-surface btn-sm flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
				href="/groups/{data.group.slug}"
			>
				<IconArrowLeft class="h-3.5 w-3.5" />
				Back to {data.group.name}
			</a>
		</nav>

		<header
			class="card preset-tonal-surface border-surface-200-800/40 flex flex-col gap-4 rounded-xl border p-6 md:flex-row md:items-center md:justify-between"
		>
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					{#if data.group.logo_url}
						<img
							src={data.group.logo_url}
							alt={data.group.name}
							class="border-surface-200-800/40 h-8 w-8 rounded-md border object-cover"
						/>
					{/if}
					<span class="text-surface-600-400 text-xs font-bold tracking-wider uppercase"
						>{data.group.name}</span
					>
				</div>
				<h1 class="text-2xl font-black tracking-tight md:text-3xl">{report.title}</h1>
				<div class="text-surface-600-400 flex flex-wrap items-center gap-2 text-sm">
					<IconCalendar class="h-4 w-4 shrink-0" />
					<span
						>Period: <strong>{formatDate(report.report_period_start)}</strong> to
						<strong>{formatDate(report.report_period_end)}</strong></span
					>
				</div>
			</div>
			<div
				class="flex shrink-0 flex-col items-start gap-2 sm:flex-row md:flex-col md:items-end md:text-right"
			>
				<span
					class="badge preset-filled-primary-500 px-3 py-1 text-xs font-bold tracking-wider uppercase"
				>
					Published Snapshot
				</span>
				<span class="text-surface-600-400 text-xs font-medium">Public Financial Report</span>
			</div>
		</header>

		{#if visibility.cash !== false || visibility.activity !== false}
			<section class="grid gap-4 {summaryColumns}">
				{#if visibility.cash !== false}
					<div
						class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm transition-transform duration-200 hover:scale-[1.01]"
					>
						<div class="flex items-start justify-between">
							<div class="space-y-1">
								<p class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
									Net position
								</p>
								<p class="text-primary-500 text-3xl font-black tracking-tight">
									{formatCents(
										(financial.totals?.assets_cents || 0) -
											(financial.totals?.liabilities_cents || 0)
									)}
								</p>
							</div>
							<div class="preset-tonal-primary rounded-lg p-2">
								<IconWallet class="text-primary-500 h-5 w-5" />
							</div>
						</div>
						<p class="text-surface-600-400 mt-2 text-xs leading-normal">
							Assets minus liabilities as of the end of this report period.
						</p>
					</div>
				{/if}

				{#if visibility.activity !== false}
					<div
						class="card preset-tonal-success border-success-200-800/40 rounded-xl border p-5 shadow-sm transition-transform duration-200 hover:scale-[1.01]"
					>
						<div class="flex items-start justify-between">
							<div class="space-y-1">
								<p class="text-success-600-400 text-xs font-bold tracking-wider uppercase">
									Money in
								</p>
								<p class="text-success-500 text-3xl font-black tracking-tight">
									{formatCents(financial.totals?.income_cents)}
								</p>
							</div>
							<div class="preset-tonal-success rounded-lg p-2">
								<IconTrendingUp class="text-success-500 h-5 w-5" />
							</div>
						</div>
						<p class="text-surface-600-400 mt-2 text-xs leading-normal">
							Total income received during this report period.
						</p>
					</div>

					<div
						class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm transition-transform duration-200 hover:scale-[1.01]"
					>
						<div class="flex items-start justify-between">
							<div class="space-y-1">
								<p class="text-error-500 text-xs font-bold tracking-wider uppercase">Money out</p>
								<p class="text-error-500 text-3xl font-black tracking-tight">
									{formatCents(financial.totals?.expense_cents)}
								</p>
							</div>
							<div class="preset-tonal-surface rounded-lg p-2">
								<IconTrendingDown class="text-error-500 h-5 w-5" />
							</div>
						</div>
						<p class="text-surface-600-400 mt-2 text-xs leading-normal">
							Total expenses and spending paid during this period.
						</p>
					</div>
				{/if}
			</section>
		{/if}

		{#if visibility.position !== false || visibility.activity !== false}
			<section
				class="grid gap-6 {visibility.position !== false && visibility.activity !== false
					? 'md:grid-cols-2'
					: visibility.position !== false
						? 'md:grid-cols-3'
						: 'max-w-2xl'}"
			>
				{#if visibility.position !== false}
					{#each positionCards as card}
						<div
							class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm"
						>
							<h2
								class="text-primary-500 border-surface-200-800/20 mb-4 flex items-center gap-2 border-b pb-2 text-base font-bold"
							>
								<IconWallet class="h-5 w-5" />
								<span>{card.title}</span>
							</h2>
							<div class="divide-surface-200-800/10 space-y-2 divide-y">
								{#each card.accounts.filter((account) => Number(account.balance_cents) !== 0) as account}
									<div
										class="hover:bg-surface-500/5 flex items-center justify-between gap-3 rounded px-2 py-1 pt-2 text-sm transition-colors duration-150"
									>
										<span class="text-surface-800-200 font-medium">{account.name}</span>
										<span class="text-surface-950-50 font-bold"
											>{formatCents(account.balance_cents)}</span
										>
									</div>
								{:else}
									<p class="text-surface-600-400 py-6 text-center text-sm italic">
										No {card.title.toLowerCase()} balances in this snapshot.
									</p>
								{/each}
								{#if card.title === 'Equity' && retainedActivityCents !== 0}
									<div
										class="flex items-center justify-between gap-3 rounded px-2 py-1 pt-2 text-sm"
									>
										<span class="text-surface-800-200 font-medium">Retained activity</span>
										<span class="text-surface-950-50 font-bold"
											>{formatCents(retainedActivityCents)}</span
										>
									</div>
								{/if}
							</div>
							<div
								class="border-surface-200-800/20 mt-3 flex items-center justify-between border-t pt-3 text-sm font-bold"
							>
								<span>Total</span>
								<span>{formatCents(card.total)}</span>
							</div>
						</div>
					{/each}
				{/if}
				{#if visibility.activity !== false}
					<div
						class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm"
					>
						<h2
							class="text-error-500 border-surface-200-800/20 mb-4 flex items-center gap-2 border-b pb-2 text-base font-bold"
						>
							<IconTrendingDown class="h-5 w-5" />
							<span>Spending by Category</span>
						</h2>
						<div class="divide-surface-200-800/10 space-y-2 divide-y">
							{#each spendingAccounts as account}
								<div
									class="hover:bg-surface-500/5 flex items-center justify-between gap-3 rounded px-2 py-1 pt-2 text-sm transition-colors duration-150"
								>
									<span class="text-surface-800-200 font-medium">{account.name}</span>
									<span class="text-surface-950-50 font-bold"
										>{formatCents(account.period_balance_cents)}</span
									>
								</div>
							{:else}
								<p class="text-surface-600-400 py-6 text-center text-sm italic">
									No spending or refunds recorded in this snapshot.
								</p>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}

		{#if visibility.budgets === true}
			<section
				class="card preset-tonal-surface border-surface-200-800/40 space-y-4 rounded-xl border p-5 shadow-sm"
			>
				<div
					class="border-surface-200-800/20 flex items-center justify-between gap-3 border-b pb-2"
				>
					<h2 class="text-base font-bold">Published Budgets</h2>
					<span class="text-surface-500 text-xs">Annual limits</span>
				</div>
				<div class="divide-surface-200-800/10 divide-y">
					{#each budgets as budget}
						<div class="flex items-center justify-between gap-3 py-2 text-sm">
							<span class="min-w-0 truncate font-medium">{budget.account?.name ?? 'Budget'}</span>
							<span class="shrink-0 font-bold tabular-nums">{formatCents(budget.amount_cents)}</span
							>
						</div>
					{:else}
						<p class="py-4 text-center text-sm opacity-60">
							No budgets were included in this snapshot.
						</p>
					{/each}
				</div>
			</section>
		{/if}

		{#if visibility.notes !== false && report.notes}
			<section
				class="card preset-tonal-surface border-surface-200-800/40 space-y-3 rounded-xl border p-6"
			>
				<div
					class="text-primary-500 border-surface-200-800/20 flex items-center gap-2 border-b pb-2 font-bold"
				>
					<IconFileText class="h-5 w-5" />
					<h3 class="text-base">Publisher's Notes</h3>
				</div>
				<p class="text-surface-800-200 text-sm leading-relaxed whitespace-pre-wrap">
					{report.notes}
				</p>
			</section>
		{/if}
	{/if}
</main>
