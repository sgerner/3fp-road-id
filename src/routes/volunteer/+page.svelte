<script>
        import { browser } from '$app/environment';
        import { tick, onDestroy } from 'svelte';
        import 'leaflet/dist/leaflet.css';

        export let data;

        const events = (data.events || []).filter(Boolean);
        const hostGroups = (data.hostGroups || []).filter(Boolean);
        const eventTypes = (data.eventTypes || []).filter(Boolean);

        const hostGroupMap = new Map();
        for (const group of hostGroups) {
                if (group?.id == null) continue;
                hostGroupMap.set(group.id, group);
        }

        function eventHostGroup(event) {
                if (!event || event.host_group_id == null) return undefined;
                const id = Number(event.host_group_id);
                if (Number.isNaN(id)) return undefined;
                return hostGroupMap.get(id);
        }

        const eventTypeMap = new Map();
        for (const type of eventTypes) {
                if (!type?.slug) continue;
                eventTypeMap.set(type.slug, type);
        }

        const defaultFilters = {
                search: '',
                startDate: '',
                endDate: '',
                location: '',
                hostGroupId: '',
                eventType: '',
                view: 'list'
        };

        let filters = { ...defaultFilters };

        function resetFilters() {
                filters = { ...defaultFilters };
        }

        function updateFilter(key, value) {
                filters = { ...filters, [key]: value };
        }

        function parseDate(value) {
                if (!value) return null;
                const normalized = value.length === 10 ? `${value}T00:00:00` : value;
                const parsed = new Date(normalized);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        function parseEventDate(value) {
                if (!value) return null;
                const parsed = new Date(value);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        function endOfDay(date) {
                if (!date) return null;
                const copy = new Date(date);
                copy.setHours(23, 59, 59, 999);
                return copy;
        }

	const sortedEvents = [...events].sort((a, b) => {
		const startA = parseEventDate(a?.event_start) ?? new Date(0);
		const startB = parseEventDate(b?.event_start) ?? new Date(0);
		return startA.getTime() - startB.getTime();
	});

	$: startDateFilter = parseDate(filters.startDate);
	$: endDateFilter = endOfDay(parseDate(filters.endDate));

        function hostGroupLocation(group) {
                if (!group) return '';
                const pieces = [group.city, group.state_region, group.country]
                        .map((part) => (part || '').trim())
                        .filter(Boolean);
                return pieces.join(', ');
        }

        function eventLocation(event) {
                if (!event) return '';
                if (event.location_name) return event.location_name;
                const group = eventHostGroup(event);
                if (group?.city || group?.state_region || group?.country) {
                        return hostGroupLocation(group);
		}
		return event.location_address || '';
	}

        function eventTimeRange(event) {
                const start = parseEventDate(event.event_start);
                const end = parseEventDate(event.event_end);
                if (!start) return 'Date to be announced';
                const dateFormatter = new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'full'
		});
		const timeFormatter = new Intl.DateTimeFormat(undefined, {
			timeStyle: 'short'
		});
		if (!end || end.getTime() === start.getTime()) {
			return `${dateFormatter.format(start)} · ${timeFormatter.format(start)} ${
				event.timezone ? event.timezone : ''
			}`.trim();
		}
		const sameDay = start.toDateString() === end.toDateString();
		if (sameDay) {
			return `${dateFormatter.format(start)} · ${timeFormatter.format(start)} – ${timeFormatter.format(end)} ${
				event.timezone ? event.timezone : ''
			}`.trim();
		}
		return `${dateFormatter.format(start)} ${timeFormatter.format(start)} → ${dateFormatter.format(end)} ${timeFormatter.format(
			end
		)} ${event.timezone ? event.timezone : ''}`.trim();
	}

        function eventTypeLabel(event) {
                if (!event?.event_type_slug) return '';
                const type = eventTypeMap.get(event.event_type_slug);
                return type?.event_type || '';
        }

        function hostGroupLabel(event) {
                const group = eventHostGroup(event);
                return group?.name || '';
        }

        function matchesSearch(text, query) {
                if (!query) return true;
                const haystack = (text || '').toLowerCase();
                return haystack.includes(query);
        }

	$: normalizedSearch = filters.search.trim().toLowerCase();
	$: normalizedLocation = filters.location.trim().toLowerCase();
	$: selectedHostId = filters.hostGroupId?.trim() ? filters.hostGroupId.trim() : '';
	$: selectedEventType = filters.eventType?.trim() ? filters.eventType.trim() : '';

        function eventMatchesFilters(event) {
                if (!event) return false;
                const start = parseEventDate(event.event_start);
                const end = parseEventDate(event.event_end) ?? start;
                if (startDateFilter && end && end < startDateFilter) return false;
		if (endDateFilter && start && start > endDateFilter) return false;

		if (normalizedSearch) {
                        const group = eventHostGroup(event);
			const fields = [
				event.title,
				event.summary,
				event.description,
				event.location_name,
				event.location_address,
				group?.name,
				hostGroupLocation(group)
			];
			const matchesAny = fields.some((field) => matchesSearch(field, normalizedSearch));
			if (!matchesAny) return false;
		}

		if (normalizedLocation) {
                        const group = eventHostGroup(event);
			const fields = [event.location_name, event.location_address, hostGroupLocation(group)];
			const matchesAny = fields.some((field) => matchesSearch(field, normalizedLocation));
			if (!matchesAny) return false;
		}

		if (selectedHostId) {
			if (!event.host_group_id || String(event.host_group_id) !== selectedHostId) return false;
		}

		if (selectedEventType && event.event_type_slug !== selectedEventType) return false;

		return true;
	}

        let filteredEvents = [];
        $: filteredEvents = sortedEvents.filter((event) => eventMatchesFilters(event));

        let totalUpcoming = 0;
        $: totalUpcoming = filteredEvents.length;

        function toDateKey(date) {
                if (!date) return '';
                return date.toISOString().slice(0, 10);
        }

        let eventsByDate = {};
        $: eventsByDate = filteredEvents.reduce(
                (acc, event) => {
                        const start = parseEventDate(event.event_start);
                        const key = toDateKey(start);
                        if (!key) return acc;
			if (!acc[key]) acc[key] = [];
			acc[key].push(event);
			return acc;
                },
                {}
        );

        function startOfMonth(date) {
                return new Date(date.getFullYear(), date.getMonth(), 1);
        }

        function earliestEventMonth() {
                const first = filteredEvents[0] ?? sortedEvents[0];
		const start = parseEventDate(first?.event_start);
		return start ? startOfMonth(start) : startOfMonth(new Date());
	}

	let calendarReference = earliestEventMonth();

        $: calendarMatrix = buildCalendarMatrix(calendarReference, eventsByDate);

        function buildCalendarMatrix(reference, lookup) {
                const monthStart = startOfMonth(reference);
                const month = monthStart.getMonth();
                const year = monthStart.getFullYear();
                const firstWeekday = monthStart.getDay();
                const firstDate = new Date(monthStart);
                firstDate.setDate(firstDate.getDate() - firstWeekday);

                const weeks = [];
                for (let week = 0; week < 6; week += 1) {
                        const days = [];
                        for (let day = 0; day < 7; day += 1) {
                                const current = new Date(firstDate);
                                current.setDate(firstDate.getDate() + week * 7 + day);
				const key = toDateKey(current);
				days.push({
					date: current,
					inMonth: current.getMonth() === month && current.getFullYear() === year,
					key,
					events: key && lookup[key] ? lookup[key] : []
				});
			}
			weeks.push(days);
		}
                return weeks;
        }

        function changeMonth(offset) {
                const next = new Date(calendarReference);
                next.setMonth(next.getMonth() + offset);
                calendarReference = startOfMonth(next);
        }

        let mapContainer = null;
        let leafletModule = null;
        let mapInstance = null;
        let markerLayer = null;

	async function ensureMap() {
		if (!browser) return;
		if (!leafletModule) {
			leafletModule = await import('leaflet');
		}
		if (!mapInstance && mapContainer && leafletModule) {
			mapInstance = leafletModule.map(mapContainer, {
				center: [39.5, -98.35],
				zoom: 4,
				scrollWheelZoom: false
			});
			leafletModule
				.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '&copy; OpenStreetMap contributors'
				})
				.addTo(mapInstance);
			markerLayer = leafletModule.layerGroup().addTo(mapInstance);
		}
	}

        function eventCoordinates(event) {
                if (event.latitude != null && event.longitude != null) {
                        const pair = [Number(event.latitude), Number(event.longitude)];
                        return pair;
                }
                const group = eventHostGroup(event);
                if (group?.latitude != null && group?.longitude != null) {
                        const pair = [Number(group.latitude), Number(group.longitude)];
                        return pair;
                }
                return null;
        }

	function updateMarkers() {
		if (!browser) return;
		const module = leafletModule;
		if (!module || !mapInstance || !markerLayer) return;
		markerLayer.clearLayers();
                const points = [];
                for (const event of filteredEvents) {
                        const coords = eventCoordinates(event);
                        if (!coords) continue;
			const marker = module.marker(coords).addTo(markerLayer);
			const popup = document.createElement('div');
			popup.className = 'space-y-1 text-sm';
			const titleLink = document.createElement('a');
			titleLink.href = `/volunteer/${event.slug}`;
			titleLink.className = 'text-secondary-400 font-semibold hover:underline';
			titleLink.textContent = event.title || 'Volunteer event';
			popup.appendChild(titleLink);
			const time = document.createElement('div');
			time.textContent = eventTimeRange(event);
			popup.appendChild(time);
			const location = eventLocation(event);
			if (location) {
				const locEl = document.createElement('div');
				locEl.textContent = location;
				popup.appendChild(locEl);
			}
			const hostName = hostGroupLabel(event);
			if (hostName) {
				const hostEl = document.createElement('div');
				hostEl.textContent = `Hosted by ${hostName}`;
				popup.appendChild(hostEl);
			}
			marker.bindPopup(popup);
			points.push(marker.getLatLng());
		}
		if (points.length) {
			const bounds = module.latLngBounds(points);
			mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
		} else {
			mapInstance.setView([39.5, -98.35], 3);
		}
	}

	async function activateMap() {
		if (!browser) return;
		await ensureMap();
		updateMarkers();
	}

	$: if (browser && filters.view === 'map') {
		tick().then(() => activateMap());
	}

	$: if (browser && filters.view === 'map' && mapInstance) {
		updateMarkers();
	}

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
			markerLayer = null;
		}
	});
