<script>
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMap from '@lucide/svelte/icons/map';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import { slide, fade } from 'svelte/transition';

	let {
		eventsData = [],
		hostGroupsData = [],
		eventTypesData = [],
		hostOrgsData = [],
		opportunitiesData = [],
		user = null,
		title = 'Volunteer',
		description = 'Browse rides, pop-up shops, workshops, and more. Filter by host, type, and location to find the right place to pitch in.',
		showCreateButton = true,
		createButtonHref = '/volunteer/new'
	} = $props();

	const events = $derived((eventsData ?? []).filter(Boolean));
	const hostGroups = $derived((hostGroupsData ?? []).filter(Boolean));
	const eventTypes = $derived((eventTypesData ?? []).filter(Boolean));
	const hostOrgs = $derived((hostOrgsData ?? []).filter(Boolean));
	const opportunities = $derived((opportunitiesData ?? []).filter(Boolean));

	const hostGroupMap = $derived.by(() => {
		const map = new Map();
		for (const g of hostGroups) if (g?.id != null) map.set(String(g.id), g);
		return map;
	});

	const eventTypeMap = $derived.by(() => {
		const map = new Map();
		for (const t of eventTypes) if (t?.slug) map.set(t.slug, t);
		return map;
	});

	const hostOrgMap = $derived.by(() => {
		const map = new Map();
		for (const o of hostOrgs) {
			const ids = [o?.id, o?.organization_id, o?.org_id].filter((v) => v != null);
			for (const id of ids) map.set(String(id), o);
		}
		return map;
	});
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

	$effect(() => {
		if (!browser) return;
		const sp = new URLSearchParams(window.location.search);
		searchInput = sp.get('search') ?? '';
		locationQ = sp.get('location') ?? '';
		hostGroupId = sp.get('hostGroupId') ?? '';
		eventType = sp.get('eventType') ?? '';
		view = sp.get('view') ?? 'list';
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
			link.className = 'text-secondary-600-400 font-semibold hover:underline';
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

<section class="volunteer-hub-page mx-auto w-full max-w-7xl flex-col gap-10 space-y-7 pb-10">
	<!-- ═══════════════════════════════════════════════
	     HERO
	═══════════════════════════════════════════════ -->
	<div class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:p-10"
		>
			<!-- Left: headline + chips + stats -->
			<div class="flex flex-col gap-7">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconHeartHandshake class="h-3.5 w-3.5" />
						Volunteer
					</span>
					<span class="chip preset-tonal-secondary">Give Back</span>
					<span class="chip preset-tonal-tertiary">Community</span>
				</div>

				<div class="space-y-4">
					<h1
						class="volunteer-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						{title || 'Find your people.'}<br />
						<span class="volunteer-headline-accent">Uplift your people.</span>
					</h1>
					{#if description}
						<p class="max-w-xl text-base leading-relaxed opacity-75">
							{description}
						</p>
					{/if}
				</div>

				<!-- Stat cards -->
				<div class="grid gap-3 sm:grid-cols-3">
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
						<div class="text-3xl font-black tabular-nums">{totalUpcoming}</div>
					</div>
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-secondary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconUsers class="h-4 w-4" />
							Host Groups
						</div>
						<div class="text-3xl font-black tabular-nums">{hostGroups.length}</div>
					</div>
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-tertiary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconHeartHandshake class="h-4 w-4" />
							Open Roles
						</div>
						<div class="text-3xl font-black tabular-nums">{opportunities.length}</div>
					</div>
				</div>
			</div>

			<!-- Right: search + actions -->
			<div
				class="search-panel card preset-filled-surface-50-950 flex flex-col gap-5 p-6 shadow-2xl"
			>
				<div class="space-y-1">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] uppercase opacity-60"
					>
						<IconSparkles class="h-4 w-4" />
						Explore opportunities
					</div>
					<h2 class="text-xl font-bold">Search by host, type, or location</h2>
				</div>

				<div class="flex flex-col gap-3">
					<div class="relative">
						<IconSearch
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
						/>
						<input
							type="search"
							class="input bg-surface-950-50/5 pl-9"
							bind:value={searchInput}
							placeholder="Find by title, host, or description"
						/>
					</div>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div class="relative">
							<IconMapPin
								class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
							/>
							<input
								type="search"
								class="input bg-surface-950-50/5 pl-9 text-sm"
								bind:value={locationQ}
								placeholder="City and/or state"
							/>
						</div>

						<select class="select bg-surface-950-50/5 text-sm" bind:value={hostGroupId}>
							<option value="">All groups</option>
							{#each hostGroups as host (host.id)}
								<option value={host.id}>{host.name}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-2">
						<div
							class="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-50"
						>
							Event type
						</div>
						<select class="select bg-surface-950-50/5 text-sm" bind:value={eventType}>
							<option value="">All types</option>
							{#each eventTypes as option (option.slug)}
								<option value={option.slug}>{option.event_type}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if showCreateButton}
					<div class="mt-auto grid pt-2">
						<a class="btn preset-filled-primary-500 gap-2" href={createButtonHref}>
							<IconPlus class="h-4 w-4" />
							Create Event
						</a>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- ═══════════════════════════════ RESULTS + DIRECTORY ═════════════════════════════ -->
	<div class="space-y-5 pt-4">
		<!-- Results toolbar -->
		<div class="flex items-center justify-between gap-2">
			<div>
				<p class="label opacity-60">Directory</p>
				<h2 class="text-2xl font-bold">Event listings</h2>
			</div>

			<div class="flex flex-col items-end gap-2">
				<p class="text-sm tabular-nums opacity-60">
					{totalUpcoming} upcoming event{totalUpcoming === 1 ? '' : 's'}
				</p>
				<div
					class="bg-surface-200-800/70 border-surface-500/40 flex shrink-0 items-center overflow-hidden rounded-lg border"
				>
					<button
						class={`px-3 py-1.5 text-sm transition-colors ${view === 'list' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (view = 'list')}
					>
						List
					</button>
					<button
						class={`px-3 py-1.5 text-sm transition-colors ${view === 'calendar' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (view = 'calendar')}
					>
						Calendar
					</button>
					<button
						class={`px-3 py-1.5 text-sm transition-colors ${view === 'map' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (view = 'map')}
					>
						Map
					</button>
				</div>
			</div>
		</div>

		{#if view === 'list'}
			<div class="space-y-4" transition:slide={{ duration: 200 }}>
				{#if filteredEvents.length === 0}
					<!-- Empty state -->
					<div
						class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
						in:fade={{ duration: 200 }}
					>
						<div class="app-empty-orb" aria-hidden="true"></div>
						<div class="relative z-10 mx-auto max-w-lg space-y-4">
							<div
								class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
							>
								<IconHeartHandshake class="h-10 w-10 opacity-60" />
							</div>
							<h3 class="text-2xl font-bold">No volunteer events found</h3>
							<p class="text-sm leading-relaxed opacity-70">
								Try a broader search, clear some filters, or be the first to start a volunteer
								opportunity in this area!
							</p>
							<div class="flex flex-wrap justify-center gap-3 pt-2">
								{#if searchInput || locationQ || hostGroupId || eventType}
									<button
										class="btn preset-outlined-surface-950-50"
										onclick={() => {
											searchInput = '';
											locationQ = '';
											hostGroupId = '';
											eventType = '';
										}}
									>
										Clear filters
									</button>
								{/if}
								{#if showCreateButton}
									<a class="btn preset-filled-primary-500 gap-2" href={createButtonHref}>
										<IconPlus class="h-4 w-4" />
										Create Event
									</a>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<ul class="space-y-4">
						{#each filteredEvents as event, i (event.id)}
							{@const hostGroup = eventHostGroup(event)}
							<li
								class="event-card border-surface-400-600/50 bg-surface-50-950/60 hover:border-primary-500/40 hover:shadow-primary-500/10 rounded-xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
								style="--stagger: {i % 10}"
							>
								<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
									<div class="space-y-2.5">
										<div class="flex items-center gap-2">
											<span class="chip preset-tonal-secondary text-xs font-semibold tracking-wide">
												{eventTypeLabel(event)}
											</span>
											{#if opportunities.length}
												<a
													class="chip preset-tonal-tertiary hover:bg-tertiary-500/30 gap-1 text-xs transition-colors"
													href={`/volunteer/${event.slug}#opportunities`}
												>
													<IconHeartHandshake class="h-3 w-3" />
													{opportunities.length} role{opportunities.length === 1 ? '' : 's'} available
												</a>
											{/if}
										</div>
										<a
											class="text-surface-950-50 block text-xl font-bold hover:underline"
											href={`/volunteer/${event.slug}`}
										>
											{event.title}
										</a>
										<div class="text-surface-600-400 text-sm font-medium">
											{eventTimeRange(event)}
										</div>
										{#if event.summary}
											<p class="text-surface-700-300 text-sm leading-relaxed">{event.summary}</p>
										{/if}
										<div class="mt-2 space-y-1">
											<div class="text-surface-600-400 flex items-center gap-1.5 text-sm">
												<IconUsers class="h-4 w-4 shrink-0 opacity-70" />
												<span class="font-semibold">Hosted by</span>
												{#if hostGroup && hostGroup.slug}
													<a
														class="text-secondary-800-200 ml-0.5 hover:underline"
														href={`/volunteer/groups/${hostGroup.slug}`}
													>
														{hostGroup.name}
													</a>
												{:else if hostGroup}
													<span class="ml-0.5">{hostGroup.name}</span>
												{:else if event._hostOrgName}
													<span class="ml-0.5">{event._hostOrgName}</span>
												{/if}
											</div>
											<div class="text-surface-700-300 flex items-center gap-1.5 text-sm">
												<IconMapPin class="h-4 w-4 shrink-0 opacity-70" />
												<span class="font-semibold">Location:</span>
												<span class="ml-0.5">{eventLocation(event) || 'Details coming soon'}</span>
											</div>
										</div>
									</div>
									<div class="flex shrink-0 flex-col items-start gap-2 pt-1 md:items-end">
										<a
											class="btn preset-outlined-primary-500 w-full sm:w-auto"
											href={`/volunteer/${event.slug}`}
										>
											View details
										</a>
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
							class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => changeMonth(-1)}
						>
							Prev
						</button>
						<button
							class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => (calendarReference = earliestEventMonth())}
						>
							Today
						</button>
						<button
							class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
							onclick={() => changeMonth(1)}
						>
							Next
						</button>
					</div>
				</div>

				<div class="grid gap-2 sm:hidden">
					{#each mobileWeekDays as day, i}
						<div
							class={`event-card bg-surface-50-950/40 border-surface-500/20 rounded-xl border p-3 ${day.inMonth ? 'text-surface-900-100' : 'text-surface-500'}`}
							style="--stagger: {i % 10}"
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
											class="bg-secondary-500/10 text-secondary-800-200 hover:bg-secondary-500/20 block rounded-lg px-2 py-1 text-xs font-medium"
											href={`/volunteer/${event.slug}`}
										>
											<span class="text-secondary-600-400 font-mono text-xs"
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
						class="text-surface-700-300 grid grid-cols-7 gap-0 text-center text-[11px] font-semibold tracking-wide uppercase"
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
						{#each calendarMatrix as week, i}
							{#each week as day, j}
								<div
									class={`event-card bg-surface-50-950/40 border-surface-500/20 hover:bg-surface-200-800/20 flex h-28 flex-col rounded-xl border p-2 text-left transition-colors ${day.inMonth ? 'text-surface-900-100' : 'text-surface-500'}`}
									style="--stagger: {(i * 7 + j) % 21}"
								>
									<div class="text-[11px] font-semibold">{day.date.getDate()}</div>
									<div class="mt-1 space-y-1 overflow-y-auto">
										{#if day.events.length === 0}
											<p class="text-surface-500 text-[11px]">No events</p>
										{:else}
											{#each day.events.slice(0, 3) as event}
												<a
													class="bg-secondary-500/10 text-secondary-800-200 hover:bg-secondary-500/20 block rounded px-1 py-0.5 text-[11px] font-medium"
													href={`/volunteer/${event.slug}`}
												>
													<span class="text-secondary-600-400 font-mono text-xs"
														>{tf.format(parseEventDate(event.event_start))} -</span
													>
													{event.title}
												</a>
											{/each}
											{#if day.events.length > 3}
												<div class="text-secondary-700-300 text-[10px] font-medium">
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
				class="bg-surface-100-900/60 border-surface-600-400/20 rounded-2xl border shadow-xl"
			>
				<div bind:this={mapContainer} class="h-[480px] w-full rounded-2xl"></div>
				<div class="text-surface-700-300 border-surface-500/30 border-t px-6 py-3 text-sm">
					Zoom and click markers to preview event details. Some opportunities without mapped
					coordinates are hidden from the map view.
				</div>
			</div>
		{/if}
	</div>
</section>
