<script>
	import { slide } from 'svelte/transition';
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
		if (!start) return 'Date to be announced';
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
</script>

<svelte:head>
	<title>Volunteer Opportunities by Group</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-6">
	<header class="space-y-3">
		<h1 class="text-surface-50 mx-auto text-center text-3xl font-bold">
			Volunteer Opportunities by Group
		</h1>
		<p class="text-surface-300 mx-auto max-w-3xl text-center text-base">
			Discover upcoming ways to pitch in with local organizers. Each group below has volunteer
			events on the calendar—join an event or explore everything they have planned.
		</p>
	</header>

	<section class="border-surface-300 bg-surface-950 rounded-lg border p-4">
		<div class="w-full">
			<label for="search-groups" class="text-surface-300 mb-1 block text-sm font-medium"
				>Search by name, keyword, or location</label
			>
			<input
				id="search-groups"
				type="search"
				bind:value={searchTerm}
				placeholder="e.g. 'trail building', 'Boise', ..."
				class="input w-full"
			/>
		</div>
	</section>

	{#if filteredGroups.length}
		<ul class="space-y-6" transition:slide>
			{#each filteredGroups as group}
				<li
					class="card card-hover border-surface-300 bg-surface-950 relative overflow-hidden rounded-lg border"
					transition:slide
				>
					{#if group.cover_photo_url}
						<div
							class="absolute inset-0 bg-cover bg-center"
							style="background-image: url({group.cover_photo_url});"
						></div>
						<div
							class="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/30"
						></div>
					{/if}
					<div class="relative space-y-4 p-5">
						<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
							<div class="space-y-1">
								<h2 class="text-surface-50 !text-left text-2xl font-semibold">
									{#if group.slug}
										<a href={`/volunteer/groups/${group.slug}`} class="hover:text-secondary-200">
											{group.name}
										</a>
									{:else}
										{group.name}
									{/if}
								</h2>
								{#if group.tagline}
									<p class="!mb-0 max-w-2xl truncate text-sm leading-relaxed">
										{group.tagline}
									</p>
								{/if}
								{#if locationLabel(group)}
									<p class="text-surface-400 !mb-0 text-sm">{locationLabel(group)}</p>
								{/if}
							</div>
							{#if group.slug}
								<div class="flex flex-col items-start gap-2 md:items-end">
									<a
										href={`/volunteer/groups/${group.slug}`}
										class="btn preset-filled-tertiary-500 whitespace-nowrap"
									>
										All volunteer events →
									</a>
									<a
										href={`/groups/${group.slug}`}
										class="btn preset-outlined-secondary-500 whitespace-nowrap"
									>
										View group profile
									</a>
								</div>
							{/if}
						</div>
						<ul class="space-y-4">
							{#each group.events as event}
								<li class="bg-surface-900/80 border-surface-500/20 rounded-xl border p-4">
									<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
										<div class="space-y-2">
											<div class="space-y-1">
												<a
													href={`/volunteer/${event.slug}`}
													class="text-secondary-200 hover:text-secondary-100 text-lg font-semibold"
												>
													{event.title}
												</a>
											</div>
											<div class="space-y-1 text-sm">
												<div class="text-surface-100 font-medium">
													<strong class="mr-4">{eventDateRange(event)}</strong>
													{#if eventTimeRange(event)}
														{eventTimeRange(event)}
													{/if}
												</div>
											</div>
										</div>
										<div class="flex flex-wrap items-center gap-2 md:justify-end">
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
													class="btn preset-outlined-primary-500 whitespace-nowrap"
												>
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
		<div
			class="border-surface-500/20 bg-surface-900/60 rounded-xl border p-6 text-center"
			transition:slide
		>
			<h2 class="text-surface-50 text-xl font-semibold">
				{#if searchTerm}
					No groups match “{searchTerm}”
				{:else}
					No upcoming volunteer events yet
				{/if}
			</h2>
			<p class="text-surface-300 mt-2">
				{#if searchTerm}
					Try a different search term or clear the filter to see all groups.
				{:else}
					Check back soon or browse <a class="text-secondary-200 underline" href="/volunteer"
						>all volunteer opportunities</a
					> to get involved.
				{/if}
			</p>
		</div>
	{/if}
</div>
