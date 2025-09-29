<script>
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import IconPlus from '@lucide/svelte/icons/plus';
	import { slide } from 'svelte/transition';
	import { listVolunteerEvents } from '$lib/services/volunteers';

	let {
		eventsData = [],
		hostGroupsData = [],
		eventTypesData = [],
		hostOrgsData = [],
		opportunitiesData = [],
		user = null,
		title = 'Volunteer Opportunities',
		description = 'Browse rides, pop-up shops, workshops, and more. Filter by host, type, and location to find the right place to pitch in.',
		showManagedEventsSection = true,
		showCreateButton = true,
		createButtonHref = '/volunteer/new'
	} = $props();

	const events = $derived((eventsData ?? []).filter(Boolean));
	const hostGroups = $derived((hostGroupsData ?? []).filter(Boolean));
	const eventTypes = $derived((eventTypesData ?? []).filter(Boolean));
	const hostOrgs = $derived((hostOrgsData ?? []).filter(Boolean));
	const opportunities = $derived((opportunitiesData ?? []).filter(Boolean));
	const currentUser = $derived(user ?? null);

	const hostGroupMap = new Map();
	for (const g of hostGroups) if (g?.id != null) hostGroupMap.set(String(g.id), g);

	const eventTypeMap = new Map();
	for (const t of eventTypes) if (t?.slug) eventTypeMap.set(t.slug, t);

	const hostOrgMap = new Map();
	for (const o of hostOrgs) {
		const ids = [o?.id, o?.organization_id, o?.org_id].filter((v) => v != null);
		for (const id of ids) hostOrgMap.set(String(id), o);
	}
	function getHostOrgNameById(id) {
		const org = hostOrgMap.get(String(id));
		return org?.name ?? org?.title ?? org?.org_name ?? '';
	}
	function getHostOrgNameForEvent(e) {
		const id = e?.host_org_id ?? e?.host_organization_id ?? e?.organization_id ?? e?.org_id ?? null;
		if (id != null) {
			const name = getHostOrgNameById(id);
			if (name) return name;
		}
		return e?.host_org?.name ?? e?.host_org?.title ?? e?.host_org_name ?? '';
	}

	let searchInput = $state('');
	let locationQ = $state('');
	let hostGroupId = $state('');
	let eventType = $state('');
	let view = $state('list');

	let managedEvents = $state([]);
	let managedEventsLoading = $state(false);
	let managedEventsError = $state('');
	let managedEventsLoadedFor = $state('');

	async function fetchManagedEventsFor(userId) {
		if (!browser || !userId || !showManagedEventsSection) return;

		managedEventsLoading = true;
		managedEventsError = '';

		try {
			const ownerGroupIds = await loadOwnedGroupIds(userId);

			const eventMap = new Map();

			const hostResponse = await listVolunteerEvents({
				fetch,
				query: {
					host_user_id: `eq.${userId}`,
					order: 'event_start.desc',
					limit: 100
				}
			});
			const hostEvents = Array.isArray(hostResponse?.data) ? hostResponse.data : [];
			for (const event of hostEvents) {
				if (event?.id != null) eventMap.set(event.id, event);
			}

			if (ownerGroupIds.size) {
				const ids = Array.from(ownerGroupIds).join(',');
				const ownerResponse = await listVolunteerEvents({
					fetch,
					query: {
						host_group_id: `in.(${ids})`,
						order: 'event_start.desc',
						limit: 100
					}
				});
				const ownerEvents = Array.isArray(ownerResponse?.data) ? ownerResponse.data : [];
				for (const event of ownerEvents) {
					if (event?.id != null) eventMap.set(event.id, event);
				}
			}

			const combined = Array.from(eventMap.values());
			combined.sort((a, b) => {
				const aStart = parseEventDate(a?.event_start) ?? new Date(0);
				const bStart = parseEventDate(b?.event_start) ?? new Date(0);
				return bStart - aStart;
			});

			managedEvents = combined;
			managedEventsLoadedFor = userId;
		} catch (error) {
			console.error('Failed to load managed volunteer events', error);
			managedEventsError = 'Unable to load your hosted events right now.';
			managedEventsLoadedFor = userId;
		} finally {
			managedEventsLoading = false;
		}
	}

	async function loadOwnedGroupIds(userId) {
		const ownerGroupIds = new Set();
		try {
			const response = await fetch(`/api/v1/group-members?user_id=eq.${userId}&role=eq.owner`);
			if (!response.ok) {
				throw new Error(`Owner group lookup failed with status ${response.status}`);
			}
			const payload = await response.json();
			const rows = Array.isArray(payload?.data) ? payload.data : [];
			for (const row of rows) {
				if (row?.group_id != null) ownerGroupIds.add(String(row.group_id));
			}
		} catch (error) {
			console.warn('Failed to load owned groups for volunteer events', error);
		}
		return ownerGroupIds;
	}

	$effect(() => {
		if (!browser) return;
		const sp = new URLSearchParams(window.location.search);
		searchInput = sp.get('search') ?? '';
		locationQ = sp.get('location') ?? '';
		hostGroupId = sp.get('hostGroupId') ?? '';
		eventType = sp.get('eventType') ?? '';
		view = sp.get('view') ?? 'list';
	});

	$effect(() => {
		if (!browser || !showManagedEventsSection) return;
		const userId = currentUser?.id ?? '';
		if (!userId) {
			managedEvents = [];
			managedEventsError = '';
			managedEventsLoadedFor = '';
			managedEventsLoading = false;
			return;
		}
		if (managedEventsLoading) return;
		if (managedEventsLoadedFor === userId) return;
		fetchManagedEventsFor(userId);
	});

	function eventHostGroup(event) {
		const id = event?.host_group_id;
		return id != null ? hostGroupMap.get(String(id)) : undefined;
	}
	function parseEventDate(value) {
		if (!value) return null;
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	function hostGroupLocation(group) {
		if (!group) return '';
		return [group.city, group.state_region, group.country]
			.map((p) => (p || '').trim())
			.filter(Boolean)
			.join(', ');
	}
	function eventLocation(event) {
		if (event?.location_name) return event.location_name;
		const g = eventHostGroup(event);
		if (g?.city || g?.state_region || g?.country) return hostGroupLocation(g);
		return event?.location_address || '';
	}
	function eventTypeLabel(event) {
		return eventTypeMap.get(event?.event_type_slug)?.event_type || '';
	}
	function hostGroupLabel(event) {
		return eventHostGroup(event)?.name || '';
	}

	const df = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
	const tf = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function eventDateRange(event) {
		const start = parseEventDate(event?.event_start);
		const end = parseEventDate(event?.event_end);
		if (!start) return 'Date to be announced';
		if (!end || end.getTime() === start.getTime() || start.toDateString() === end.toDateString()) {
			return df.format(start);
		}
		return `${df.format(start)} → ${df.format(end)}`;
	}

	function eventTimeRangeOnly(event) {
		const start = parseEventDate(event?.event_start);
		const end = parseEventDate(event?.event_end);
		if (!start) return '';
		if (!end || end.getTime() === start.getTime()) {
			return tf.format(start);
		}
		const sameDay = start.toDateString() === end.toDateString();
		if (sameDay) {
			return `${tf.format(start)} – ${tf.format(end)}`;
		}
		return `${tf.format(start)} → ${tf.format(end)}`;
	}

	function eventTimeRange(event) {
		const start = parseEventDate(event?.event_start);
		const end = parseEventDate(event?.event_end);
		if (!start) return 'Date to be announced';
		if (!end || end.getTime() === start.getTime()) {
			return `${df.format(start)} · ${tf.format(start)}`.trim();
		}
		const sameDay = start.toDateString() === end.toDateString();
		if (sameDay) {
			return `${df.format(start)} · ${tf.format(start)} – ${tf.format(end)}`.trim();
		}
		return `${df.format(start)} ${tf.format(start)} → ${df.format(end)} ${tf.format(end)}`.trim();
	}

	function coordsFor(e) {
		if (e?.latitude != null && e?.longitude != null)
			return [Number(e.latitude), Number(e.longitude)];
		const g = eventHostGroup(e);
		if (g?.latitude != null && g?.longitude != null)
			return [Number(g.latitude), Number(g.longitude)];
		return null;
	}

	const indexedEvents = $derived(
		events.map((e) => {
			const g = eventHostGroup(e);
			const hostOrgName = getHostOrgNameForEvent(e);
			const searchBlob = [
				e.title,
				e.summary,
				e.description,
				e.location_name,
				e.location_address,
				g?.name,
				hostGroupLocation(g),
				hostOrgName
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			const locBlob = [e.location_name, e.location_address, hostGroupLocation(g)]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			return {
				...e,
				_search: searchBlob,
				_loc: locBlob,
				_coords: coordsFor(e),
				_hostGroupName: hostGroupLabel(e),
				_hostOrgName: hostOrgName
			};
		})
	);

	const normalizedSearch = $derived(searchInput.trim().toLowerCase());
	const normalizedLocation = $derived(locationQ.trim().toLowerCase());
	const selectedHostId = $derived(hostGroupId?.trim() ? hostGroupId.trim() : '');
	const selectedEventType = $derived(eventType?.trim() ? eventType.trim() : '');

	const todayStart = $derived(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	});

	const sortedEvents = $derived(
		[...indexedEvents].sort((a, b) => {
			const aS = parseEventDate(a?.event_start) ?? new Date(0);
			const bS = parseEventDate(b?.event_start) ?? new Date(0);
			return aS - bS;
		})
	);

	const filteredEvents = $derived(
		sortedEvents.filter((e) => {
			const start = parseEventDate(e?.event_start);
			if (!start || start < todayStart) return false;

			if (normalizedSearch && !e._search.includes(normalizedSearch)) return false;
			if (normalizedLocation && !e._loc.includes(normalizedLocation)) return false;

			if (selectedHostId) {
				if (!e.host_group_id || String(e.host_group_id) !== String(selectedHostId)) return false;
			}
			if (selectedEventType && e.event_type_slug !== selectedEventType) return false;

			return true;
		})
	);
	const totalUpcoming = $derived(filteredEvents.length);

	function toDateKey(date) {
		if (!date) return '';
		return date.toISOString().slice(0, 10);
	}
	const eventsByDate = $derived(
		filteredEvents.reduce((acc, e) => {
			const key = toDateKey(parseEventDate(e.event_start));
			if (!key) return acc;
			(acc[key] ??= []).push(e);
			return acc;
		}, /** @type {Record<string, any[]>} */ ({}))
	);

	function startOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}
	function earliestEventMonth() {
		const first = filteredEvents[0] ?? sortedEvents[0];
		const start = parseEventDate(first?.event_start);
		return start ? startOfMonth(start) : startOfMonth(new Date());
	}

	let calendarReference = $state(earliestEventMonth());
	function changeMonth(offset) {
		const next = new Date(calendarReference);
		next.setMonth(next.getMonth() + offset);
		calendarReference = startOfMonth(next);
	}

	const calendarMatrix = $derived(buildCalendarMatrix(calendarReference, eventsByDate));
	function buildCalendarMatrix(reference, lookup) {
		const monthStart = startOfMonth(reference);
		const month = monthStart.getMonth();
		const year = monthStart.getFullYear();
		const firstWeekday = monthStart.getDay();
		const firstDate = new Date(monthStart);
		firstDate.setDate(firstDate.getDate() - firstWeekday);

		const weeks = [];
		for (let w = 0; w < 6; w += 1) {
			const days = [];
			for (let d = 0; d < 7; d += 1) {
				const current = new Date(firstDate);
				current.setDate(firstDate.getDate() + w * 7 + d);
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

	const tfShort = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
	const calendarHeaderText = $derived.by(() => {
		const monthLabel = new Intl.DateTimeFormat(undefined, {
			month: 'long',
			year: 'numeric'
		}).format(calendarReference);

		let earliestEvent = null;
		for (const week of calendarMatrix) {
			for (const day of week) {
				if (day.inMonth && day.events.length > 0) {
					earliestEvent = day.events[0];
					break;
				}
			}
			if (earliestEvent) break;
		}

		if (earliestEvent) {
			const earliestDate = parseEventDate(earliestEvent.event_start);
			if (earliestDate) {
				return `${monthLabel}`;
			}
		}
		return monthLabel;
	});

	const mobileWeekDays = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const weekWithToday = calendarMatrix.find((week) =>
			week.some((d) => d.date.toDateString() === today.toDateString())
		);
		if (weekWithToday) return weekWithToday;

		const weekWithEvents = calendarMatrix.find((week) => week.some((d) => d.events?.length));
		return weekWithEvents ?? calendarMatrix[0] ?? [];
	});

	let mapContainer = $state(null);
	let leafletModule = $state(null);
	let mapInstance = $state(null);
	let markerLayer = $state(null);

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

	let markerQueued = false;
	function queueMarkerUpdate() {
		if (markerQueued) return;
		markerQueued = true;
		requestAnimationFrame(() => {
			markerQueued = false;
			updateMarkers();
		});
	}
	function updateMarkers() {
		if (!browser || !leafletModule || !mapInstance || !markerLayer) return;
		markerLayer.clearLayers();
		const pts = [];
		for (const e of filteredEvents) {
			const coords = e._coords;
			if (!coords) continue;
			const m = leafletModule.marker(coords).addTo(markerLayer);
			const popup = document.createElement('div');
			popup.className = 'space-y-1 text-sm';
			const link = document.createElement('a');
			link.href = `/volunteer/${e.slug}`;
			link.className = 'text-secondary-400 font-semibold hover:underline';
			link.textContent = e.title || 'Volunteer event';
			popup.appendChild(link);
			const t = document.createElement('div');
			t.textContent = eventTimeRange(e);
			popup.appendChild(t);
			const loc = eventLocation(e);
			if (loc) {
				const el = document.createElement('div');
				el.textContent = loc;
				popup.appendChild(el);
			}
			const hostName = hostGroupLabel(e) || e._hostOrgName;
			if (hostName) {
				const el = document.createElement('div');
				el.textContent = `Hosted by ${hostName}`;
				popup.appendChild(el);
			}
			m.bindPopup(popup);
			pts.push(m.getLatLng());
		}
		if (pts.length) {
			const bounds = leafletModule.latLngBounds(pts);
			mapInstance.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
		} else {
			mapInstance.setView([39.5, -98.35], 3);
		}
	}
	async function activateMap() {
		if (!browser) return;
		await ensureMap();
		queueMarkerUpdate();
	}

	$effect(() => {
		if (browser && view === 'map') tick().then(() => activateMap());
	});
	$effect(() => {
		if (browser && view === 'map' && mapInstance) queueMarkerUpdate();
	});
	$effect(() => () => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
			markerLayer = null;
		}
	});
