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
	const visibility = $derived(report?.visibility ?? {});

	function formatCents(cents, currency = 'usd') {
		const amount = Number(cents || 0) / 100;
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
					Verified Snapshot
				</span>
				<span class="text-surface-600-400 text-xs font-medium">Public Financial Report</span>
			</div>
		</header>

		<section
			class="grid gap-4 {visibility.cash !== false && visibility.activity !== false
				? 'md:grid-cols-3'
				: visibility.cash !== false || visibility.activity !== false
					? 'max-w-2xl sm:grid-cols-2'
					: 'grid-cols-1'}"
		>
			{#if visibility.cash !== false}
				<div
					class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm transition-transform duration-200 hover:scale-[1.01]"
				>
					<div class="flex items-start justify-between">
						<div class="space-y-1">
							<p class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
								Cash position
							</p>
							<p class="text-primary-500 text-3xl font-black tracking-tight">
								{formatCents(
									(financial.totals?.assets_cents || 0) - (financial.totals?.liabilities_cents || 0)
								)}
							</p>
						</div>
						<div class="preset-tonal-primary rounded-lg p-2">
							<IconWallet class="text-primary-500 h-5 w-5" />
						</div>
					</div>
					<p class="text-surface-600-400 mt-2 text-xs leading-normal">
						Total cash and assets currently held minus liabilities.
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
					class="card preset-tonal-error border-error-200-800/40 rounded-xl border p-5 shadow-sm transition-transform duration-200 hover:scale-[1.01]"
				>
					<div class="flex items-start justify-between">
						<div class="space-y-1">
							<p class="text-error-600-400 text-xs font-bold tracking-wider uppercase">Money out</p>
							<p class="text-error-500 text-3xl font-black tracking-tight">
								{formatCents(financial.totals?.expense_cents)}
							</p>
						</div>
						<div class="preset-tonal-error rounded-lg p-2">
							<IconTrendingDown class="text-error-500 h-5 w-5" />
						</div>
					</div>
					<p class="text-surface-600-400 mt-2 text-xs leading-normal">
						Total expenses and spending paid during this period.
					</p>
				</div>
			{/if}
		</section>

		{#if visibility.position !== false}
			<section class="grid gap-6 md:grid-cols-2">
				<div
					class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm"
				>
					<h2
						class="border-surface-200-800/20 text-primary-500 mb-4 flex items-center gap-2 border-b pb-2 text-base font-bold"
					>
						<IconWallet class="h-5 w-5" />
						<span>What We Have</span>
					</h2>
					<div class="divide-surface-200-800/10 space-y-2 divide-y">
						{#each (financial.assets ?? []).filter((account) => account.balance_cents !== 0) as account}
							<div
								class="hover:bg-surface-500/5 flex items-center justify-between gap-3 rounded px-2 py-1 pt-2 text-sm transition-colors duration-150"
							>
								<span class="text-surface-800-200 font-medium">{account.name}</span>
								<span class="text-surface-950-50 font-bold"
									>{formatCents(account.balance_cents)}</span
								>
							</div>
						{:else}
							<p class="text-sm text-surface-600-400 py-6 text-center italic">
								No active asset balances in this snapshot.
							</p>
						{/each}
					</div>
				</div>

				<div
					class="card preset-tonal-surface border-surface-200-800/40 rounded-xl border p-5 shadow-sm"
				>
					<h2
						class="border-surface-200-800/20 text-error-500 mb-4 flex items-center gap-2 border-b pb-2 text-base font-bold"
					>
						<IconTrendingDown class="h-5 w-5" />
						<span>Activity / Spending</span>
					</h2>
					<div class="divide-surface-200-800/10 space-y-2 divide-y">
						{#each (financial.expenses ?? []).filter((account) => account.period_balance_cents > 0) as account}
							<div
								class="hover:bg-surface-500/5 flex items-center justify-between gap-3 rounded px-2 py-1 pt-2 text-sm transition-colors duration-150"
							>
								<span class="text-surface-800-200 font-medium">{account.name}</span>
								<span class="text-surface-950-50 font-bold"
									>{formatCents(account.period_balance_cents)}</span
								>
							</div>
						{:else}
							<p class="text-sm text-surface-600-400 py-6 text-center italic">
								No spending recorded in this snapshot.
							</p>
						{/each}
					</div>
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
