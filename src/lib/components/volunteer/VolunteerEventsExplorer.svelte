<script>
	import CalendarDayOverflow from '#lib/components/calendar/CalendarDayOverflow.svelte';
	import {
		buildMonthGrid,
		formatEventTime,
		formatVolunteerSchedule,
		getTimezoneBadge,
		getViewerTimezone,
		parseCalendarDate,
		startOfMonthFromDateKey,
		toCivilDateKey,
		toEventDateKey
	} from '#lib/calendar/monthGrid';
	import { browser } from '$app/env';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { applyVolunteerUrlState, parseVolunteerUrlState } from '#lib/url/directoryUrlState';
	import { onMount, tick, untrack } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import { slide, fade } from 'svelte/transition';

	/** @type {Record<string, any>} */
	let {
		eventsData = [],
		hostGroupsData = [],
		eventTypesData = [],
		hostOrgsData = [],
		opportunitiesData = [],
		user: _user = null,
		title = 'Volunteer',
		description = 'Browse rides, pop-up shops, workshops, and more. Filter by host, type, and location to find the right place to pitch in.',
		showCreateButton = true,
		createButtonHref = '/volunteer/new'
	} = $props();

	/** @type {any} */
	const events = $derived((eventsData ?? []).filter(Boolean));
	/** @type {any} */
	const hostGroups = $derived((hostGroupsData ?? []).filter(Boolean));
	/** @type {any} */
	const eventTypes = $derived((eventTypesData ?? []).filter(Boolean));
	/** @type {any} */
	const hostOrgs = $derived((hostOrgsData ?? []).filter(Boolean));
	/** @type {any} */
	const opportunities = $derived((opportunitiesData ?? []).filter(Boolean));

	/** @type {any} */
	const hostGroupMap = $derived.by(() => {
		const map = new Map();
		for (const g of hostGroups) if (g?.id != null) map.set(String(g.id), g);
		return map;
	});

	/** @type {any} */
	const eventTypeMap = $derived.by(() => {
		const map = new Map();
		for (const t of eventTypes) if (t?.slug) map.set(t.slug, t);
		return map;
	});

	/** @type {any} */
	const hostOrgMap = $derived.by(() => {
		const map = new Map();
		for (const o of hostOrgs) {
			const ids = [o?.id, o?.organization_id, o?.org_id].filter((v) => v != null);
			for (const id of ids) map.set(String(id), o);
		}
		return map;
	});
	/**
	 * @param {any} id
	 */
	function getHostOrgNameById(id) {
		const org = hostOrgMap.get(String(id));
		return org?.name ?? org?.title ?? org?.org_name ?? '';
	}
	/**
	 * @param {any} e
	 */
	function getHostOrgNameForEvent(e) {
		const id = e?.host_org_id ?? e?.host_organization_id ?? e?.organization_id ?? e?.org_id ?? null;
		if (id != null) {
			const name = getHostOrgNameById(id);
			if (name) return name;
		}
		return e?.host_org?.name ?? e?.host_org?.title ?? e?.host_org_name ?? '';
	}

	const initialSearchQuery = untrack(() => page.url.search);
	const initialUrlState = untrack(() => parseVolunteerUrlState(page.url.searchParams));

	let searchInput = $state(initialUrlState.search);
	let appliedSearch = $state(initialUrlState.search);
	let locationInput = $state(initialUrlState.location);
	let locationQ = $state(initialUrlState.location);
	let hostGroupId = $state(initialUrlState.hostGroupId);
	let eventType = $state(initialUrlState.eventType);
	let view = $state(initialUrlState.view);
	let mobileFiltersOpen = $state(
		Boolean(initialUrlState.location || initialUrlState.hostGroupId || initialUrlState.eventType)
	);
	let viewerTimezone = $state('UTC');
	/** @type {HTMLElement | null} */
	let directoryTopEl = $state(null);
	let routerReady = false;
	let searchDebounceTimer;
	let locationDebounceTimer;

	const hasActiveFilters = $derived(
		Boolean(
			searchInput.trim() ||
			appliedSearch.trim() ||
			locationInput.trim() ||
			locationQ.trim() ||
			hostGroupId ||
			eventType
		)
	);

	function scrollToDirectory() {
		if (!directoryTopEl) return;
		directoryTopEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleSearchInput() {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			appliedSearch = searchInput;
			syncUrlToState();
		}, 250);
	}

	function handleLocationInput() {
		clearTimeout(locationDebounceTimer);
		locationDebounceTimer = setTimeout(() => {
			locationQ = locationInput;
			syncUrlToState();
		}, 250);
	}

	function applyLocationImmediately() {
		clearTimeout(locationDebounceTimer);
		locationQ = locationInput;
		syncUrlToState();
	}

	function applySearchAndScroll() {
		clearTimeout(searchDebounceTimer);
		appliedSearch = searchInput;
		syncUrlToState();
		scrollToDirectory();
	}

	function handleSelectFilterChange() {
		syncUrlToState();
	}

	/**
	 * @param {string} nextView
	 */
	function selectView(nextView) {
		view = nextView;
		syncUrlToState();
	}

	/**
	 * @param {any} event
	 */
	function eventHostGroup(event) {
		const id = event?.host_group_id;
		return id != null ? hostGroupMap.get(String(id)) : undefined;
	}
	/**
	 * @param {any} value
	 */
	function parseEventDate(value) {
		return parseCalendarDate(value);
	}
	/**
	 * @param {any} group
	 */
	function hostGroupLocation(group) {
		if (!group) return '';
		return [group.city, group.state_region, group.country]
			.map((p) => (p || '').trim())
			.filter(Boolean)
			.join(', ');
	}
	/**
	 * @param {any} event
	 */
	function eventLocation(event) {
		if (event?.location_name) return event.location_name;
		const g = eventHostGroup(event);
		if (g?.city || g?.state_region || g?.country) return hostGroupLocation(g);
		return event?.location_address || '';
	}
	/**
	 * @param {any} event
	 */
	function eventTypeLabel(event) {
		return eventTypeMap.get(event?.event_type_slug)?.event_type || '';
	}
	/**
	 * @param {any} event
	 */
	function hostGroupLabel(event) {
		return eventHostGroup(event)?.name || '';
	}

	/**
	 * @param {any} event
	 */
	function eventTimeRange(event) {
		return (
			formatVolunteerSchedule(event?.event_start, event?.event_end, event?.timezone) ||
			'Date to be announced'
		);
	}

	function eventStartTime(event) {
		return formatEventTime(event?.event_start, event?.timezone);
	}

	function eventTimezoneBadge(event) {
		return getTimezoneBadge(event?.event_start, event?.timezone, viewerTimezone);
	}

	/**
	 * @param {any} e
	 */
	function coordsFor(e) {
		if (e?.latitude != null && e?.longitude != null)
			return [Number(e.latitude), Number(e.longitude)];
		const g = eventHostGroup(e);
		if (g?.latitude != null && g?.longitude != null)
			return [Number(g.latitude), Number(g.longitude)];
		return null;
	}

	/** @type {any} */
	const indexedEvents = $derived(
		events.map((e) => {
			const g = eventHostGroup(e);
			const hostOrgName = getHostOrgNameForEvent(e);
			/** @type {any} */
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

	/** @type {any} */
	const normalizedSearch = $derived(appliedSearch.trim().toLowerCase());
	/** @type {any} */
	const normalizedLocation = $derived(locationQ.trim().toLowerCase());
	/** @type {any} */
	const selectedHostId = $derived(hostGroupId?.trim() ? hostGroupId.trim() : '');
	/** @type {any} */
	const selectedEventType = $derived(eventType?.trim() ? eventType.trim() : '');

	const currentTime = new Date();

	/** @type {any} */
	const sortedEvents = $derived(
		[...indexedEvents].sort((a, b) => {
			/** @type {any} */
			const aS = parseEventDate(a?.event_start) ?? new Date(0);
			/** @type {any} */
			const bS = parseEventDate(b?.event_start) ?? new Date(0);
			return aS - bS;
		})
	);

	/** @type {any} */
	const filteredEvents = $derived(
		sortedEvents.filter((e) => {
			const start = parseEventDate(e?.event_start);
			const end = parseEventDate(e?.event_end) ?? start;
			if (!start || /** @type {any} */ (end) < currentTime) return false;

			if (normalizedSearch && !e._search.includes(normalizedSearch)) return false;
			if (normalizedLocation && !e._loc.includes(normalizedLocation)) return false;

			if (selectedHostId) {
				if (!e.host_group_id || String(e.host_group_id) !== String(selectedHostId)) return false;
			}
			if (selectedEventType && e.event_type_slug !== selectedEventType) return false;

			return true;
		})
	);
	/** @type {any} */
	const totalUpcoming = $derived(filteredEvents.length);

	/** @type {any} */
	const eventsByDate = $derived(
		filteredEvents.reduce((acc, e) => {
			const key = toEventDateKey(e.event_start, e.timezone);
			if (!key) return acc;
			(acc[key] ??= []).push(e);
			return acc;
		}, /** @type {Record<string, any[]>} */ ({}))
	);

	/**
	 * @param {any} date
	 */
	function startOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}
	const defaultCalendarMonth = $derived.by(() => {
		const first = filteredEvents[0] ?? sortedEvents[0];
		const key = first ? toEventDateKey(first.event_start, first.timezone) : '';
		return key ? startOfMonthFromDateKey(key) : startOfMonth(new Date());
	});

	let calendarReference = $state(untrack(() => initialUrlState.monthDate ?? defaultCalendarMonth));
	let calendarMonthTouched = $state(Boolean(initialUrlState.monthDate));

	$effect(() => {
		if (!calendarMonthTouched && calendarReference.getTime() !== defaultCalendarMonth.getTime()) {
			calendarReference = defaultCalendarMonth;
		}
	});

	function syncUrlToState() {
		if (!browser || !routerReady) return;
		const currentUrl = new URL(window.location.href);
		const nextUrl = applyVolunteerUrlState(currentUrl, {
			search: appliedSearch,
			location: locationQ,
			hostGroupId,
			eventType,
			view,
			monthDate: calendarReference,
			defaultMonthDate: defaultCalendarMonth,
			monthTouched: calendarMonthTouched
		});
		if (nextUrl.href !== currentUrl.href) {
			replaceState(nextUrl, { ...page.state });
		}
	}

	function restoreStateFromUrl(searchParamsInput) {
		clearTimeout(searchDebounceTimer);
		clearTimeout(locationDebounceTimer);
		const restored = parseVolunteerUrlState(searchParamsInput);
		searchInput = restored.search;
		appliedSearch = restored.search;
		locationInput = restored.location;
		locationQ = restored.location;
		hostGroupId = restored.hostGroupId;
		eventType = restored.eventType;
		mobileFiltersOpen = Boolean(restored.location || restored.hostGroupId || restored.eventType);
		view = restored.view;
		if (restored.monthDate) {
			calendarReference = restored.monthDate;
			calendarMonthTouched = true;
		} else {
			calendarMonthTouched = false;
			calendarReference = defaultCalendarMonth;
		}
	}

	function clearVolunteerFilters() {
		clearTimeout(searchDebounceTimer);
		clearTimeout(locationDebounceTimer);
		searchInput = '';
		appliedSearch = '';
		locationInput = '';
		locationQ = '';
		hostGroupId = '';
		eventType = '';
		view = 'list';
		calendarMonthTouched = false;
		calendarReference = defaultCalendarMonth;
		syncUrlToState();
	}

	/**
	 * @param {number} offset
	 */
	function changeMonth(offset) {
		const next = new Date(calendarReference);
		next.setMonth(next.getMonth() + offset);
		calendarReference = startOfMonth(next);
		calendarMonthTouched = true;
		syncUrlToState();
	}

	function resetCalendarToToday() {
		calendarReference = defaultCalendarMonth;
		calendarMonthTouched = false;
		syncUrlToState();
	}

	afterNavigate(({ type }) => {
		routerReady = true;
		if (type === 'popstate' || type === 'link') {
			restoreStateFromUrl(new URL(window.location.href).searchParams);
		} else if (type === 'enter' && window.location.search !== initialSearchQuery) {
			restoreStateFromUrl(new URL(window.location.href).searchParams);
		}
	});

	onMount(() => {
		viewerTimezone = getViewerTimezone('UTC') || 'UTC';
		routerReady = true;
		if (window.location.search !== initialSearchQuery) {
			restoreStateFromUrl(new URL(window.location.href).searchParams);
		} else {
			if (searchInput !== appliedSearch) appliedSearch = searchInput;
			if (locationInput !== locationQ) locationQ = locationInput;
			syncUrlToState();
		}
		const handlePopState = () => {
			restoreStateFromUrl(new URL(window.location.href).searchParams);
		};
		window.addEventListener('popstate', handlePopState);
		return () => {
			clearTimeout(searchDebounceTimer);
			clearTimeout(locationDebounceTimer);
			window.removeEventListener('popstate', handlePopState);
		};
	});

	/** @type {any} */
	const calendarMatrix = $derived(buildMonthGrid(calendarReference, eventsByDate, toCivilDateKey));

	const calendarDayFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
	/** @type {any} */
	const calendarHeaderText = $derived.by(() => {
		const monthLabel = new Intl.DateTimeFormat('en-US', {
			month: 'long',
			year: 'numeric'
		}).format(calendarReference);

		/** @type {any} */
		let earliestEvent = null;
		for (const week of calendarMatrix) {
			for (const day of week) {
				if (day.inMonth && day.items.length > 0) {
					earliestEvent = day.items[0];
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

	/** @type {any} */
	const mobileMonthDays = $derived(
		calendarMatrix.flat().filter((day) => day.inMonth && day.items.length > 0)
	);

	/** @type {any} */
	let mapContainer = $state(null);
	/** @type {any} */
	let leafletModule = $state(null);
	/** @type {any} */
	let mapInstance = $state(null);
	/** @type {any} */
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
		/** @type {any} */
		const pts = [];
		for (const e of filteredEvents) {
			const coords = e._coords;
			if (!coords) continue;
			const m = leafletModule.marker(coords).addTo(markerLayer);
			const popup = document.createElement('div');
			popup.className = 'space-y-1 text-sm';
			popup.style.maxWidth = '240px';
			popup.style.overflowWrap = 'anywhere';
			const link = document.createElement('a');
			link.href = `/volunteer/${e.slug}`;
			link.className = 'text-secondary-600-400 font-semibold hover:underline';
			link.textContent = e.title || 'Volunteer event';
			popup.appendChild(link);
			const t = document.createElement('div');
			t.className = 'flex flex-wrap items-center gap-1.5';
			const timeSpan = document.createElement('span');
			timeSpan.textContent = eventTimeRange(e);
			t.appendChild(timeSpan);
			const tzBadge = eventTimezoneBadge(e);
			if (tzBadge) {
				const badgeEl = document.createElement('span');
				badgeEl.textContent = tzBadge;
				badgeEl.style.padding = '1px 5px';
				badgeEl.style.fontSize = '10px';
				badgeEl.style.fontWeight = '800';
				badgeEl.style.letterSpacing = '0.08em';
				badgeEl.style.textTransform = 'uppercase';
				badgeEl.style.background = '#09090b';
				badgeEl.style.color = '#eab308';
				t.appendChild(badgeEl);
			}
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
		void filteredEvents;
		void viewerTimezone;
		if (browser && view === 'map' && mapInstance) queueMarkerUpdate();
	});
	$effect(() => () => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
			markerLayer = null;
		}
	});

	/** @type {any} */
	const heroStats = $derived([
		{ value: totalUpcoming, label: 'Upcoming events', tone: 'text-primary-500' },
		{ value: hostGroups.length, label: 'Host groups', tone: 'text-tertiary-500' },
		{ value: opportunities.length, label: 'Open roles', tone: 'text-primary-500' }
	]);
</script>

<div class="volunteer-hub-page -m-4 flex w-full flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
		aria-labelledby="volunteer-hero-heading"
	>
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<div class="flex flex-col gap-3">
				<p
					class="text-primary-500 m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
					<span>Show up for safer streets</span>
				</p>

				<h1
					id="volunteer-hero-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					{#if title === 'Volunteer'}
						A little time can move a <span class="text-primary-500">whole community.</span>
					{:else}
						{title}
					{/if}
				</h1>
				<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium text-balance">
					{description}
				</p>
			</div>

			<div class="border-surface-800 flex flex-wrap items-center gap-3 border-t pt-5">
				<a
					href="#volunteer-directory"
					class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
				>
					Find an opportunity
					<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
				</a>
				{#if showCreateButton}
					<a
						href={createButtonHref}
						class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<IconPlus class="h-4 w-4" /> Create an event
					</a>
				{/if}
			</div>
		</div>

		<div
			class="bg-surface-900 text-surface-50 border-surface-800 relative flex flex-col border-t-2 lg:border-t-0 lg:border-l-2"
		>
			<div class="bg-tertiary-500 absolute inset-y-0 left-0 w-2" aria-hidden="true"></div>

			<div class="divide-surface-800 flex flex-1 flex-col divide-y-2 pl-4">
				{#each heroStats as stat, idx (stat.label)}
					<div class="flex flex-1 items-center justify-between gap-4 px-6 py-4 sm:px-8">
						<div class="flex flex-col gap-0.5">
							<span class="text-surface-400 text-[0.65rem] font-bold tracking-[0.2em] uppercase">
								0{idx + 1} / Metric
							</span>
							<span class="text-surface-50 text-sm font-black uppercase sm:text-base">
								{stat.label}
							</span>
						</div>
						<span
							class="{stat.tone} text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
						>
							{stat.value}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- OPPORTUNITY FINDER -->
	<section
		class="bg-surface-900 text-surface-50 border-surface-800 border-b-2 px-6 py-5 sm:px-10 lg:px-12"
		aria-label="Filter volunteer opportunities"
	>
		<div class="grid gap-3">
			<div
				class="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
			>
				<div class="border-surface-700 bg-surface-950 flex border-2">
					<input
						type="search"
						class="bg-surface-950 text-surface-50 placeholder:text-surface-400 min-w-0 flex-1 border-0 px-3.5 py-2.5 text-sm font-medium focus:outline-none"
						aria-label="Search volunteer opportunities"
						bind:value={searchInput}
						oninput={handleSearchInput}
						placeholder="Find by title, host, or description…"
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								applySearchAndScroll();
							}
						}}
					/>
					<button
						type="button"
						class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-xs font-black tracking-wide uppercase transition"
						onclick={applySearchAndScroll}
						aria-label="Search volunteer events"
						title="Search"
					>
						<IconSearch class="h-4 w-4" />
						<span class="max-sm:sr-only">Search</span>
					</button>
				</div>

				<button
					type="button"
					class="border-surface-700 bg-surface-950 text-surface-50 flex items-center justify-between border-2 px-3.5 py-2.5 text-xs font-black tracking-wide uppercase sm:hidden"
					aria-expanded={mobileFiltersOpen}
					aria-controls="volunteer-extra-filters"
					onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}
				>
					{mobileFiltersOpen ? 'Hide filters' : 'More filters'}
					<span aria-hidden="true">{mobileFiltersOpen ? '−' : '+'}</span>
				</button>

				<div
					id="volunteer-extra-filters"
					class={`${mobileFiltersOpen ? 'grid' : 'hidden'} gap-3 sm:contents`}
				>
					<div class="border-surface-700 bg-surface-950 relative flex items-center border-2">
						<IconMapPin class="text-primary-500 pointer-events-none ml-3 h-4 w-4 shrink-0" />
						<input
							type="search"
							class="bg-surface-950 text-surface-50 placeholder:text-surface-400 w-full border-0 py-2.5 pr-3 pl-2 text-sm font-medium focus:outline-none"
							aria-label="Filter by city and state"
							bind:value={locationInput}
							oninput={handleLocationInput}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									applyLocationImmediately();
								}
							}}
							placeholder="City and/or state"
						/>
					</div>

					<select
						class="border-surface-700 bg-surface-950 text-surface-50 border-2 px-3.5 py-2.5 text-xs font-black tracking-wide uppercase focus:outline-none"
						aria-label="Filter by host group"
						bind:value={hostGroupId}
						onchange={handleSelectFilterChange}
					>
						<option value="">All groups</option>
						{#each hostGroups as host (host.id)}
							<option value={String(host.id)}>{host.name}</option>
						{/each}
					</select>

					<select
						class="border-surface-700 bg-surface-950 text-surface-50 border-2 px-3.5 py-2.5 text-xs font-black tracking-wide uppercase focus:outline-none"
						aria-label="Filter by event type"
						bind:value={eventType}
						onchange={handleSelectFilterChange}
					>
						<option value="">All types</option>
						{#each eventTypes as option (option.slug)}
							<option value={option.slug}>{option.event_type}</option>
						{/each}
					</select>
				</div>
			</div>
			{#if hasActiveFilters}
				<div class="flex justify-end">
					<button
						type="button"
						class="border-surface-600 text-surface-200 hover:border-primary-500 hover:text-primary-500 border-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
						onclick={clearVolunteerFilters}
					>
						Clear filters
					</button>
				</div>
			{/if}
		</div>
	</section>

	<!-- RESULTS + DIRECTORY -->
	<section
		id="volunteer-directory"
		class="bg-surface-950 text-surface-50 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-12"
		bind:this={directoryTopEl}
		aria-labelledby="directory-heading"
	>
		<!-- Results toolbar -->
		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Directory</p>
				<h2
					id="directory-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
				>
					Event listings
				</h2>
			</div>

			<div class="flex flex-wrap items-center gap-4">
				<p class="text-surface-300 m-0 text-xs font-bold tracking-wide uppercase tabular-nums">
					{totalUpcoming} upcoming event{totalUpcoming === 1 ? '' : 's'}
				</p>
				<div class="border-surface-700 flex shrink-0 border-2">
					{#each ['list', 'calendar', 'map'] as mode (mode)}
						<button
							type="button"
							class={`px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition ${
								view === mode
									? 'bg-primary-500 text-surface-950'
									: 'bg-surface-950 text-surface-50 hover:bg-surface-800'
							}`}
							aria-pressed={view === mode}
							onclick={() => selectView(mode)}
						>
							{mode}
						</button>
					{/each}
				</div>
			</div>
		</div>

		{#if view === 'list'}
			<div transition:slide={{ duration: 200 }}>
				{#if filteredEvents.length === 0}
					<div
						class="border-surface-50 flex flex-col gap-6 border-t-2 py-12"
						in:fade={{ duration: 200 }}
					>
						<p
							class="text-tertiary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconHeartHandshake class="h-4 w-4" />
							<span>Open calendar</span>
						</p>
						<h3
							class="text-surface-50! m-0 text-3xl leading-none font-black uppercase italic sm:text-5xl"
						>
							No volunteer events found
						</h3>
						<p class="text-surface-300 m-0 max-w-xl text-lg leading-relaxed">
							Try a broader search, clear some filters, or be the first to start a volunteer
							opportunity in this area!
						</p>
						<div class="flex flex-wrap gap-3 pt-2">
							{#if hasActiveFilters}
								<button
									type="button"
									class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 border-[3px] px-6 py-3 text-sm font-black tracking-wide uppercase transition"
									onclick={clearVolunteerFilters}
								>
									Clear filters
								</button>
							{/if}
							{#if showCreateButton}
								<a
									class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
									href={createButtonHref}
								>
									<IconPlus class="h-4 w-4" />
									Create Event
								</a>
							{/if}
						</div>
					</div>
				{:else}
					<ol class="border-surface-50 m-0 list-none border-t-2 p-0">
						{#each filteredEvents as event, i (event.id)}
							{@const hostGroup = eventHostGroup(event)}
							{@const listTzBadge = eventTimezoneBadge(event)}
							{@const eventOpportunityCount = opportunities.filter(
								(opportunity) =>
									String(opportunity?.event_id ?? opportunity?.eventId) === String(event.id)
							).length}
							<li
								class="border-surface-800 flex flex-col gap-6 border-b py-8 lg:flex-row lg:items-start lg:justify-between"
							>
								<div class="flex min-w-0 flex-1 gap-4 sm:gap-6">
									<span
										class="text-tertiary-500 w-10 shrink-0 text-2xl leading-none font-black italic tabular-nums sm:w-14 sm:text-4xl"
									>
										{String(i + 1).padStart(2, '0')}
									</span>

									<div class="flex min-w-0 flex-1 flex-col gap-3">
										<div class="flex flex-wrap items-center gap-2">
											{#if eventTypeLabel(event)}
												<span
													class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
												>
													{eventTypeLabel(event)}
												</span>
											{/if}
											{#if eventOpportunityCount}
												<a
													class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase transition hover:no-underline"
													href={`/volunteer/${event.slug}#opportunities`}
												>
													<IconHeartHandshake class="h-3.5 w-3.5" />
													{eventOpportunityCount} role{eventOpportunityCount === 1 ? '' : 's'} available
												</a>
											{/if}
										</div>

										<a
											class="text-surface-50 hover:text-primary-500 block text-2xl leading-tight font-black uppercase italic hover:no-underline sm:text-3xl"
											href={`/volunteer/${event.slug}`}
										>
											{event.title}
										</a>

										<div
											class="text-primary-500 flex flex-wrap items-center gap-2 text-sm font-bold tracking-wide uppercase"
										>
											<span>{eventTimeRange(event)}</span>
											{#if listTzBadge}
												<span
													class="border-surface-600 bg-surface-900 text-primary-500 shrink-0 border px-2 py-0.5 text-[11px] leading-none font-black tracking-[0.14em] uppercase"
												>
													{listTzBadge}
												</span>
											{/if}
										</div>

										{#if event.summary}
											<p class="text-surface-300 m-0 max-w-3xl text-base leading-relaxed">
												{event.summary}
											</p>
										{/if}

										<div
											class="text-surface-300 flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm"
										>
											<div class="flex items-center gap-1.5">
												<IconUsers class="text-primary-500 h-4 w-4 shrink-0" />
												<span class="font-bold">Hosted by</span>
												{#if hostGroup && hostGroup.slug}
													<a
														class="text-surface-50 decoration-primary-500 hover:text-primary-500 font-bold underline decoration-2 underline-offset-4"
														href={`/volunteer/groups/${hostGroup.slug}`}
													>
														{hostGroup.name}
													</a>
												{:else if hostGroup}
													<span>{hostGroup.name}</span>
												{:else if event._hostOrgName}
													<span>{event._hostOrgName}</span>
												{/if}
											</div>
											<div class="flex items-center gap-1.5">
												<IconMapPin class="text-tertiary-500 h-4 w-4 shrink-0" />
												<span class="font-bold">Location:</span>
												<span>{eventLocation(event) || 'Details coming soon'}</span>
											</div>
										</div>
									</div>
								</div>

								<div class="flex shrink-0 items-start pl-14 lg:pl-0">
									<a
										class="group bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
										href={`/volunteer/${event.slug}`}
									>
										View details
										<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
									</a>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{:else if view === 'calendar'}
			<div transition:slide class="flex flex-col gap-6">
				<div
					class="border-surface-50 flex flex-wrap items-center justify-between gap-4 border-t-2 pt-6"
				>
					<h3
						aria-live="polite"
						aria-atomic="true"
						class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-4xl"
					>
						{calendarHeaderText}
					</h3>
					<div class="flex gap-2">
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:text-surface-950 hover:border-primary-500 border-2 px-4 py-2 text-xs font-black tracking-wide uppercase transition"
							onclick={() => changeMonth(-1)}
						>
							Prev
						</button>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 px-4 py-2 text-xs font-black tracking-wide uppercase transition"
							onclick={resetCalendarToToday}
						>
							Today
						</button>
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:text-surface-950 hover:border-primary-500 border-2 px-4 py-2 text-xs font-black tracking-wide uppercase transition"
							onclick={() => changeMonth(1)}
						>
							Next
						</button>
					</div>
				</div>

				<div class="border-surface-800 divide-surface-800 divide-y border-t border-b sm:hidden">
					{#if mobileMonthDays.length === 0}
						<p class="text-surface-300 m-0 px-3 py-6 text-sm font-bold uppercase">
							No events this month.
						</p>
					{:else}
						{#each mobileMonthDays as day (day.key)}
							<div
								class={`py-4 ${day.inMonth ? 'text-surface-50' : 'text-surface-300 opacity-60'}`}
							>
								<div class="flex items-center justify-between">
									<div class="text-xs font-black tracking-wide uppercase">
										{new Intl.DateTimeFormat(undefined, {
											weekday: 'short',
											month: 'short',
											day: 'numeric'
										}).format(day.date)}
									</div>
									<div class="text-primary-500 text-xs font-bold uppercase tabular-nums">
										{day.items.length} event{day.items.length === 1 ? '' : 's'}
									</div>
								</div>
								<div class="mt-2 flex flex-col gap-1.5">
									{#each day.items as event (event.id)}
										{@const mobileTzBadge = eventTimezoneBadge(event)}
										<a
											class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs font-bold transition hover:no-underline"
											href={`/volunteer/${event.slug}`}
										>
											<span class="text-primary-500 shrink-0 font-mono text-xs tabular-nums">
												{eventStartTime(event)}
											</span>
											{#if mobileTzBadge}
												<span
													class="bg-surface-950 text-primary-500 shrink-0 px-1.5 py-0.5 text-[10px] leading-none font-black tracking-[0.14em] uppercase"
												>
													{mobileTzBadge}
												</span>
											{/if}
											<span class="min-w-0 wrap-anywhere">- {event.title}</span>
										</a>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<table
					class="hidden w-full table-fixed border-collapse sm:table"
					aria-label={calendarHeaderText}
				>
					<thead>
						<tr
							class="bg-secondary-500 text-primary-500 border-surface-50 border-t-2 border-b-2 text-center text-xs font-black tracking-[0.2em] uppercase"
						>
							<th scope="col" class="py-2">Sun</th>
							<th scope="col" class="py-2">Mon</th>
							<th scope="col" class="py-2">Tue</th>
							<th scope="col" class="py-2">Wed</th>
							<th scope="col" class="py-2">Thu</th>
							<th scope="col" class="py-2">Fri</th>
							<th scope="col" class="py-2">Sat</th>
						</tr>
					</thead>
					<tbody class="border-surface-800 border-t border-l">
						{#each calendarMatrix as week (week[0].key)}
							<tr>
								{#each week as day (day.key)}
									<td
										class={`border-surface-800 border-r border-b p-0 text-left align-top ${
											day.inMonth
												? 'bg-surface-950 text-surface-50'
												: 'bg-surface-900 text-surface-300 opacity-50'
										}`}
									>
										<div class="flex h-32 flex-col p-2">
											<div class="text-xs font-black tabular-nums">
												<span aria-hidden="true">{day.date.getDate()}</span>
												<span class="sr-only">{calendarDayFormat.format(day.date)}</span>
											</div>
											<div class="mt-1 flex flex-col gap-1 overflow-y-auto">
												{#if day.items.length === 0}
													<p class="text-surface-300 m-0 text-[11px] opacity-50">No events</p>
												{:else}
													{#each day.items.slice(0, 3) as event (event.id)}
														{@const chipTzBadge = eventTimezoneBadge(event)}
														<a
															class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex min-w-0 items-center gap-1 px-1.5 py-1 text-[11px] font-bold transition hover:no-underline"
															href={`/volunteer/${event.slug}`}
														>
															<span class="shrink-0 font-mono text-[10px] tabular-nums">
																{eventStartTime(event)}
															</span>
															{#if chipTzBadge}
																<span
																	class="bg-surface-950 text-primary-500 shrink-0 px-1 py-0.5 text-[9px] leading-none font-black tracking-wider uppercase"
																>
																	{chipTzBadge}
																</span>
															{/if}
															<span class="min-w-0 truncate">{event.title}</span>
														</a>
													{/each}
												{/if}
											</div>
											{#if day.items.length > 3}
												<CalendarDayOverflow
													dateLabel={calendarDayFormat.format(day.date)}
													itemLabel="volunteer events"
													hiddenCount={day.items.length - 3}
													items={day.items.map((event) => ({
														href: `/volunteer/${event.slug}`,
														title: event.title,
														time: eventStartTime(event),
														timezoneBadge: eventTimezoneBadge(event)
													}))}
												/>
											{/if}
										</div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if view === 'map'}
			<div transition:slide class="border-surface-50 bg-surface-950 border-[3px]">
				<div bind:this={mapContainer} class="h-[480px] w-full"></div>
				<div class="text-surface-300 border-surface-800 border-t-2 px-6 py-4 text-sm">
					Zoom and click markers to preview event details. Some opportunities without mapped
					coordinates are hidden from the map view.
				</div>
			</div>
		{/if}
	</section>
</div>