</script>

<section class="mx-auto w-full max-w-5xl space-y-6">
	<header class="space-y-2">
		<div class="flex flex-wrap items-center justify-center gap-3">
			<h1 class="m-0 text-center text-3xl font-bold">{title}</h1>
			{#if showCreateButton}
				<a type="button" href={createButtonHref} class="btn btn-sm preset-outlined-secondary-500">
					<IconPlus class="h-4 w-4" />
					Add Event
				</a>
			{/if}
		</div>
		{#if description}
			<p class="text-surface-400 text-center">{description}</p>
		{/if}
	</header>

	{#if showManagedEventsSection && currentUser?.id && managedEvents.length > 0}
		<div class="border-surface-700 bg-surface-900/70 rounded-2xl border p-4">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-lg font-semibold">Your hosted events</h2>
				{#if showCreateButton}
					<a class="btn btn-sm preset-outlined-secondary-500" href={createButtonHref}>
						<IconPlus class="h-3 w-3" />
						New event
					</a>
				{/if}
			</div>
			{#if managedEventsLoading}
				<p class="text-surface-400 mt-2 text-sm">Loading your events…</p>
			{:else if managedEventsError}
				<p class="text-error-300 mt-2 text-sm">{managedEventsError}</p>
			{:else if managedEvents.length === 0}
				<p class="text-surface-400 mt-2 text-sm">
					You don't have any hosted events yet. When you create or manage events, they'll show up
					here.
				</p>
			{:else}
				<ul class="mt-3 space-y-2">
					{#each managedEvents as managedEvent (managedEvent.id)}
						<li
							class="border-surface-700 bg-surface-950/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-2"
						>
							<div class="space-y-1">
								<a
									class="text-secondary-300 font-semibold hover:underline"
									href={`/volunteer/${managedEvent.slug}`}
								>
									{managedEvent.title || 'Untitled event'}
								</a>
								<div class="text-surface-400 text-xs">{eventTimeRange(managedEvent)}</div>
							</div>
							<div class="flex flex-wrap gap-2">
								<a
									class="btn btn-sm preset-outlined-secondary-500"
									href={`/volunteer/${managedEvent.slug}/edit`}
								>
									Edit
								</a>
								<a
									class="btn btn-sm preset-tonal-tertiary"
									href={`/volunteer/${managedEvent.slug}/manage`}
								>
									Manage
								</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="bg-surface-900/60 border-surface-400/20 space-y-5 rounded-2xl border p-5 shadow-xl">
		<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
			<label class="space-y-1 text-sm">
				<span class="text-surface-100 font-semibold">Search</span>
				<input
					type="search"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="Find by title, host, or description"
					bind:value={searchInput}
				/>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-surface-100 font-semibold">Location</span>
				<input
					type="search"
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="City and/or state"
					bind:value={locationQ}
				/>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-surface-100 font-semibold">Host group</span>
				<select
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					bind:value={hostGroupId}
				>
					<option value="">All groups</option>
					{#each hostGroups as host (host.id)}
						<option value={host.id}>{host.name}</option>
					{/each}
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-surface-100 font-semibold">Event type</span>
				<select
					class="bg-surface-800/60 border-surface-500/40 focus:border-secondary-500 focus:ring-secondary-500 w-full rounded-lg border px-3 py-2 text-sm"
					bind:value={eventType}
				>
					<option value="">All types</option>
					{#each eventTypes as option (option.slug)}
						<option value={option.slug}>{option.event_type}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<div
				class="bg-surface-800/70 border-surface-500/40 mx-auto flex shrink-0 items-center overflow-hidden rounded-lg border"
			>
				<button
					class={`px-3 py-1.5 text-sm ${view === 'list' ? 'bg-secondary-500/20 text-secondary-200' : 'text-surface-300'}`}
					onclick={() => (view = 'list')}
				>
					List
				</button>
				<button
					class={`px-3 py-1.5 text-sm ${view === 'calendar' ? 'bg-secondary-500/20 text-secondary-200' : 'text-surface-300'}`}
					onclick={() => (view = 'calendar')}
				>
					Calendar
				</button>
				<button
					class={`px-3 py-1.5 text-sm ${view === 'map' ? 'bg-secondary-500/20 text-secondary-200' : 'text-surface-300'}`}
					onclick={() => (view = 'map')}
				>
					Map
				</button>
			</div>
			<div class="w-full space-y-0.5">
				<div class="text-surface-100 text-center text-sm">
					{totalUpcoming} upcoming event{totalUpcoming === 1 ? '' : 's'}
				</div>
			</div>
		</div>

		{#if view === 'list'}
			<div class="space-y-4" transition:slide={{ duration: 200 }}>
				{#if filteredEvents.length === 0}
					<div class="border-surface-600/50 bg-surface-950/60 rounded-xl border p-6 text-center">
						<h3 class="text-lg font-semibold">No volunteer events found</h3>
						<p class="text-surface-400 text-sm">
							Try adjusting your filters or check back soon for new opportunities.
						</p>
					</div>
				{:else}
					<ul class="space-y-3">
						{#each filteredEvents as event (event.id)}
							{@const hostGroup = eventHostGroup(event)}
							<li class="border-surface-600/50 bg-surface-950/60 rounded-xl border p-4">
								<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<div class="space-y-2">
										<div class="text-secondary-400 text-sm font-semibold tracking-wide uppercase">
											{eventTypeLabel(event)}
										</div>
										<a
											class="text-secondary-200 text-xl font-bold hover:underline"
											href={`/volunteer/${event.slug}`}
										>
											{event.title}
										</a>
										<div class="text-surface-400 text-sm">{eventTimeRange(event)}</div>
										{#if event.summary}
											<p class="text-surface-300 text-sm">{event.summary}</p>
										{/if}
										<div class="text-surface-400 text-sm">
											<span class="font-semibold">Hosted by</span>
											{#if hostGroup && hostGroup.slug}
												<a
													class="text-secondary-200 ml-1 hover:underline"
													href={`/volunteer/groups/${hostGroup.slug}`}
												>
													{hostGroup.name}
												</a>
											{:else if hostGroup}
												<span class="ml-1">{hostGroup.name}</span>
											{:else if event._hostOrgName}
												<span class="ml-1">{event._hostOrgName}</span>
											{/if}
										</div>
										<div class="text-surface-300 text-sm">
											<span class="font-semibold">Location:</span>
											<span class="ml-1">{eventLocation(event) || 'Details coming soon'}</span>
										</div>
									</div>
									<div class="flex flex-col items-start gap-2 md:items-end">
										<a class="btn preset-filled-secondary-500" href={`/volunteer/${event.slug}`}>
											View details
										</a>
										{#if opportunities.length}
											<a
												class="text-secondary-300 text-sm hover:underline"
												href={`/volunteer/${event.slug}#opportunities`}
											>
												{opportunities.length} role{opportunities.length === 1 ? '' : 's'} available
											</a>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if view === 'calendar'}
			<div transition:slide class="space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-xl font-semibold">{calendarHeaderText}</h3>
					<div class="flex gap-2">
						<button
							class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => changeMonth(-1)}
						>
							Prev
						</button>
						<button
							class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => (calendarReference = earliestEventMonth())}
						>
							Today
						</button>
						<button
							class="bg-surface-800/80 hover:bg-surface-700 text-surface-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => changeMonth(1)}
						>
							Next
						</button>
					</div>
				</div>

				<div class="grid gap-2 sm:hidden">
					{#each mobileWeekDays as day}
						<div
							class={`bg-surface-950/40 border-surface-500/20 rounded-xl border p-3 ${day.inMonth ? 'text-surface-100' : 'text-surface-500'}`}
						>
							<div class="flex items-center justify-between">
								<div class="text-xs font-semibold">
									{new Intl.DateTimeFormat(undefined, {
										weekday: 'short',
										month: 'short',
										day: 'numeric'
									}).format(day.date)}
								</div>
								<div class="text-[11px]">
									{day.events.length} event{day.events.length === 1 ? '' : 's'}
								</div>
							</div>
							<div class="mt-2 space-y-1.5">
								{#if day.events.length === 0}
									<p class="text-surface-500 text-xs">No events</p>
								{:else}
									{#each day.events as event}
										<a
											class="bg-secondary-500/10 text-secondary-200 hover:bg-secondary-500/20 block rounded-lg px-2 py-1 text-xs font-medium"
											href={`/volunteer/${event.slug}`}
										>
											<span class="text-secondary-400 font-mono text-xs"
												>{tf.format(parseEventDate(event.event_start))} -</span
											>
											{event.title}
										</a>
									{/each}
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<div class="hidden sm:block">
					<div
						class="text-surface-300 grid grid-cols-7 gap-0 text-center text-[11px] font-semibold tracking-wide uppercase"
					>
						<div>Sun</div>
						<div>Mon</div>
						<div>Tue</div>
						<div>Wed</div>
						<div>Thu</div>
						<div>Fri</div>
						<div>Sat</div>
					</div>
					<div class="grid grid-cols-7 gap-0">
						{#each calendarMatrix as week}
							{#each week as day}
								<div
									class={`bg-surface-950/40 border-surface-500/20 flex h-28 flex-col rounded-xl border p-2 text-left ${day.inMonth ? 'text-surface-100' : 'text-surface-500'}`}
								>
									<div class="text-[11px] font-semibold">{day.date.getDate()}</div>
									<div class="mt-1 space-y-1 overflow-y-auto">
										{#if day.events.length === 0}
											<p class="text-surface-500 text-[11px]">No events</p>
										{:else}
											{#each day.events.slice(0, 3) as event}
												<a
													class="bg-secondary-500/10 text-secondary-200 hover:bg-secondary-500/20 block rounded px-1 py-0.5 text-[11px] font-medium"
													href={`/volunteer/${event.slug}`}
												>
													<span class="text-secondary-400 font-mono text-xs"
														>{tf.format(parseEventDate(event.event_start))} -</span
													>
													{event.title}
												</a>
											{/each}
											{#if day.events.length > 3}
												<div class="text-secondary-300 text-[10px] font-medium">
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
			</div>
		{:else if view === 'map'}
			<div
				transition:slide
				class="bg-surface-900/60 border-surface-400/20 rounded-2xl border shadow-xl"
			>
				<div bind:this={mapContainer} class="h-[480px] w-full rounded-2xl"></div>
				<div class="text-surface-300 border-surface-500/30 border-t px-6 py-3 text-sm">
					Zoom and click markers to preview event details. Some opportunities without mapped
					coordinates are hidden from the map view.
				</div>
			</div>
		{/if}
	</div>
</section>
