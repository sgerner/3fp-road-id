<script>
	import { slide } from 'svelte/transition';
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

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)]"
		aria-labelledby="groups-volunteer-heading"
	>
		<!-- Left: Lemon field -->
		<div
			class="bg-primary-500 text-surface-950 flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="bg-tertiary-500 text-surface-950 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					<IconUsers class="h-3.5 w-3.5" />
					By Group
				</span>
				<span
					class="bg-surface-950 text-primary-500 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					Organizers
				</span>
				<span
					class="border-surface-950 text-surface-950 border-2 px-3 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
				>
					Community
				</span>
			</div>

			<div class="flex flex-col gap-5">
				<h1
					id="groups-volunteer-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.2vw,6.75rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Volunteer <span class="text-secondary-500">by Group.</span>
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					Discover upcoming ways to pitch in with local organizers. Each group below is hosting
					volunteer events—join one or explore everything they have planned.
				</p>
			</div>

			<!-- Stat strip -->
			<div class="border-surface-950 grid grid-cols-2 gap-6 border-t-[3px] pt-6">
				<div class="flex flex-col gap-1">
					<span class="flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
						<IconUsers class="h-4 w-4" />
						Active Groups
					</span>
					<span class="text-5xl leading-none font-black italic tabular-nums sm:text-6xl">
						{groups.length}
					</span>
				</div>
				<div class="border-surface-950 flex flex-col gap-1 border-l-[3px] pl-6">
					<span class="flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
						<IconCalendar class="h-4 w-4" />
						Upcoming Events
					</span>
					<span
						class="text-secondary-500 text-5xl leading-none font-black italic tabular-nums sm:text-6xl"
					>
						{totalGroupEvents}
					</span>
				</div>
			</div>
		</div>

		<!-- Right: Violet search field -->
		<div
			class="bg-secondary-500 text-surface-50 relative flex flex-col justify-between gap-8 px-6 py-10 sm:px-10 lg:px-12 lg:py-14"
		>
			<div class="flex flex-col gap-3">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconSearch class="h-4 w-4" />
					Find a group
				</p>
				<h2
					class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
				>
					Search by name or location
				</h2>
			</div>

			<div class="flex flex-col gap-4">
				<label for="search-groups" class="sr-only">Search groups by name or location</label>
				<div class="border-surface-950 bg-surface-950 relative flex items-center border-[3px]">
					<IconSearch class="text-primary-500 pointer-events-none ml-4 h-5 w-5 shrink-0" />
					<input
						id="search-groups"
						type="search"
						bind:value={searchTerm}
						placeholder="e.g. 'trail building', 'Boise', ..."
						class="bg-surface-950 text-surface-50 placeholder:text-surface-400 w-full border-0 py-4 pr-4 pl-3 text-base font-medium focus:outline-none"
					/>
				</div>

				<div class="text-primary-500 text-xs font-black tracking-[0.2em] uppercase tabular-nums">
					{#if searchTerm}
						<p class="m-0">
							{filteredGroups.length} group{filteredGroups.length === 1 ? '' : 's'} matching "{searchTerm}"
						</p>
					{:else}
						<p class="m-0">
							{groups.length} group{groups.length === 1 ? '' : 's'} · {totalGroupEvents} upcoming event{totalGroupEvents ===
							1
								? ''
								: 's'}
						</p>
					{/if}
				</div>
			</div>

			<!-- 3-foot ruler motif -->
			<div class="border-surface-950 grid grid-cols-3 border-t-[3px] pt-2" aria-hidden="true">
				{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
					<div class="border-surface-950 relative h-10 border-l-[3px] first:border-l-0">
						<span
							class="absolute inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_2px,transparent_2px_calc(100%/8))]"
						></span>
						<span class="text-primary-500 absolute bottom-0 left-2 text-xs font-black uppercase">
							{mark}
						</span>
						{#if i === 2}
							<span class="text-primary-500 absolute right-2 bottom-0 text-xs font-black uppercase">
								3 ft
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- DIRECTORY RESULTS -->
	<section
		class="bg-surface-950 text-surface-50 flex flex-col gap-8 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-labelledby="group-listings-heading"
	>
		<!-- Directory toolbar -->
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Directory</p>
				<h2
					id="group-listings-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Group listings
				</h2>
			</div>
			<p class="text-surface-300 m-0 text-sm font-bold tracking-wide uppercase tabular-nums">
				{filteredGroups.length} group{filteredGroups.length === 1 ? '' : 's'}
				{#if totalEvents !== totalGroupEvents}· {totalEvents} event{totalEvents === 1
						? ''
						: 's'}{/if}
			</p>
		</div>

		<!-- Lane divider -->
		<div
			class="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
			aria-hidden="true"
		></div>

		{#if filteredGroups.length}
			<ol class="border-surface-50 m-0 list-none border-t-2 p-0" transition:slide>
				{#each filteredGroups as group, i (group.id ?? group.slug ?? i)}
					<li class="border-surface-800 flex flex-col gap-6 border-b-2 py-10" transition:slide>
						<!-- Group header row -->
						<div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
							<div class="flex min-w-0 items-start gap-4 sm:gap-6">
								<span
									class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-5xl"
								>
									{String(i + 1).padStart(2, '0')}
								</span>

								<!-- Logo / initials tile -->
								<div class="shrink-0">
									{#if group.logo_url}
										<span class="bg-surface-50 flex h-16 w-16 items-center justify-center p-1.5">
											<img
												src={group.logo_url}
												alt="{group.name} logo"
												class="h-full w-full object-contain"
											/>
										</span>
									{:else}
										<div
											class="bg-tertiary-500 text-surface-950 flex h-16 w-16 items-center justify-center text-lg font-black uppercase"
										>
											{groupInitials(group.name)}
										</div>
									{/if}
								</div>

								<!-- Group name + meta -->
								<div class="flex min-w-0 flex-1 flex-col gap-1.5">
									<h3
										class="text-surface-50! m-0 text-2xl leading-tight font-black uppercase italic sm:text-3xl"
									>
										{#if group.slug}
											<a
												href={`/volunteer/groups/${group.slug}`}
												class="text-surface-50 hover:text-primary-500 transition hover:no-underline"
											>
												{group.name}
											</a>
										{:else}
											{group.name}
										{/if}
									</h3>
									{#if locationLabel(group)}
										<div
											class="text-primary-500 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase"
										>
											<IconMapPin class="h-3.5 w-3.5 shrink-0" />
											<span>{locationLabel(group)}</span>
										</div>
									{/if}
									{#if group.tagline}
										<p class="text-surface-300 m-0 max-w-2xl text-sm leading-relaxed">
											{group.tagline}
										</p>
									{/if}
								</div>
							</div>

							<!-- Action buttons -->
							{#if group.slug}
								<div class="flex shrink-0 flex-wrap items-center gap-3 pl-14 lg:pl-0">
									<a
										href={`/volunteer/groups/${group.slug}`}
										class="group bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex items-center gap-2 px-5 py-3 text-xs font-black tracking-wide whitespace-nowrap uppercase transition hover:no-underline"
									>
										All events
										<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
									</a>
									<a
										href={`/groups/${group.slug}`}
										class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-5 py-2.5 text-xs font-black tracking-wide whitespace-nowrap uppercase transition hover:no-underline"
									>
										<IconBuilding2 class="h-4 w-4" />
										Group profile
									</a>
								</div>
							{/if}
						</div>

						<!-- Event sub-list (ruled rows, no nested cards) -->
						<ul class="border-surface-800 m-0 list-none border-t p-0 lg:ml-20">
							{#each group.events as event (event.id ?? event.slug)}
								<li
									class="border-surface-800 flex flex-col gap-4 border-b py-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="flex min-w-0 flex-col gap-1">
										<a
											href={`/volunteer/${event.slug}`}
											class="text-surface-50 hover:text-primary-500 block text-lg leading-tight font-black uppercase hover:no-underline"
										>
											{event.title}
										</a>
										<div
											class="text-surface-300 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold tracking-wide uppercase"
										>
											<span class="text-primary-500 flex items-center gap-1.5">
												<IconCalendar class="h-3.5 w-3.5" />
												<strong>{eventDateRange(event)}</strong>
											</span>
											{#if eventTimeRange(event)}
												<span>{eventTimeRange(event)}</span>
											{/if}
										</div>
									</div>
									<div class="flex shrink-0 flex-wrap items-center gap-2">
										{#if event.can_manage}
											<a
												href={`/volunteer/${event.slug}/edit`}
												class="border-secondary-500 text-surface-50 hover:bg-secondary-500 border-2 px-4 py-2 text-xs font-black tracking-wide whitespace-nowrap uppercase transition hover:no-underline"
											>
												Edit
											</a>
											<a
												href={`/volunteer/${event.slug}/manage`}
												class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 px-4 py-2 text-xs font-black tracking-wide whitespace-nowrap uppercase transition hover:no-underline"
											>
												Manage
											</a>
										{:else}
											<a
												href={`/volunteer/${event.slug}`}
												class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-black tracking-wide whitespace-nowrap uppercase transition hover:no-underline"
											>
												<IconHeartHandshake class="h-3.5 w-3.5" />
												Volunteer
											</a>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ol>
		{:else}
			<div class="border-surface-50 flex flex-col gap-5 border-t-2 py-12" transition:slide>
				<p
					class="text-tertiary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconUsers class="h-4 w-4" />
					<span>Directory status</span>
				</p>
				<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-5xl">
					{#if searchTerm}
						No groups match "{searchTerm}"
					{:else}
						No upcoming volunteer events yet
					{/if}
				</h3>
				<p class="text-surface-300 m-0 max-w-xl text-lg leading-relaxed">
					{#if searchTerm}
						Try a different search term or clear the filter to see all groups.
					{:else}
						Check back soon or browse
						<a
							class="text-primary-500 decoration-primary-500 font-bold underline decoration-2 underline-offset-4"
							href="/volunteer">all volunteer opportunities</a
						>
						to get involved.
					{/if}
				</p>
				{#if searchTerm}
					<div>
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 border-[3px] px-6 py-3 text-sm font-black tracking-wide uppercase transition"
							onclick={() => (searchTerm = '')}
						>
							Clear search
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>
