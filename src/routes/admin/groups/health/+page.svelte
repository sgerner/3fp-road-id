<script>
	import { formatDistanceToNow } from 'date-fns';
	import IconCircleCheck from '@lucide/svelte/icons/circle-check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import IconMoon from '@lucide/svelte/icons/moon';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconActivity from '@lucide/svelte/icons/activity';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconShare2 from '@lucide/svelte/icons/share-2';
	import IconDollarSign from '@lucide/svelte/icons/dollar-sign';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconX from '@lucide/svelte/icons/x';

	let { data } = $props();

	// State
	let searchTerm = $state('');
	let statusFilter = $state('all');
	let currentPage = $state(1);
	let pageSize = $state(24);
	let expandedGroups = $state(new Set());

	const healthData = $derived(data.healthData);
	const allGroups = $derived(healthData.groups || []);
	const totals = $derived(healthData.totals || {});

	// Filtering
	const filteredGroups = $derived(
		allGroups.filter((g) => {
			const matchesStatus = statusFilter === 'all' || g.health.status === statusFilter;
			const matchesSearch =
				!searchTerm ||
				g.group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				g.group.city?.toLowerCase().includes(searchTerm.toLowerCase());
			return matchesStatus && matchesSearch;
		})
	);

	// Pagination
	const totalPages = $derived(Math.ceil(filteredGroups.length / pageSize));
	const paginatedGroups = $derived(
		filteredGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	const STATUS_CONFIG = {
		healthy: { icon: IconCircleCheck, color: 'success', label: 'Healthy' },
		watch: { icon: IconCircleAlert, color: 'warning', label: 'Watch' },
		critical: { icon: IconTriangleAlert, color: 'error', label: 'Critical' },
		inactive: { icon: IconMoon, color: 'surface', label: 'Inactive' }
	};

	function getStatusConfig(status) {
		return STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
	}

	function formatDate(iso) {
		if (!iso) return 'Never';
		try {
			return formatDistanceToNow(new Date(iso), { addSuffix: true });
		} catch (e) {
			return 'Invalid date';
		}
	}

	function toggleStatusFilter(status) {
		if (statusFilter === status) {
			statusFilter = 'all';
		} else {
			statusFilter = status;
		}
		currentPage = 1; // Reset to page 1 on filter change
	}

	function toggleExpand(groupId) {
		if (expandedGroups.has(groupId)) {
			expandedGroups.delete(groupId);
		} else {
			expandedGroups.add(groupId);
		}
	}

	$effect(() => {
		// Reset page when search changes
		if (searchTerm) {
			currentPage = 1;
		}
	});
</script>

<svelte:head>
	<title>Group Health Dashboard | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:py-8">
	<!-- Header -->
	<header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-1">
			<h1 class="h2">Group Health Dashboard</h1>
			<p class="text-surface-800-200 flex items-center gap-2 text-sm">
				<IconActivity class="size-4" />
				Monitoring {totals.claimed_groups} claimed groups over {data.windowDays} days
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<form method="GET" class="flex items-center gap-2">
				<span class="text-surface-600-400 text-sm font-medium">Time Window:</span>
				<select
					name="window_days"
					class="select preset-tonal-surface h-10 py-0 pr-10 pl-3 text-sm"
					value={data.windowDays}
					onchange={(e) => e.target.form.submit()}
				>
					<option value="7">7 Days</option>
					<option value="30">30 Days</option>
					<option value="90">90 Days</option>
					<option value="180">180 Days</option>
					<option value="365">1 Year</option>
				</select>
			</form>

			<div class="relative w-full sm:w-64">
				<IconSearch class="text-surface-400 absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<input
					type="text"
					bind:value={searchTerm}
					placeholder="Search groups..."
					class="input preset-tonal-surface h-10 pr-10 pl-10 text-sm"
				/>
				{#if searchTerm}
					<button
						class="text-surface-400 hover:text-surface-900 dark:hover:text-surface-50 absolute top-1/2 right-3 -translate-y-1/2"
						onclick={() => (searchTerm = '')}
					>
						<IconX class="size-4" />
					</button>
				{/if}
			</div>
		</div>
	</header>

	<!-- Stats Cards -->
	<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each [{ key: 'healthy', label: 'Healthy', icon: IconCircleCheck }, { key: 'watch', label: 'Watch', icon: IconCircleAlert }, { key: 'critical', label: 'Critical', icon: IconTriangleAlert }, { key: 'inactive', label: 'Inactive', icon: IconMoon }] as stat}
			{@const count = totals[stat.key] || 0}
			{@const percent = totals.claimed_groups
				? Math.round((count / totals.claimed_groups) * 100)
				: 0}
			{@const isActive = statusFilter === stat.key}
			{@const colorClass =
				stat.key === 'healthy'
					? 'preset-tonal-success'
					: stat.key === 'watch'
						? 'preset-tonal-warning'
						: stat.key === 'critical'
							? 'preset-tonal-error'
							: 'preset-tonal-surface'}
			<button
				class="card text-left transition-all {colorClass} {isActive
					? 'ring-primary-500 ring-2'
					: 'opacity-70 grayscale-[0.5] hover:opacity-100 hover:grayscale-0'} p-4 shadow-sm"
				onclick={() => toggleStatusFilter(stat.key)}
			>
				<div class="flex items-center justify-between">
					<span class="text-surface-800-200 text-xs font-bold tracking-wider uppercase"
						>{stat.label}</span
					>
					<stat.icon class="size-5" />
				</div>
				<div class="mt-2 flex items-baseline gap-2">
					<span class="text-3xl font-bold">{count}</span>
					<span class="text-surface-700-300 text-sm">({percent}%)</span>
				</div>
				{#if isActive}
					<div class="text-primary-500 mt-2 text-[10px] font-bold tracking-widest uppercase">
						Filtering active
					</div>
				{/if}
			</button>
		{/each}
	</section>

	<!-- Filter Summary -->
	{#if statusFilter !== 'all' || searchTerm}
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium">
				Showing {filteredGroups.length} of {allGroups.length} groups
				{#if statusFilter !== 'all'}
					<span class="badge preset-tonal-primary ml-2 uppercase">{statusFilter}</span>
				{/if}
				{#if searchTerm}
					<span class="text-surface-400 ml-2">matching "{searchTerm}"</span>
				{/if}
			</p>
			<button
				class="btn btn-sm preset-tonal-surface"
				onclick={() => {
					statusFilter = 'all';
					searchTerm = '';
				}}
			>
				Clear Filters
			</button>
		</div>
	{/if}

	<!-- Warnings -->
	{#if healthData.warnings?.length}
		<div class="card preset-tonal-warning p-4">
			<p class="flex items-center gap-2 font-semibold">
				<IconCircleAlert class="size-4" />
				Data Warning
			</p>
			<ul class="text-surface-800-200 mt-2 list-inside list-disc space-y-1 text-sm">
				{#each healthData.warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Groups Grid -->
	{#if paginatedGroups.length > 0}
		<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each paginatedGroups as g (g.group.id)}
				{@const status = getStatusConfig(g.health.status)}
				{@const statusPreset =
					g.health.status === 'healthy'
						? 'preset-tonal-success'
						: g.health.status === 'watch'
							? 'preset-tonal-warning'
							: g.health.status === 'critical'
								? 'preset-tonal-error'
								: 'preset-tonal-tertiary'}
				{@const statusFilled =
					g.health.status === 'healthy'
						? 'preset-filled-success-500'
						: g.health.status === 'watch'
							? 'preset-filled-warning-500'
							: g.health.status === 'critical'
								? 'preset-filled-error-500'
								: 'preset-filled-tertiary-500'}
				{@const isExpanded = expandedGroups.has(g.group.id)}

				<article class="card preset-tonal-surface flex flex-col overflow-hidden">
					<!-- Status Header -->
					<div class="{statusPreset} p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3">
								<div
									class="{statusFilled} rounded-token flex h-10 w-10 shrink-0 items-center justify-center shadow-sm"
								>
									<status.icon class="size-5" />
								</div>
								<div>
									<p class="!mb-0 text-xs font-bold tracking-wider uppercase">{g.health.status}</p>
									<p class="!mb-0 text-2xl font-bold">{g.health.score}%</p>
								</div>
							</div>
							<a
								href="/groups/{g.group.slug}"
								target="_blank"
								class="btn preset-tonal-surface btn-sm shrink-0"
								aria-label="Open group page"
							>
								<IconExternalLink class="size-4" />
							</a>
						</div>
						<progress class="progress mt-3 w-full" value={g.health.score} max="100"></progress>
					</div>

					<!-- Group Info -->
					<div class="space-y-3 p-4">
						<div>
							<h3 class="text-lg leading-tight font-bold">{g.group.name}</h3>
							<p class="text-surface-600-400 text-sm">
								{g.group.city || 'Unknown'}{g.group.state_region ? `, ${g.group.state_region}` : ''}
							</p>
						</div>

						<!-- Health Reasons -->
						{#if g.health.reasons?.length}
							<div class="space-y-1">
								{#each isExpanded ? g.health.reasons : g.health.reasons.slice(0, 2) as reason}
									<p class="text-surface-700-300 flex items-start gap-1.5 text-xs">
										<span class="text-surface-400">•</span>
										<span>{reason}</span>
									</p>
								{/each}
								{#if g.health.reasons.length > 2}
									<button
										class="text-primary-500 cursor-pointer text-xs font-medium hover:underline"
										onclick={() => toggleExpand(g.group.id)}
									>
										{isExpanded
											? 'Show fewer issues'
											: `+${g.health.reasons.length - 2} more issues`}
									</button>
								{/if}
							</div>
						{/if}

						<!-- Activity Stats -->
						<div class="border-surface-500/10 grid grid-cols-3 gap-2 border-t pt-2">
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconBike class="size-3.5" />
									<span class="text-[10px] font-bold tracking-wider uppercase">Rides</span>
								</div>
								<p class="text-sm font-semibold">{g.activity.rides_upcoming}</p>
							</div>
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconHandHeart class="size-3.5" />
									<span class="text-[10px] font-bold tracking-wider uppercase">Volunteers</span>
								</div>
								<p class="text-sm font-semibold">{g.activity.volunteer_events_upcoming}</p>
							</div>
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconNewspaper class="size-3.5" />
									<span class="text-[10px] font-bold tracking-wider uppercase">News</span>
								</div>
								<p class="text-sm font-semibold">{g.activity.news_published_total}</p>
							</div>
						</div>

						<!-- Social & Monetization -->
						<div
							class="border-surface-500/10 flex items-center justify-between gap-2 border-t pt-3"
						>
							<div class="flex items-center gap-3">
								<div class="flex items-center gap-1" title="Social accounts">
									<IconShare2
										class="size-3.5 {g.social.accounts_active > 0
											? 'text-primary-500'
											: 'text-surface-400'}"
									/>
									<span
										class="text-xs {g.social.accounts_active > 0
											? 'font-medium'
											: 'text-surface-400'}"
									>
										{g.social.accounts_active}/{g.social.accounts_connected}
									</span>
								</div>
								{#if g.social.posts_failed_in_window > 0}
									<span class="badge preset-tonal-error px-1.5 py-0 text-[10px]">
										{g.social.posts_failed_in_window} failed
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1" title="Donations">
								<IconDollarSign
									class="size-3.5 {g.monetization.donations_connected
										? 'text-success-500'
										: 'text-surface-400'}"
								/>
								<span
									class="text-xs {g.monetization.donations_connected
										? 'text-success-500 font-medium'
										: 'text-surface-400'}"
								>
									{g.monetization.donations_connected ? 'Stripe Connect' : 'No Stripe'}
								</span>
							</div>
						</div>

						<!-- Microsite -->
						<div class="border-surface-500/10 flex items-center justify-between border-t pt-3">
							<div class="flex items-center gap-1.5">
								<IconGlobe
									class="size-3.5 {g.microsite.config_published
										? 'text-success-500'
										: 'text-surface-400'}"
								/>
								<span
									class="text-sm {g.microsite.config_published
										? 'text-success-500 font-medium'
										: 'text-surface-400'}"
								>
									{g.microsite.config_published ? 'Microsite Published' : 'No Microsite'}
								</span>
							</div>
						</div>

						<!-- Members & Last Activity -->
						<div
							class="border-surface-500/10 flex items-center justify-between gap-2 border-t pt-3"
						>
							<div class="flex items-center gap-1.5">
								<IconUsers class="text-primary-500 size-4" />
								{#if g.membership.program_enabled}
									<span class="font-bold">{g.membership.active_members}</span>
									<span class="text-surface-400 text-xs font-bold tracking-wider uppercase"
										>members</span
									>
									{#if g.membership.pending_applications > 0}
										<span class="badge preset-tonal-warning px-1.5 py-0 text-[10px]"
											>{g.membership.pending_applications} apps</span
										>
									{/if}
								{:else}
									<span class="text-surface-400 text-xs italic">Membership disabled</span>
								{/if}
							</div>
						</div>

						<!-- Last Activity -->
						<div class="border-surface-500/10 flex items-center justify-between border-t pt-3">
							<div class="text-surface-400 flex items-center gap-1.5">
								<IconCalendar class="size-3.5" />
								<span class="text-xs font-bold tracking-wider uppercase">Active</span>
							</div>
							<div class="text-right">
								<span class="text-sm font-medium">{formatDate(g.signals.last_activity_at)}</span>
								{#if g.signals.days_since_last_activity !== null}
									<p class="text-surface-400 text-[10px] font-bold tracking-widest uppercase">
										{g.signals.days_since_last_activity} days ago
									</p>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
		</section>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="card preset-tonal-surface mt-8 flex items-center justify-between p-4">
				<div class="flex items-center gap-4">
					<span class="text-surface-600-400 text-sm font-medium">
						Showing {(currentPage - 1) * pageSize + 1} to {Math.min(
							currentPage * pageSize,
							filteredGroups.length
						)} of {filteredGroups.length} groups
					</span>
					<select bind:value={pageSize} class="select h-8 w-24 py-0 pr-8 pl-2 text-xs">
						<option value={12}>12 / page</option>
						<option value={24}>24 / page</option>
						<option value={48}>48 / page</option>
						<option value={96}>96 / page</option>
					</select>
				</div>

				<div class="flex items-center gap-2">
					<button
						class="btn btn-sm preset-tonal-surface"
						disabled={currentPage === 1}
						onclick={() => (currentPage -= 1)}
					>
						<IconChevronLeft class="size-4" />
						<span>Prev</span>
					</button>

					<div class="flex items-center gap-1">
						{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
							if (totalPages <= 5) return i + 1;
							if (currentPage <= 3) return i + 1;
							if (currentPage >= totalPages - 2) return totalPages - 4 + i;
							return currentPage - 2 + i;
						}) as pageNum}
							<button
								class="btn btn-sm {currentPage === pageNum
									? 'preset-filled-primary-500'
									: 'preset-tonal-surface'}"
								onclick={() => (currentPage = pageNum)}
							>
								{pageNum}
							</button>
						{/each}
					</div>

					<button
						class="btn btn-sm preset-tonal-surface"
						disabled={currentPage === totalPages}
						onclick={() => (currentPage += 1)}
					>
						<span>Next</span>
						<IconChevronRight class="size-4" />
					</button>
				</div>
			</div>
		{/if}
	{:else}
		<div class="card preset-tonal-surface p-12 text-center">
			<IconActivity class="mx-auto size-12 opacity-20" />
			<p class="text-surface-500 mt-3 text-lg font-medium">No groups found</p>
			<p class="text-surface-400 text-sm">Try adjusting your filters or search terms.</p>
			{#if searchTerm || statusFilter !== 'all'}
				<button
					class="btn preset-filled-primary-500 mt-4"
					onclick={() => {
						searchTerm = '';
						statusFilter = 'all';
					}}
				>
					Clear All Filters
				</button>
			{/if}
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-surface-500/10 border-t pt-8 text-center">
		<p class="text-surface-500 text-[10px] font-bold tracking-[0.2em] uppercase">
			Data current as of {new Date(healthData.generated_at).toLocaleString()}
		</p>
	</footer>
</div>