</script>

<svelte:head>
	<title>Volunteer Hub</title>
</svelte:head>

<section class="mx-auto max-w-6xl space-y-10 px-4 py-12">
	<header class="space-y-4 text-center md:text-left">
		<h1 class="text-secondary-100 text-3xl font-bold md:text-4xl">Volunteer Opportunities</h1>
		<p class="text-surface-200">
			Browse rides, pop-up shops, workshops, and every kind of volunteer-powered moment that keeps
			our bike community humming. Filter by host group, date, and location to find the right place
			to pitch in.
		</p>
	</header>

	<div class="bg-surface-900/60 border-surface-400/20 space-y-6 rounded-2xl border p-6 shadow-xl">
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Search</span>
				<input
					type="search"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="Find by title, host, or description"
					value={filters.search}
					on:input={(event) => updateFilter('search', event.currentTarget.value)}
				/>
			</label>

			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Start after</span>
				<input
					type="date"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					value={filters.startDate}
					on:input={(event) => updateFilter('startDate', event.currentTarget.value)}
				/>
			</label>

			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Finish before</span>
				<input
					type="date"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					value={filters.endDate}
					on:input={(event) => updateFilter('endDate', event.currentTarget.value)}
				/>
			</label>

			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Location</span>
				<input
					type="search"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="City, state, or neighborhood"
					value={filters.location}
					on:input={(event) => updateFilter('location', event.currentTarget.value)}
				/>
			</label>

			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Host group</span>
				<select
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					value={filters.hostGroupId}
					on:change={(event) => updateFilter('hostGroupId', event.currentTarget.value)}
				>
					<option value="">Any host</option>
					{#each hostGroups as group}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</label>

			<label class="space-y-2 text-sm">
				<span class="text-surface-100 font-semibold">Opportunity type</span>
				<select
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					value={filters.eventType}
					on:change={(event) => updateFilter('eventType', event.currentTarget.value)}
				>
					<option value="">Any type</option>
					{#each eventTypes as type}
						<option value={type.slug}>{type.event_type}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="text-surface-300 text-sm">
				{#if totalUpcoming === 0}
					No volunteer events match the filters.
				{:else if totalUpcoming === 1}
					Showing 1 volunteer opportunity
				{:else}
					Showing {totalUpcoming} volunteer opportunities
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<div
					class="border-surface-700 bg-surface-900/60 inline-flex overflow-hidden rounded-full border text-sm"
				>
					<button
						type="button"
						class={`px-4 py-2 transition ${
							filters.view === 'list'
								? 'bg-secondary-500 text-surface-950'
								: 'text-surface-100 hover:bg-surface-800/80'
						}`}
						on:click={() => updateFilter('view', 'list')}
					>
						List
					</button>
					<button
						type="button"
						class={`px-4 py-2 transition ${
							filters.view === 'calendar'
								? 'bg-secondary-500 text-surface-950'
								: 'text-surface-100 hover:bg-surface-800/80'
						}`}
						on:click={() => updateFilter('view', 'calendar')}
					>
						Calendar
					</button>
					<button
						type="button"
						class={`px-4 py-2 transition ${
							filters.view === 'map'
								? 'bg-secondary-500 text-surface-950'
								: 'text-surface-100 hover:bg-surface-800/80'
						}`}
						on:click={() => updateFilter('view', 'map')}
					>
						Map
					</button>
				</div>
				<button
					type="button"
					class="text-secondary-300 hover:text-secondary-200 text-sm font-semibold"
					on:click={resetFilters}
				>
					Clear filters
				</button>
			</div>
		</div>
	</div>

	{#if filters.view === 'calendar'}
		<div class="bg-surface-900/60 border-surface-400/20 space-y-4 rounded-2xl border p-6 shadow-xl">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="text-surface-100 text-lg font-semibold">
					{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
						calendarReference
					)}
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm"
						on:click={() => changeMonth(-1)}
					>
						Previous
					</button>
					<button
						type="button"
						class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm"
						on:click={() => (calendarReference = earliestEventMonth())}
					>
						Today
					</button>
					<button
						type="button"
						class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-2 text-sm"
						on:click={() => changeMonth(1)}
					>
						Next
					</button>
				</div>
			</div>
			<div
				class="text-surface-300 grid grid-cols-7 gap-3 text-center text-xs font-semibold tracking-wide uppercase"
			>
				<div>Sun</div>
				<div>Mon</div>
				<div>Tue</div>
				<div>Wed</div>
				<div>Thu</div>
				<div>Fri</div>
				<div>Sat</div>
			</div>
			<div class="grid grid-cols-7 gap-3">
				{#each calendarMatrix as week}
					{#each week as day}
						<div
							class={`bg-surface-950/40 border-surface-500/20 flex h-36 flex-col rounded-xl border p-3 text-left ${
								day.inMonth ? 'text-surface-100' : 'text-surface-500'
							}`}
						>
							<div class="text-xs font-semibold">{day.date.getDate()}</div>
							<div class="mt-2 space-y-2 overflow-y-auto">
								{#if day.events.length === 0}
									<p class="text-surface-500 text-xs">No events</p>
								{:else}
									{#each day.events.slice(0, 3) as event}
										<a
											class="bg-secondary-500/10 text-secondary-200 hover:bg-secondary-500/20 block rounded-lg px-2 py-1 text-xs font-medium"
											href={`/volunteer/${event.slug}`}
										>
											{event.title}
										</a>
									{/each}
									{#if day.events.length > 3}
										<div class="text-secondary-300 text-[11px] font-medium">
											+{day.events.length - 3} more
										</div>
									{/if}
								{/if}
							</div>
						</div>
					{/each}
				{/each}
			</div>
		</div>
	{:else if filters.view === 'map'}
		<div class="bg-surface-900/60 border-surface-400/20 rounded-2xl border shadow-xl">
			<div bind:this={mapContainer} class="h-[520px] w-full rounded-2xl"></div>
			<div class="text-surface-300 border-surface-500/30 border-t px-6 py-3 text-sm">
				Zoom and click markers to preview event details. Some opportunities without mapped
				coordinates are hidden from the map view.
			</div>
		</div>
	{:else}
		<div class="space-y-6">
			{#if filteredEvents.length === 0}
				<div
					class="bg-surface-900/60 border-surface-400/20 text-surface-300 rounded-2xl border p-8 text-center"
				>
					<p class="text-lg font-semibold">No volunteer events found</p>
					<p class="mt-2 text-sm">
						Try adjusting the filters or check back soon for fresh opportunities.
					</p>
				</div>
			{:else}
				<ul class="space-y-5">
					{#each filteredEvents as event}
						<li
							class="bg-surface-900/60 border-surface-400/20 hover:border-secondary-400/40 rounded-2xl border p-6 shadow-lg transition"
						>
							<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div class="space-y-3">
									<a
										href={`/volunteer/${event.slug}`}
										class="text-secondary-200 hover:text-secondary-100 text-xl font-semibold"
									>
										{event.title}
									</a>
									{#if eventTypeLabel(event)}
										<div class="text-secondary-300 text-sm font-medium tracking-wide uppercase">
											{eventTypeLabel(event)}
										</div>
									{/if}
									<div class="text-surface-300 text-sm leading-relaxed">
										{#if event.summary}
											{event.summary}
										{:else if event.description}
											{event.description.slice(0, 160)}{event.description.length > 160 ? '…' : ''}
										{:else}
											Details coming soon.
										{/if}
									</div>
									<div class="text-surface-400 text-sm">
										{#if hostGroupLabel(event)}
											Hosted by <span class="text-surface-100 font-medium"
												>{hostGroupLabel(event)}</span
											>
										{:else}
											Community organized
										{/if}
									</div>
								</div>
								<div
									class="bg-surface-800/70 border-surface-400/20 text-surface-200 space-y-3 rounded-xl border px-5 py-4 text-sm"
								>
									<div>
										<div class="text-surface-500 text-xs tracking-wide uppercase">When</div>
										<div class="text-surface-100 mt-1 font-semibold">{eventTimeRange(event)}</div>
									</div>
									<div>
										<div class="text-surface-500 text-xs tracking-wide uppercase">Where</div>
										<div class="text-surface-100 mt-1">
											{eventLocation(event) || 'Location coming soon'}
										</div>
									</div>
									{#if event.max_volunteers}
										<div>
											<div class="text-surface-500 text-xs tracking-wide uppercase">
												Volunteer slots
											</div>
											<div class="text-surface-100 mt-1">
												Up to {event.max_volunteers} volunteers
											</div>
										</div>
									{/if}
									<a
										href={`/volunteer/${event.slug}`}
										class="bg-secondary-500 text-surface-900 hover:bg-secondary-400 block rounded-lg px-4 py-2 text-center text-sm font-semibold"
									>
										View event details
									</a>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>
