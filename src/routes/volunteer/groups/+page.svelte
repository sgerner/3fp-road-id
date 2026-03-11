<script>
	import { slide, fade } from 'svelte/transition';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBuilding2 from '@lucide/svelte/icons/building-2';

	const { data } = $props();

	let searchTerm = $state('');

	const groups = $derived((data?.groups ?? []).filter((group) => group && group.events?.length));

	const filteredGroups = $derived(
		groups.filter((group) => {
			if (!searchTerm) return true;
			const lowerSearch = searchTerm.toLowerCase();
			const nameMatch = group.name?.toLowerCase().includes(lowerSearch);
			const taglineMatch = group.tagline?.toLowerCase().includes(lowerSearch);
			const cityMatch = group.city?.toLowerCase().includes(lowerSearch);
			const stateMatch = group.state_region?.toLowerCase().includes(lowerSearch);
			return nameMatch || taglineMatch || cityMatch || stateMatch;
		})
	);

	const totalEvents = $derived(filteredGroups.reduce((sum, g) => sum + (g.events?.length ?? 0), 0));
	const totalGroupEvents = $derived(groups.reduce((sum, g) => sum + (g.events?.length ?? 0), 0));

	function parseDate(value) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function eventDateRange(event) {
		const start = parseDate(event?.event_start);
		const end = parseDate(event?.event_end);
		if (!start) return 'Date TBA';
		if (!end || end.getTime() === start.getTime() || start.toDateString() === end.toDateString()) {
			return dateFormatter.format(start);
		}
		return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
	}

	function eventTimeRange(event) {
		const start = parseDate(event?.event_start);
		const end = parseDate(event?.event_end);
		if (!start) return '';
		if (!end || end.getTime() === start.getTime()) {
			return timeFormatter.format(start);
		}
		return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
	}

	function locationLabel(group) {
		if (!group) return '';
		return [group.city, group.state_region, group.country]
			.map((part) => (part || '').trim())
			.filter(Boolean)
			.join(', ');
	}

	function groupInitials(name) {
		if (!name) return '?';
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<svelte:head>
	<title>Volunteer Opportunities by Group</title>
</svelte:head>

<section class="mx-auto w-full max-w-5xl space-y-8">
	<!-- ═══════════════════════ HERO ═══════════════════════ -->
	<div class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.85fr)] lg:p-10"
		>
			<!-- Left: headline + chips + stats -->
			<div class="flex flex-col gap-6">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-tertiary-500 gap-1.5 font-semibold tracking-wide">
						<IconUsers class="h-3.5 w-3.5" />
						By Group
					</span>
					<span class="chip preset-tonal-secondary">Organizers</span>
					<span class="chip preset-tonal-primary">Community</span>
				</div>

				<div class="space-y-3">
					<h1
						class="volunteer-headline max-w-xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl"
					>
						Volunteer
						<span class="volunteer-headline-accent">by Group.</span>
					</h1>
					<p class="max-w-md text-base leading-relaxed opacity-75">
						Discover upcoming ways to pitch in with local organizers. Each group below is hosting
						volunteer events—join one or explore everything they have planned.
					</p>
				</div>

				<!-- Stat cards -->
				<div class="grid grid-cols-2 gap-3">
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-tertiary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconUsers class="h-4 w-4" />
							Active Groups
						</div>
						<div class="text-3xl font-black tabular-nums">{groups.length}</div>
					</div>
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-primary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconCalendar class="h-4 w-4" />
							Upcoming Events
						</div>
						<div class="text-3xl font-black tabular-nums">{totalGroupEvents}</div>
					</div>
				</div>
			</div>

			<!-- Right: search panel -->
			<div
				class="search-panel card preset-filled-surface-50-950 flex flex-col gap-5 p-6 shadow-2xl"
			>
				<div class="space-y-1">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] uppercase opacity-60"
					>
						<IconSearch class="h-4 w-4" />
						Find a group
					</div>
					<h2 class="text-xl font-bold">Search by name or location</h2>
				</div>

				<div class="relative">
					<IconSearch
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
					/>
					<input
						id="search-groups"
						type="search"
						bind:value={searchTerm}
						placeholder="e.g. 'trail building', 'Boise', ..."
						class="input bg-surface-950-50/5 w-full pl-9"
					/>
				</div>

				<div class="mt-auto space-y-1 text-sm opacity-60">
					{#if searchTerm}
						<p>
							{filteredGroups.length} group{filteredGroups.length === 1 ? '' : 's'} matching "{searchTerm}"
						</p>
					{:else}
						<p>
							{groups.length} group{groups.length === 1 ? '' : 's'} · {totalGroupEvents} upcoming event{totalGroupEvents ===
							1
								? ''
								: 's'}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- ═══════════════════════ RESULTS ═══════════════════════ -->
	<div class="space-y-5">
		<!-- Directory toolbar -->
		<div class="flex items-center justify-between gap-2">
			<div>
				<p class="label opacity-60">Directory</p>
				<h2 class="text-2xl font-bold">Group listings</h2>
			</div>
			<p class="text-sm tabular-nums opacity-60">
				{filteredGroups.length} group{filteredGroups.length === 1 ? '' : 's'}
				{#if totalEvents !== totalGroupEvents}· {totalEvents} event{totalEvents === 1
						? ''
						: 's'}{/if}
			</p>
		</div>

		{#if filteredGroups.length}
			<ul class="space-y-6" transition:slide>
				{#each filteredGroups as group, i}
					<li
						class="event-card border-surface-400-600/50 bg-surface-50-950/60 hover:border-tertiary-500/40 hover:shadow-tertiary-500/10 relative overflow-hidden rounded-xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
						style="--stagger: {i % 10}"
						transition:slide
					>
						{#if group.cover_photo_url}
							<div
								class="absolute inset-0 bg-cover bg-center opacity-15"
								style="background-image: url({group.cover_photo_url});"
							></div>
							<div
								class="from-surface-50-950/90 via-surface-50-950/70 to-surface-50-950/50 absolute inset-0 bg-gradient-to-br"
							></div>
						{/if}

						<div class="relative space-y-5">
							<!-- Group header row -->
							<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div class="flex items-start gap-4">
									<!-- Logo / initials avatar -->
									<div class="shrink-0">
										{#if group.logo_url}
											<img
												src={group.logo_url}
												alt="{group.name} logo"
												class="ring-surface-300-700/50 h-12 w-12 rounded-xl object-cover ring-2"
											/>
										{:else}
											<div
												class="bg-tertiary-500/20 text-tertiary-800-200 ring-tertiary-500/30 flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold ring-2"
											>
												{groupInitials(group.name)}
											</div>
										{/if}
									</div>

									<!-- Group name + meta -->
									<div class="min-w-0 space-y-0.5">
										<h2 class="text-surface-950-50 !text-left text-xl font-bold">
											{#if group.slug}
												<a
													href={`/volunteer/groups/${group.slug}`}
													class="hover:text-tertiary-700-300 transition-colors"
												>
													{group.name}
												</a>
											{:else}
												{group.name}
											{/if}
										</h2>
										{#if locationLabel(group)}
											<div class="text-surface-600-400 flex items-center gap-1 text-sm">
												<IconMapPin class="h-3.5 w-3.5 shrink-0 opacity-70" />
												<span>{locationLabel(group)}</span>
											</div>
										{/if}
										{#if group.tagline}
											<p
												class="text-surface-700-300 !mb-0 max-w-lg truncate pt-1 text-sm leading-relaxed"
											>
												{group.tagline}
											</p>
										{/if}
									</div>
								</div>

								<!-- Action buttons -->
								{#if group.slug}
									<div class="flex shrink-0 flex-col items-start gap-2 md:items-end">
										<a
											href={`/volunteer/groups/${group.slug}`}
											class="btn preset-filled-tertiary-500 gap-1.5 whitespace-nowrap"
										>
											All events
											<IconArrowRight class="h-4 w-4" />
										</a>
										<a
											href={`/groups/${group.slug}`}
											class="btn preset-outlined-secondary-500 gap-1.5 whitespace-nowrap"
										>
											<IconBuilding2 class="h-4 w-4" />
											Group profile
										</a>
									</div>
								{/if}
							</div>

							<!-- Event sub-list -->
							<ul class="space-y-2.5">
								{#each group.events as event}
									<li
										class="bg-surface-100-900/60 border-surface-500/20 hover:border-surface-400-600/50 rounded-xl border p-4 transition-colors duration-200"
									>
										<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
											<div class="min-w-0 space-y-1.5">
												<a
													href={`/volunteer/${event.slug}`}
													class="text-secondary-800-200 hover:text-secondary-900-100 block leading-tight font-semibold transition-colors"
												>
													{event.title}
												</a>
												<div
													class="text-surface-600-400 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
												>
													<span class="flex items-center gap-1">
														<IconCalendar class="h-3.5 w-3.5 opacity-70" />
														<strong>{eventDateRange(event)}</strong>
													</span>
													{#if eventTimeRange(event)}
														<span class="opacity-70">{eventTimeRange(event)}</span>
													{/if}
												</div>
											</div>
											<div class="flex shrink-0 flex-wrap items-center gap-2">
												{#if event.can_manage}
													<a
														href={`/volunteer/${event.slug}/edit`}
														class="btn btn-sm preset-outlined-secondary-500 whitespace-nowrap"
													>
														Edit
													</a>
													<a
														href={`/volunteer/${event.slug}/manage`}
														class="btn btn-sm preset-tonal-tertiary whitespace-nowrap"
													>
														Manage
													</a>
												{:else}
													<a
														href={`/volunteer/${event.slug}`}
														class="btn btn-sm preset-filled-primary-500 gap-1 whitespace-nowrap"
													>
														<IconHeartHandshake class="h-3.5 w-3.5" />
														Volunteer
													</a>
												{/if}
											</div>
										</div>
									</li>
								{/each}
							</ul>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<!-- Empty state -->
			<div
				class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
				transition:slide
			>
				<div class="app-empty-orb" aria-hidden="true"></div>
				<div class="relative z-10 mx-auto max-w-lg space-y-4">
					<div
						class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
					>
						<IconUsers class="h-10 w-10 opacity-60" />
					</div>
					<h3 class="text-2xl font-bold">
						{#if searchTerm}
							No groups match "{searchTerm}"
						{:else}
							No upcoming volunteer events yet
						{/if}
					</h3>
					<p class="text-sm leading-relaxed opacity-70">
						{#if searchTerm}
							Try a different search term or clear the filter to see all groups.
						{:else}
							Check back soon or browse
							<a class="text-secondary-800-200 underline" href="/volunteer"
								>all volunteer opportunities</a
							>
							to get involved.
						{/if}
					</p>
					{#if searchTerm}
						<button class="btn preset-outlined-surface-950-50" onclick={() => (searchTerm = '')}>
							Clear search
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>
