<script>
	import { formatDistanceToNow } from 'date-fns';
	import { slide } from 'svelte/transition';
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
	import AdminHero from '#lib/components/admin/AdminHero.svelte';
	import AdminNotice from '#lib/components/admin/AdminNotice.svelte';

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

	// Full class names so Tailwind can see them. `field` is the solid color a status takes over.
	const STATUS_CONFIG = {
		healthy: {
			icon: IconCircleCheck,
			label: 'Healthy',
			marker: 'bg-success-500',
			field: 'bg-success-500 text-surface-950'
		},
		watch: {
			icon: IconCircleAlert,
			label: 'Watch',
			marker: 'bg-warning-500',
			field: 'bg-warning-500 text-surface-950'
		},
		critical: {
			icon: IconTriangleAlert,
			label: 'Critical',
			marker: 'bg-error-500',
			field: 'bg-error-500 text-surface-950'
		},
		inactive: {
			icon: IconMoon,
			label: 'Inactive',
			marker: 'bg-surface-400',
			field: 'bg-surface-400 text-surface-950'
		}
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
		expandedGroups = new Set(expandedGroups);
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

<AdminHero eyebrow="Groups" title="Group Health Dashboard">
	Monitoring {totals.claimed_groups} claimed groups over {data.windowDays} days
</AdminHero>

<!-- FILTERS -->
<section
	class="bg-surface-900 border-surface-800 border-b-2 px-6 py-5 sm:px-10 lg:px-14"
	aria-label="Group filters"
>
	<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
		<form method="GET" class="flex items-center gap-3">
			<label
				for="group-health-window"
				class="text-surface-300 text-xs font-bold tracking-[0.18em] whitespace-nowrap uppercase"
			>
				Time window
			</label>
			<select
				name="window_days"
				id="group-health-window"
				class="select h-10 py-0 pr-10 pl-3 text-sm"
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

		<div class="relative w-full sm:w-72">
			<IconSearch
				class="text-surface-300 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<input
				type="text"
				aria-label="Search groups"
				bind:value={searchTerm}
				placeholder="Search groups..."
				class="input h-10 pr-10 pl-10 text-sm"
			/>
			{#if searchTerm}
				<button
					class="text-surface-300 hover:text-primary-500 absolute top-1/2 right-3 -translate-y-1/2"
					type="button"
					aria-label="Clear group search"
					onclick={() => (searchTerm = '')}
				>
					<IconX class="size-4" />
				</button>
			{/if}
		</div>
	</div>
</section>

<!-- STATUS FILTER BAND -->
<section class="overflow-hidden" aria-label="Filter by health status">
	<div class="-ml-0.5 grid sm:grid-cols-2 lg:grid-cols-4">
		{#each Object.entries(STATUS_CONFIG) as [key, stat] (key)}
			{@const count = totals[key] || 0}
			{@const percent = totals.claimed_groups
				? Math.round((count / totals.claimed_groups) * 100)
				: 0}
			{@const isActive = statusFilter === key}
			<button
				type="button"
				aria-pressed={isActive}
				class="border-surface-800 flex cursor-pointer flex-col gap-4 border-b-2 border-l-2 px-6 py-6 text-left transition sm:px-8 {isActive
					? stat.field
					: 'bg-surface-950 hover:bg-surface-900'}"
				onclick={() => toggleStatusFilter(key)}
			>
				<span class="flex items-center justify-between gap-3">
					<span class="flex items-center gap-2.5 text-xs font-bold tracking-[0.22em] uppercase">
						<span class="{isActive ? 'bg-surface-950' : stat.marker} h-2.5 w-2.5" aria-hidden="true"
						></span>
						{stat.label}
					</span>
					<stat.icon class="size-5" aria-hidden="true" />
				</span>
				<span class="flex items-baseline gap-3">
					<span class="text-5xl leading-none font-black italic tabular-nums">{count}</span>
					<span class="text-sm font-bold {isActive ? '' : 'text-surface-300'}">({percent}%)</span>
				</span>
				{#if isActive}
					<span class="text-xs font-black tracking-[0.2em] uppercase">Filtering active</span>
				{/if}
			</button>
		{/each}
	</div>
</section>

{#if statusFilter !== 'all' || searchTerm}
	<section
		class="bg-surface-900 border-surface-800 flex flex-wrap items-center justify-between gap-3 border-b-2 px-6 py-4 sm:px-10 lg:px-14"
		aria-label="Active filters"
	>
		<p class="m-0 flex flex-wrap items-center gap-3 text-sm font-bold">
			Showing {filteredGroups.length} of {allGroups.length} groups
			{#if statusFilter !== 'all'}
				<span
					class="bg-primary-500 text-surface-950 px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
				>
					{statusFilter}
				</span>
			{/if}
			{#if searchTerm}
				<span class="text-surface-300 font-medium">matching "{searchTerm}"</span>
			{/if}
		</p>
		<button
			class="btn btn-sm preset-outlined-surface-500"
			type="button"
			onclick={() => {
				statusFilter = 'all';
				searchTerm = '';
			}}
		>
			Clear Filters
		</button>
	</section>
{/if}

{#if healthData.warnings?.length}
	<div class="px-6 pt-6 sm:px-10 lg:px-14">
		<AdminNotice tone="warning" title="Data Warning">
			<ul class="m-0 mt-1 list-inside list-disc space-y-1 p-0">
				{#each healthData.warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		</AdminNotice>
	</div>
{/if}

{#if paginatedGroups.length > 0}
	<!-- GROUP TILES: hairlines between tiles, no cards -->
	<section class="border-surface-800 mt-6 overflow-hidden border-t-2" aria-label="Groups">
		<div class="-ml-0.5 grid md:grid-cols-2 xl:grid-cols-3">
			{#each paginatedGroups as g (g.group.id)}
				{@const status = getStatusConfig(g.health.status)}
				{@const isExpanded = expandedGroups.has(g.group.id)}

				<article class="border-surface-800 flex flex-col border-b-2 border-l-2">
					<!-- Status strip -->
					<div class="{status.field} flex flex-col gap-3 px-5 py-4">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3">
								<status.icon class="size-6 shrink-0" aria-hidden="true" />
								<div>
									<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">
										{g.health.status}
									</p>
									<p class="m-0 text-3xl leading-none font-black italic tabular-nums">
										{g.health.score}%
									</p>
								</div>
							</div>
							<a
								href="/groups/{g.group.slug}"
								target="_blank"
								class="bg-surface-950 text-surface-50 hover:bg-surface-800 flex size-9 shrink-0 items-center justify-center transition"
								aria-label="Open {g.group.name} group page"
							>
								<IconExternalLink class="size-4" />
							</a>
						</div>
						<div
							class="bg-surface-950 h-2 w-full"
							role="progressbar"
							aria-label="Health score"
							aria-valuenow={g.health.score}
							aria-valuemin="0"
							aria-valuemax="100"
						>
							<div
								class="bg-surface-50 h-full"
								style="width: {Math.min(100, Math.max(0, g.health.score))}%"
							></div>
						</div>
					</div>

					<!-- Group info -->
					<div class="flex flex-1 flex-col gap-4 px-5 py-5">
						<div>
							<h2 class="m-0 text-xl leading-tight">{g.group.name}</h2>
							<p class="text-surface-300 m-0 text-sm">
								{g.group.city || 'Unknown'}{g.group.state_region ? `, ${g.group.state_region}` : ''}
							</p>
						</div>

						{#if g.health.reasons?.length}
							<ul class="m-0 flex list-none flex-col gap-1.5 p-0">
								{#each g.health.reasons.slice(0, 2) as reason}
									<li class="text-surface-300 flex items-start gap-2 text-sm">
										<span class="bg-surface-500 mt-1.5 h-1.5 w-1.5 shrink-0" aria-hidden="true"
										></span>
										<span>{reason}</span>
									</li>
								{/each}

								{#if isExpanded}
									<li transition:slide={{ duration: 200 }}>
										<ul class="m-0 flex list-none flex-col gap-1.5 p-0">
											{#each g.health.reasons.slice(2) as reason}
												<li class="text-surface-300 flex items-start gap-2 text-sm">
													<span
														class="bg-surface-500 mt-1.5 h-1.5 w-1.5 shrink-0"
														aria-hidden="true"
													></span>
													<span>{reason}</span>
												</li>
											{/each}
										</ul>
									</li>
								{/if}
							</ul>

							{#if g.health.reasons.length > 2}
								<button
									class="text-primary-500 cursor-pointer self-start text-xs font-black tracking-[0.14em] uppercase hover:underline"
									type="button"
									aria-expanded={isExpanded}
									onclick={() => toggleExpand(g.group.id)}
								>
									{isExpanded ? 'Show fewer issues' : `+${g.health.reasons.length - 2} more issues`}
								</button>
							{/if}
						{/if}

						<!-- Activity -->
						<div
							class="border-surface-800 divide-surface-800 grid grid-cols-3 divide-x border-t pt-4"
						>
							{#each [{ label: 'Rides', icon: IconBike, value: g.activity.rides_upcoming }, { label: 'Volunteers', icon: IconHandHeart, value: g.activity.volunteer_events_upcoming }, { label: 'News', icon: IconNewspaper, value: g.activity.news_published_total }] as item (item.label)}
								<div class="flex flex-col items-center gap-1 px-1">
									<span
										class="text-surface-300 flex items-center gap-1 text-[0.65rem] font-bold tracking-[0.16em] uppercase"
									>
										<item.icon class="size-3.5" aria-hidden="true" />
										{item.label}
									</span>
									<span class="text-xl leading-none font-black italic tabular-nums">
										{item.value}
									</span>
								</div>
							{/each}
						</div>

						<!-- Social & donations -->
						<div class="border-surface-800 flex items-center justify-between gap-2 border-t pt-4">
							<div class="flex items-center gap-3">
								<div class="flex items-center gap-1.5" title="Social accounts">
									<IconShare2
										class="size-4 {g.social.accounts_active > 0
											? 'text-primary-500'
											: 'text-surface-400'}"
									/>
									<span
										class="text-sm {g.social.accounts_active > 0
											? 'font-bold'
											: 'text-surface-400'}"
									>
										{g.social.accounts_active}/{g.social.accounts_connected}
									</span>
								</div>
								{#if g.social.posts_failed_in_window > 0}
									<span
										class="bg-error-500 text-surface-950 px-1.5 py-0.5 text-xs font-black tracking-wide uppercase"
									>
										{g.social.posts_failed_in_window} failed
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1.5" title="Donations">
								<IconDollarSign
									class="size-4 {g.monetization.donations_connected
										? 'text-success-500'
										: 'text-surface-400'}"
								/>
								<span
									class="text-sm {g.monetization.donations_connected
										? 'text-success-500 font-bold'
										: 'text-surface-400'}"
								>
									{g.monetization.donations_connected ? 'Stripe Connect' : 'No Stripe'}
								</span>
							</div>
						</div>

						<!-- Microsite -->
						<div class="border-surface-800 flex items-center gap-1.5 border-t pt-4">
							<IconGlobe
								class="size-4 {g.microsite.config_published
									? 'text-success-500'
									: 'text-surface-400'}"
							/>
							<span
								class="text-sm {g.microsite.config_published
									? 'text-success-500 font-bold'
									: 'text-surface-400'}"
							>
								{g.microsite.config_published ? 'Microsite Published' : 'No Microsite'}
							</span>
						</div>

						<!-- Members -->
						<div class="border-surface-800 flex items-center gap-2 border-t pt-4">
							<IconUsers class="text-primary-500 size-4" />
							{#if g.membership.program_enabled}
								<span class="font-black">{g.membership.active_members}</span>
								<span class="text-surface-300 text-xs font-bold tracking-[0.16em] uppercase"
									>members</span
								>
								{#if g.membership.pending_applications > 0}
									<span
										class="bg-warning-500 text-surface-950 px-1.5 py-0.5 text-xs font-black tracking-wide uppercase"
									>
										{g.membership.pending_applications} apps
									</span>
								{/if}
							{:else}
								<span class="text-surface-400 text-sm italic">Membership disabled</span>
							{/if}
						</div>

						<!-- Last activity -->
						<div class="border-surface-800 flex items-center justify-between gap-2 border-t pt-4">
							<div class="text-surface-300 flex items-center gap-1.5">
								<IconCalendar class="size-4" />
								<span class="text-xs font-bold tracking-[0.16em] uppercase">Active</span>
							</div>
							<div class="text-right">
								<span class="text-sm font-bold">{formatDate(g.signals.last_activity_at)}</span>
								{#if g.signals.days_since_last_activity !== null}
									<p
										class="text-surface-300 m-0 text-[0.65rem] font-bold tracking-[0.16em] uppercase"
									>
										{g.signals.days_since_last_activity} days ago
									</p>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	{#if totalPages > 1}
		<nav
			class="bg-surface-900 border-surface-800 flex flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-5 sm:px-10 lg:px-14"
			aria-label="Group pages"
		>
			<div class="flex flex-wrap items-center gap-4">
				<span class="text-surface-300 text-sm font-medium">
					Showing {(currentPage - 1) * pageSize + 1} to {Math.min(
						currentPage * pageSize,
						filteredGroups.length
					)} of {filteredGroups.length} groups
				</span>
				<select
					aria-label="Groups per page"
					bind:value={pageSize}
					class="select h-8 w-28 py-0 pr-8 pl-2 text-xs"
				>
					<option value={12}>12 / page</option>
					<option value={24}>24 / page</option>
					<option value={48}>48 / page</option>
					<option value={96}>96 / page</option>
				</select>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<button
					class="btn btn-sm preset-outlined-surface-500"
					type="button"
					disabled={currentPage === 1}
					onclick={() => (currentPage -= 1)}
				>
					<IconChevronLeft class="size-4" />
					<span>Prev</span>
				</button>

				{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
					if (totalPages <= 5) return i + 1;
					if (currentPage <= 3) return i + 1;
					if (currentPage >= totalPages - 2) return totalPages - 4 + i;
					return currentPage - 2 + i;
				}) as pageNum}
					<button
						class="btn btn-sm {currentPage === pageNum
							? 'preset-filled-primary-500'
							: 'preset-outlined-surface-500'}"
						type="button"
						aria-current={currentPage === pageNum ? 'page' : undefined}
						onclick={() => (currentPage = pageNum)}
					>
						{pageNum}
					</button>
				{/each}

				<button
					class="btn btn-sm preset-outlined-surface-500"
					type="button"
					disabled={currentPage === totalPages}
					onclick={() => (currentPage += 1)}
				>
					<span>Next</span>
					<IconChevronRight class="size-4" />
				</button>
			</div>
		</nav>
	{/if}
{:else}
	<section
		class="border-surface-800 flex flex-col items-center gap-2 border-b-2 px-6 py-20 text-center"
		aria-label="No groups found"
	>
		<IconActivity class="text-surface-400 size-12" aria-hidden="true" />
		<p class="m-0 mt-2 text-xl font-black uppercase">No groups found</p>
		<p class="text-surface-300 m-0 text-sm">Try adjusting your filters or search terms.</p>
		{#if searchTerm || statusFilter !== 'all'}
			<button
				class="btn preset-filled-primary-500 mt-4 px-7 py-4"
				type="button"
				onclick={() => {
					searchTerm = '';
					statusFilter = 'all';
				}}
			>
				Clear All Filters
			</button>
		{/if}
	</section>
{/if}

<footer class="mt-auto px-6 py-8 text-center">
	<p class="text-surface-300 m-0 text-xs font-bold tracking-[0.2em] uppercase">
		Data current as of {new Date(healthData.generated_at).toLocaleString()}
	</p>
</footer>
