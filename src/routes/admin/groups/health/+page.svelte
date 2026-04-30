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

	let { data } = $props();

	const healthData = $derived(data.healthData);
	const groups = $derived(healthData.groups || []);
	const totals = $derived(healthData.totals || {});

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
			<p class="text-surface-600-400 flex items-center gap-2 text-sm">
				<IconActivity class="size-4" />
				Monitoring {totals.claimed_groups} claimed groups over {data.windowDays} days
			</p>
		</div>

		<form method="GET" class="flex flex-wrap items-center gap-3">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium">Window:</span>
				<select name="window_days" class="select" value={data.windowDays}>
					<option value="7">7 Days</option>
					<option value="30">30 Days</option>
					<option value="90">90 Days</option>
					<option value="180">180 Days</option>
					<option value="365">1 Year</option>
				</select>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium">Limit:</span>
				<select name="limit" class="select" value={data.limit}>
					<option value="25">25</option>
					<option value="50">50</option>
					<option value="100">100</option>
					<option value="500">500</option>
					<option value="1000">All</option>
				</select>
			</div>
			<button type="submit" class="btn preset-filled-primary-500">Refresh</button>
		</form>
	</header>

	<!-- Stats Cards -->
	<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each [{ key: 'healthy', label: 'Healthy', icon: IconCircleCheck }, { key: 'watch', label: 'Watch', icon: IconCircleAlert }, { key: 'critical', label: 'Critical', icon: IconTriangleAlert }, { key: 'inactive', label: 'Inactive', icon: IconMoon }] as stat}
			{@const count = totals[stat.key] || 0}
			{@const percent = totals.claimed_groups
				? Math.round((count / totals.claimed_groups) * 100)
				: 0}
			{@const colorClass =
				stat.key === 'healthy'
					? 'preset-tonal-success'
					: stat.key === 'watch'
						? 'preset-tonal-warning'
						: stat.key === 'critical'
							? 'preset-tonal-error'
							: 'preset-tonal-surface'}
			<div class="card {colorClass} p-4">
				<div class="flex items-center justify-between">
					<span class="text-surface-600-400 text-xs font-bold tracking-wider uppercase"
						>{stat.label}</span
					>
					<stat.icon class="size-5" />
				</div>
				<div class="mt-2 flex items-baseline gap-2">
					<span class="text-3xl font-bold">{count}</span>
					<span class="text-surface-500 text-sm">({percent}%)</span>
				</div>
			</div>
		{/each}
	</section>

	<!-- Warnings -->
	{#if healthData.warnings?.length}
		<div class="card preset-tonal-warning p-4">
			<p class="flex items-center gap-2 font-semibold">
				<IconCircleAlert class="size-4" />
				Data Warning
			</p>
			<ul class="mt-2 list-inside list-disc space-y-1 text-sm">
				{#each healthData.warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Groups Grid -->
	{#if groups.length > 0}
		<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each groups as g}
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

				<article class="card preset-tonal-surface flex flex-col overflow-hidden">
					<!-- Status Header -->
					<div class="{statusPreset} p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3">
								<div
									class="{statusFilled} rounded-token flex h-10 w-10 shrink-0 items-center justify-center"
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
							<p class="text-sm">
								{g.group.city || 'Unknown'}{g.group.state_region ? `, ${g.group.state_region}` : ''}
							</p>
						</div>

						<!-- Health Reasons -->
						{#if g.health.reasons?.length}
							<div class="">
								{#each g.health.reasons.slice(0, 3) as reason}
									<p class="flex items-start gap-1.5 text-xs">
										<span class="text-surface-600-400">•</span>
										<span>{reason}</span>
									</p>
								{/each}
								{#if g.health.reasons.length > 3}
									<p class="text-surface-400 text-xs italic">
										+{g.health.reasons.length - 3} more issues
									</p>
								{/if}
							</div>
						{/if}

						<!-- Activity Stats -->
						<div class="grid grid-cols-3 gap-2 pt-2">
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconBike class="size-3.5" />
									<span class="text-xs">Rides</span>
								</div>
								<p class="text-sm font-semibold">{g.activity.rides_upcoming}</p>
							</div>
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconHandHeart class="size-3.5" />
									<span class="text-xs">Volunteers</span>
								</div>
								<p class="text-sm font-semibold">{g.activity.volunteer_events_upcoming}</p>
							</div>
							<div class="text-center">
								<div class="text-surface-400 flex items-center justify-center gap-1">
									<IconNewspaper class="size-3.5" />
									<span class="text-xs">News</span>
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
									<span class="text-xs {g.social.accounts_active > 0 ? '' : 'text-surface-400'}">
										{g.social.accounts_active}/{g.social.accounts_connected}
									</span>
								</div>
								{#if g.social.posts_failed_in_window > 0}
									<span class="badge preset-tonal-error text-xs">
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
										? 'text-success-500'
										: 'text-surface-400'}"
								>
									{g.monetization.donations_connected ? 'Connected' : 'None'}
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
									<span class="text-surface-400 text-xs">members</span>
									{#if g.membership.pending_applications > 0}
										<span class="badge preset-tonal-warning text-xs"
											>{g.membership.pending_applications} pending</span
										>
									{/if}
									{#if g.membership.past_due_members > 0}
										<span class="badge preset-tonal-error text-xs"
											>{g.membership.past_due_members} past due</span
										>
									{/if}
								{:else}
									<span class="text-surface-400 text-sm">Membership not enabled</span>
								{/if}
							</div>
						</div>

						<!-- Last Activity -->
						<div class="border-surface-500/10 flex items-center justify-between border-t pt-3">
							<div class="text-surface-400 flex items-center gap-1.5">
								<IconCalendar class="size-3.5" />
								<span class="text-xs">Last activity</span>
							</div>
							<div class="text-right">
								<span class="text-sm font-medium">{formatDate(g.signals.last_activity_at)}</span>
								{#if g.signals.days_since_last_activity !== null}
									<p class="text-surface-400 text-xs">
										{g.signals.days_since_last_activity} days ago
									</p>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
		</section>
	{:else}
		<div class="card preset-tonal-surface p-12 text-center">
			<IconActivity class="mx-auto size-12 opacity-20" />
			<p class="text-surface-500 mt-3 text-lg font-medium">No groups found</p>
			<p class="text-surface-400 text-sm">Try adjusting your filters or check back later.</p>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="text-center">
		<p class="text-surface-500 text-xs">
			Generated at {new Date(healthData.generated_at).toLocaleString()}
		</p>
	</footer>
</div>
