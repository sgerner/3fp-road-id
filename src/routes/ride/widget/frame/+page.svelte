<script>
	import { browser } from '$app/environment';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCalendarRange from '@lucide/svelte/icons/calendar-range';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconList from '@lucide/svelte/icons/list';
	import IconMap from '@lucide/svelte/icons/map';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconX from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import 'leaflet/dist/leaflet.css';
	import {
		extractRideCity,
		extractRideState,
		formatRideWidgetTitle
	} from '$lib/rides/widgetConfig';

	const { data } = $props();

	const DIFFICULTY_COLORS = {
		beginner: '#34d399',
		easy: '#22c55e',
		casual: '#14b8a6',
		family: '#84cc16',
		intermediate: '#f59e0b',
		moderate: '#f59e0b',
		challenging: '#f97316',
		advanced: '#ef4444',
		expert: '#a855f7',
		uncategorized: '#64748b'
	};
	const DIFFICULTY_FALLBACK_PALETTE = [
		'#06b6d4',
		'#84cc16',
		'#f59e0b',
		'#ef4444',
		'#a855f7',
		'#14b8a6',
		'#eab308',
		'#f43f5e'
	];

	let view = $state('list');
	let hasInitializedView = $state(false);
	let search = $state('');
	let selectedDifficulty = $state('all');
	let locationFilter = $state('');
	let datePreset = $state('anytime');
	let customStartDate = $state('');
	let customEndDate = $state('');
	let pageNumber = $state(1);
	let calendarReference = $state(startOfMonth(new Date()));
	let dayModal = $state({ open: false, dateLabel: '', rides: [] });

	let mapEl = $state(null);
	let map;
	let markerLayer;
	let L;

	const PAGE_SIZE = 8;
	const config = $derived(data?.config ?? {});
	const rides = $derived((data?.rides ?? []).filter(Boolean));
	const showFilters = $derived(Boolean(config.showUserFilters));
	const resolvedTheme = $derived.by(() => {
		if (config.theme === 'light' || config.theme === 'dark') return config.theme;
		if (browser && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
		return 'light';
	});

	const baseFilteredRides = $derived(
		rides.filter((ride) => {
			if (!showFilters) return true;

			const query = search.trim().toLowerCase();
			const matchesQuery =
				!query ||
				[
					ride.title,
					ride.summary,
					ride.description,
					ride.startLocationName,
					ride.startLocationAddress,
					ride.group?.name
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
					.includes(query);

			const locationQuery = locationFilter.trim().toLowerCase();
			const locationTokens = locationQuery
				.replace(/[^a-z0-9]+/g, ' ')
				.split(/\s+/)
				.filter(Boolean);
			const locationHaystack = [
				ride.startLocationName,
				ride.startLocationAddress,
				ride.group?.city,
				ride.group?.state_region,
				ride.group?.zip_code,
				extractRideCity(ride),
				extractRideState(ride)
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ');
			const matchesLocation =
				!locationTokens.length || locationTokens.every((token) => locationHaystack.includes(token));

			const rideDate = parseRideDate(ride?.nextOccurrenceStart);
			const inDateRange = matchesDateRange(rideDate, datePreset, customStartDate, customEndDate);

			return matchesQuery && matchesLocation && inDateRange;
		})
	);

	const filteredRides = $derived(
		baseFilteredRides.filter((ride) => {
			if (!showFilters || selectedDifficulty === 'all') return true;
			return getRideDifficultyLabel(ride) === selectedDifficulty;
		})
	);

	const totalPages = $derived(Math.max(1, Math.ceil(filteredRides.length / PAGE_SIZE)));
	const pagedRides = $derived(
		filteredRides.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE)
	);

	const datedRides = $derived(
		filteredRides
			.map((ride) => {
				const start = parseRideDate(ride?.nextOccurrenceStart);
				return start ? { ...ride, _calendarStart: start } : null;
			})
			.filter(Boolean)
	);

	const ridesByDate = $derived(
		datedRides.reduce((acc, ride) => {
			const key = toDateKey(ride._calendarStart);
			if (!key) return acc;
			(acc[key] ??= []).push(ride);
			return acc;
		}, {})
	);

	const calendarMatrix = $derived(buildCalendarMatrix(calendarReference, ridesByDate));
	const calendarHeader = $derived.by(() =>
		new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarReference)
	);

	const legendEntries = $derived.by(() => {
		const names = new Set();
		for (const ride of baseFilteredRides) {
			names.add(getRideDifficultyLabel(ride));
		}
		return Array.from(names).map((name) => ({ name, color: difficultyColor(name) }));
	});

	$effect(() => {
		if (hasInitializedView) return;
		const nextDefaultTab = data?.config?.defaultTab;
		if (['list', 'calendar', 'map'].includes(nextDefaultTab)) {
			view = nextDefaultTab;
		}
		hasInitializedView = true;
	});

	$effect(() => {
		void filteredRides;
		pageNumber = 1;
	});

	$effect(() => {
		if (pageNumber > totalPages) pageNumber = totalPages;
		if (pageNumber < 1) pageNumber = 1;
	});

	function parseRideDate(value) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function startOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function toDateKey(date) {
		if (!date) return '';
		return date.toISOString().slice(0, 10);
	}

	function matchesDateRange(date, preset, startDateRaw, endDateRaw) {
		if (!date) return false;
		if (preset === 'anytime') return true;

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const rideDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

		if (preset === 'today') {
			return rideDay.getTime() === today.getTime();
		}

		if (preset === 'tomorrow') {
			const tomorrow = new Date(today);
			tomorrow.setDate(today.getDate() + 1);
			return rideDay.getTime() === tomorrow.getTime();
		}

		if (preset === 'this_week' || preset === 'next_week') {
			const day = today.getDay();
			const startOfWeek = new Date(today);
			startOfWeek.setDate(today.getDate() - day);
			const start = new Date(startOfWeek);
			if (preset === 'next_week') start.setDate(start.getDate() + 7);
			const end = new Date(start);
			end.setDate(start.getDate() + 6);
			return rideDay >= start && rideDay <= end;
		}

		if (preset === 'custom') {
			if (!startDateRaw && !endDateRaw) return true;
			const start = startDateRaw ? new Date(`${startDateRaw}T00:00:00`) : null;
			const end = endDateRaw ? new Date(`${endDateRaw}T23:59:59`) : null;
			if (start && rideDay < start) return false;
			if (end && rideDay > end) return false;
			return true;
		}

		return true;
	}

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
					rides: key && lookup[key] ? lookup[key] : []
				});
			}
			weeks.push(days);
		}
		return weeks;
	}

	const todayKey = toDateKey(new Date());

	function formatNext(ride) {
		if (!ride?.nextOccurrenceStart) return 'Schedule coming soon';
		const start = new Date(ride.nextOccurrenceStart);
		return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
	}

	function formatDayCellDate(ride) {
		if (!ride?.nextOccurrenceStart) return { month: '--', day: '--', time: '--' };
		const start = new Date(ride.nextOccurrenceStart);
		return {
			month: start.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
			day: String(start.getDate()),
			time: start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
		};
	}

	function rideTitle(ride) {
		return formatRideWidgetTitle(ride, config);
	}

	function changeMonth(offset) {
		const next = new Date(calendarReference);
		next.setMonth(next.getMonth() + offset);
		calendarReference = startOfMonth(next);
	}

	function openDayModal(day) {
		if (!day?.rides?.length) return;
		dayModal = {
			open: true,
			dateLabel: new Intl.DateTimeFormat(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric'
			}).format(day.date),
			rides: day.rides
		};
	}

	function closeDayModal() {
		dayModal = { open: false, dateLabel: '', rides: [] };
	}

	function handleBackdropClick(event) {
		if (event.target === event.currentTarget) {
			closeDayModal();
		}
	}

	function normalizeDifficultyName(name) {
		return (name || '').trim().toLowerCase();
	}

	function getRideDifficultyLabel(ride) {
		const first = (ride?.difficultyLevels ?? []).find((level) => level?.name)?.name;
		return first?.trim() || 'Uncategorized';
	}

	function hashString(value) {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash << 5) - hash + value.charCodeAt(index);
			hash |= 0;
		}
		return Math.abs(hash);
	}

	function difficultyColor(name) {
		const key = normalizeDifficultyName(name);
		if (!key) return DIFFICULTY_COLORS.uncategorized;
		if (DIFFICULTY_COLORS[key]) return DIFFICULTY_COLORS[key];
		const fallbackIndex = hashString(key) % DIFFICULTY_FALLBACK_PALETTE.length;
		return DIFFICULTY_FALLBACK_PALETTE[fallbackIndex];
	}

	function primaryDifficulty(ride) {
		return getRideDifficultyLabel(ride);
	}

	function validCoords(ride) {
		return (
			Number.isFinite(Number(ride?.startLatitude)) && Number.isFinite(Number(ride?.startLongitude))
		);
	}

	function markerOptions(ride) {
		const color = config.difficultyColors ? difficultyColor(primaryDifficulty(ride)) : '#0ea5e9';
		return {
			radius: 8,
			color,
			weight: 2,
			opacity: 1,
			fillColor: color,
			fillOpacity: 0.65
		};
	}

	async function initMap() {
		if (!mapEl || map) return;
		try {
			const mod = await import('leaflet');
			L = mod.default || mod;
		} catch (error) {
			console.error('Failed to load map for widget', error);
			return;
		}

		if (!mapEl || map) return;
		map = L.map(mapEl);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		markerLayer = L.layerGroup().addTo(map);
		updateMarkers();
	}

	function updateMarkers() {
		if (!map || !markerLayer || !L) return;
		markerLayer.clearLayers();
		const points = [];

		for (const ride of filteredRides || []) {
			if (!validCoords(ride)) continue;
			const lat = Number(ride.startLatitude);
			const lng = Number(ride.startLongitude);
			const marker = L.circleMarker([lat, lng], markerOptions(ride));
			marker.bindPopup(
				`<div style="min-width:180px"><strong>${rideTitle(ride)}</strong><br/><small>${formatNext(ride)}</small><br/><a href="/ride/${ride.slug}" target="_blank" rel="noopener noreferrer">View ride →</a></div>`
			);
			markerLayer.addLayer(marker);
			points.push([lat, lng]);
		}

		if (points.length) {
			map.fitBounds(L.latLngBounds(points).pad(0.12));
		} else {
			map.setView([37.8, -96], 4);
		}
	}

	$effect(() => {
		if (view === 'map' && mapEl && !map) {
			initMap();
		}
	});

	$effect(() => {
		void filteredRides;
		updateMarkers();
	});

	$effect(() => {
		if (view === 'map' && map) {
			setTimeout(() => map?.invalidateSize(), 120);
		}
	});

	onMount(() => {
		return () => {
			try {
				map?.remove();
				map = null;
				markerLayer = null;
			} catch {
				// ignore
			}
		};
	});
</script>

<svelte:head>
	<title>3FP Ride Directory Widget</title>
</svelte:head>

<div class={`ride-widget-shell theme-${resolvedTheme} density-${config.density}`}>
	<!-- ── Header: subtitle + tabs ── -->
	<div class="widget-header">
		<div class="widget-title-wrap">
			{#if data?.center?.label && config?.radiusMiles}
				<p class="widget-subtle">
					<span class="widget-subtle-dot"></span>
					Rides within {config.radiusMiles} mi of {data.center.label}
				</p>
			{/if}
		</div>
		<div class="widget-tabs-wrap">
			<div class="widget-tabs">
				<button class:active={view === 'list'} onclick={() => (view = 'list')}>
					<IconList class="h-3.5 w-3.5" />
					List
				</button>
				<button class:active={view === 'calendar'} onclick={() => (view = 'calendar')}>
					<IconCalendarRange class="h-3.5 w-3.5" />
					Calendar
				</button>
				<button class:active={view === 'map'} onclick={() => (view = 'map')}>
					<IconMap class="h-3.5 w-3.5" />
					Map
				</button>
			</div>
			{#if config.showAddButton}
				<a href="/ride/new" target="_blank" rel="noopener noreferrer" class="add-event-btn">
					<IconPlus class="h-3.5 w-3.5" />
					Add event
				</a>
			{/if}
		</div>
	</div>

	<!-- ── Difficulty legend / filter chips ── -->
	{#if config.difficultyColors && legendEntries.length}
		<div class="legend">
			{#if showFilters}
				<button
					type="button"
					class={`legend-chip ${selectedDifficulty === 'all' ? 'active' : ''}`}
					onclick={() => (selectedDifficulty = 'all')}
				>
					<i style="background: var(--widget-muted);"></i>
					All Levels
				</button>
			{/if}
			{#each legendEntries as entry}
				{#if showFilters}
					<button
						type="button"
						class={`legend-chip ${selectedDifficulty === entry.name ? 'active' : ''}`}
						onclick={() => (selectedDifficulty = entry.name)}
					>
						<i style={`background:${entry.color}`}></i>
						{entry.name}
					</button>
				{:else}
					<span class="legend-chip">
						<i style={`background:${entry.color}`}></i>
						{entry.name}
					</span>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- ── Filters ── -->
	{#if showFilters}
		<div class="widget-filters" transition:slide={{ duration: 180 }}>
			<label class="field search">
				<span>Search</span>
				<div class="search-input-wrap">
					<IconSearch class="search-icon h-3.5 w-3.5" />
					<input bind:value={search} placeholder="Title, location, host..." />
					{#if search}
						<button class="search-clear" onclick={() => (search = '')} type="button">
							<IconX class="h-3 w-3" />
						</button>
					{/if}
				</div>
			</label>
			<label class="field">
				<span>Date</span>
				<select bind:value={datePreset}>
					<option value="anytime">Anytime</option>
					<option value="today">Today</option>
					<option value="tomorrow">Tomorrow</option>
					<option value="this_week">This week</option>
					<option value="next_week">Next week</option>
					<option value="custom">Custom range</option>
				</select>
			</label>
			<label class="field">
				<span>Location</span>
				<input bind:value={locationFilter} placeholder="City, state, or zip" />
			</label>
			{#if datePreset === 'custom'}
				<label class="field">
					<span>Start date</span>
					<input type="date" bind:value={customStartDate} />
				</label>
				<label class="field">
					<span>End date</span>
					<input type="date" bind:value={customEndDate} />
				</label>
			{/if}
		</div>
	{/if}

	<!-- ── Body ── -->
	<section class="widget-body">
		{#if view === 'list'}
			{#if pagedRides.length}
				<div class="ride-grid">
					{#each pagedRides as ride}
						{@const dt = formatDayCellDate(ride)}
						{@const color = difficultyColor(primaryDifficulty(ride))}
						<a
							href={`/ride/${ride.slug}`}
							target="_blank"
							rel="noopener noreferrer"
							class={`ride-card ${ride.imageUrls?.[0] ? 'has-image' : 'no-image'}`}
							style={config.difficultyColors ? `--diff-color:${color}` : ''}
						>
							<div
								class="date-block"
								style={config.difficultyColors ? `--diff-color:${color}` : ''}
							>
								<strong>{dt.month}</strong>
								<span>{dt.day}</span>
								<small>{dt.time}</small>
							</div>
							{#if ride.imageUrls?.[0]}
								<img src={ride.imageUrls[0]} alt={ride.title} class="ride-image" loading="lazy" />
							{/if}
							<div class="ride-main">
								<div class="ride-card-head">
									<h2>{rideTitle(ride)}</h2>
								</div>
								{#if ride.summary}
									<p class="ride-summary">{ride.summary}</p>
								{/if}
								<div class="ride-card-meta">
									<div class="ride-location">
										<IconMapPin class="h-3.5 w-3.5" />
										<span>{ride.startLocationName || 'Location coming soon'}</span>
									</div>
									{#if ride.group?.name}
										<div class="chip">{ride.group.name}</div>
									{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>
				{#if totalPages > 1}
					<div class="pagination">
						<button disabled={pageNumber <= 1} onclick={() => (pageNumber -= 1)}>
							<IconChevronLeft class="h-3.5 w-3.5" />
						</button>
						<span>{pageNumber} / {totalPages}</span>
						<button disabled={pageNumber >= totalPages} onclick={() => (pageNumber += 1)}>
							<IconChevronRight class="h-3.5 w-3.5" />
						</button>
					</div>
				{/if}
			{:else}
				<div class="app-empty-state">
					<div class="empty-icon">
						<IconBike class="h-8 w-8" />
					</div>
					<p>No rides match the current filters.</p>
					{#if showFilters && (search || selectedDifficulty !== 'all' || locationFilter)}
						<button
							class="empty-clear"
							onclick={() => {
								search = '';
								selectedDifficulty = 'all';
								locationFilter = '';
								datePreset = 'anytime';
							}}
						>
							Clear filters
						</button>
					{/if}
				</div>
			{/if}
		{:else if view === 'calendar'}
			<div class="calendar-wrap">
				<div class="calendar-head">
					<h2>{calendarHeader}</h2>
					<div class="calendar-nav">
						<button onclick={() => changeMonth(-1)} aria-label="Previous month">
							<IconChevronLeft class="h-4 w-4" />
						</button>
						<button onclick={() => (calendarReference = startOfMonth(new Date()))}>Today</button>
						<button onclick={() => changeMonth(1)} aria-label="Next month">
							<IconChevronRight class="h-4 w-4" />
						</button>
					</div>
				</div>
				<div class="calendar-grid days">
					<div>Sun</div>
					<div>Mon</div>
					<div>Tue</div>
					<div>Wed</div>
					<div>Thu</div>
					<div>Fri</div>
					<div>Sat</div>
				</div>
				<div class="calendar-grid">
					{#each calendarMatrix as week}
						{#each week as day}
							{@const isToday = toDateKey(day.date) === todayKey}
							<div class:out={!day.inMonth} class:today={isToday} class="day-cell">
								<div class="day-number" class:today-num={isToday}>{day.date.getDate()}</div>
								<div class="day-rides">
									{#each day.rides.slice(0, 2) as ride}
										{@const c = difficultyColor(primaryDifficulty(ride))}
										<a
											href={`/ride/${ride.slug}`}
											target="_blank"
											rel="noopener noreferrer"
											style={config.difficultyColors ? `border-left-color:${c}` : ''}
										>
											{rideTitle(ride)}
										</a>
									{/each}
								</div>
								{#if day.rides.length > 2}
									<button class="more" type="button" onclick={() => openDayModal(day)}>
										+{day.rides.length - 2} more
									</button>
								{/if}
								{#if day.rides.length === 1 && day.rides.length <= 2}
									<!-- spacer -->
								{/if}
							</div>
						{/each}
					{/each}
				</div>
			</div>
		{:else}
			<div class="map-wrap">
				<div bind:this={mapEl} class="map-canvas"></div>
				<div class="map-hint">
					<IconMapPin class="h-3.5 w-3.5" />
					{filteredRides.length} listing{filteredRides.length === 1 ? '' : 's'} on map
				</div>
			</div>
		{/if}
	</section>

	<footer>
		<a href="https://3fp.org" target="_blank" rel="noopener noreferrer">
			<IconBike class="h-3.5 w-3.5" />
			Powered by 3fp.org
		</a>
	</footer>

	<!-- ── Day modal ── -->
	{#if dayModal.open}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			tabindex="0"
			onclick={handleBackdropClick}
			onkeydown={(event) => event.key === 'Escape' && closeDayModal()}
			transition:fade={{ duration: 150 }}
		>
			<div class="modal" transition:slide={{ duration: 200 }}>
				<div class="modal-head">
					<h3>{dayModal.dateLabel}</h3>
					<button onclick={closeDayModal} class="modal-close">
						<IconX class="h-4 w-4" />
					</button>
				</div>
				<div class="modal-list">
					{#each dayModal.rides as ride}
						{@const c = difficultyColor(primaryDifficulty(ride))}
						<a
							href={`/ride/${ride.slug}`}
							target="_blank"
							rel="noopener noreferrer"
							class="modal-ride"
							style={config.difficultyColors ? `border-left-color:${c}` : ''}
						>
							<strong>{rideTitle(ride)}</strong>
							<small>{formatNext(ride)}</small>
						</a>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ════════════════════════════════════════════
	   CSS TOKENS
	════════════════════════════════════════════ */
	.ride-widget-shell {
		/* Light theme defaults */
		--widget-bg: #f6f8fc;
		--widget-surface: #ffffff;
		--widget-surface-alt: #eef2f8;
		--widget-surface-glass: rgba(255, 255, 255, 0.7);
		--widget-text: #0c1526;
		--widget-text-muted: #5a6a85;
		--widget-line: #dde3ef;
		--widget-accent: #0e7490;
		--widget-accent-2: #7c3aed;
		--widget-accent-soft: rgba(14, 116, 144, 0.1);
		--widget-accent-soft-2: rgba(124, 58, 237, 0.08);
		--widget-radius: 0.875rem;
		--widget-radius-sm: 0.55rem;
		--widget-shadow: 0 2px 12px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05);
		--widget-shadow-hover: 0 6px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06);

		font-family:
			'Inter',
			ui-sans-serif,
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
		display: flex;
		min-height: 100dvh;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0.9rem;
		background: var(--widget-bg);
		background-image:
			radial-gradient(circle at 0% 0%, var(--widget-accent-soft) 0%, transparent 50%),
			radial-gradient(circle at 100% 100%, var(--widget-accent-soft-2) 0%, transparent 50%);
		color: var(--widget-text);
	}

	.ride-widget-shell.theme-dark {
		--widget-bg: #07101e;
		--widget-surface: #0f1d30;
		--widget-surface-alt: #162438;
		--widget-surface-glass: rgba(15, 29, 48, 0.8);
		--widget-text: #e0e8f5;
		--widget-text-muted: #8ca0bc;
		--widget-line: #1e344f;
		--widget-accent: #22d3ee;
		--widget-accent-2: #a78bfa;
		--widget-accent-soft: rgba(34, 211, 238, 0.12);
		--widget-accent-soft-2: rgba(167, 139, 250, 0.1);
		--widget-shadow: 0 2px 12px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2);
		--widget-shadow-hover: 0 6px 24px rgba(0, 0, 0, 0.4), 0 2px 10px rgba(0, 0, 0, 0.25);
	}

	.ride-widget-shell.density-compact {
		padding: 0.6rem;
		gap: 0.6rem;
	}

	/* ════════════════════════════════════════════
	   HEADER & TABS
	════════════════════════════════════════════ */
	.widget-header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
	}

	.widget-subtle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.76rem;
		color: var(--widget-text-muted);
	}
	.widget-subtle-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--widget-accent);
		flex-shrink: 0;
		animation: pulse-dot 2.5s ease-in-out infinite;
	}
	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.75);
		}
	}

	.widget-tabs-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.widget-tabs {
		display: inline-flex;
		align-items: center;
		gap: 0.18rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 999px;
		padding: 0.22rem;
	}

	.widget-tabs button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: none;
		background: transparent;
		color: var(--widget-text-muted);
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease;
	}
	.widget-tabs button:hover {
		color: var(--widget-text);
		background: var(--widget-surface-alt);
	}
	.widget-tabs button.active {
		background: var(--widget-accent);
		color: #fff;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
	}
	.theme-dark .widget-tabs button.active {
		color: #07101e;
	}

	.add-event-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--widget-surface);
		border: 1.5px dashed var(--widget-accent);
		color: var(--widget-accent);
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			background 160ms ease,
			border-style 160ms ease;
	}
	.add-event-btn:hover {
		background: var(--widget-accent-soft);
		border-style: solid;
	}

	/* ════════════════════════════════════════════
	   LEGEND
	════════════════════════════════════════════ */
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.legend-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.22rem 0.55rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 999px;
		color: var(--widget-text-muted);
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}
	.legend-chip.active {
		border-color: var(--widget-accent);
		background: var(--widget-accent-soft);
		color: var(--widget-accent);
	}
	.legend i {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* ════════════════════════════════════════════
	   FILTERS
	════════════════════════════════════════════ */
	.widget-filters {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(10rem, 1fr) minmax(12rem, 1fr);
		gap: 0.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}
	.field span {
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--widget-text-muted);
		padding-left: 0.1rem;
	}
	.field input,
	.field select {
		width: 100%;
		padding: 0.46rem 0.6rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: var(--widget-radius-sm);
		font-size: 0.84rem;
		color: var(--widget-text);
		transition:
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.field input:focus,
	.field select:focus {
		outline: none;
		border-color: var(--widget-accent);
		box-shadow: 0 0 0 2px var(--widget-accent-soft);
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: var(--widget-radius-sm);
		padding: 0 0.6rem;
		transition:
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.search-input-wrap:focus-within {
		border-color: var(--widget-accent);
		box-shadow: 0 0 0 2px var(--widget-accent-soft);
	}
	.field.search .search-input-wrap input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.46rem 0;
		color: var(--widget-text);
	}
	.field.search .search-input-wrap input:focus {
		outline: none;
	}
	.search-icon {
		flex-shrink: 0;
		color: var(--widget-text-muted);
	}
	.search-clear {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		color: var(--widget-text-muted);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		transition: color 120ms;
	}
	.search-clear:hover {
		color: var(--widget-text);
	}

	/* ════════════════════════════════════════════
	   RIDE LIST & CARDS
	════════════════════════════════════════════ */
	.widget-body {
		flex: 1;
	}
	.ride-grid {
		display: grid;
		grid-template-columns: repeat(1, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.ride-card {
		display: grid;
		grid-template-columns: 76px 108px minmax(0, 1fr);
		gap: 0.65rem;
		align-items: stretch;
		padding: 0.75rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: var(--widget-radius);
		text-decoration: none;
		color: inherit;
		box-shadow: var(--widget-shadow);
		transition:
			transform 200ms ease,
			box-shadow 200ms ease,
			border-color 200ms ease;
		position: relative;
		overflow: hidden;
	}
	.ride-card.no-image {
		grid-template-columns: 76px minmax(0, 1fr);
	}
	.ride-card::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 4px;
		background: var(--widget-line);
		border-radius: var(--widget-radius) 0 0 var(--widget-radius);
		transition: background 200ms ease;
	}
	.ride-card[style*='--diff-color']::before {
		background: var(--diff-color);
	}
	.ride-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--widget-shadow-hover);
		border-color: color-mix(in oklab, var(--widget-accent) 35%, var(--widget-line));
	}

	.date-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		background: var(--widget-surface-alt);
		border: 1px solid var(--widget-line);
		border-radius: 0.65rem;
		padding: 0.4rem 0.3rem;
		transition: background 200ms ease;
	}
	.ride-card[style*='--diff-color'] .date-block {
		background: color-mix(in oklab, var(--diff-color) 10%, var(--widget-surface-alt));
		border-color: color-mix(in oklab, var(--diff-color) 25%, var(--widget-line));
	}
	.date-block strong {
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: var(--widget-text-muted);
		text-transform: uppercase;
	}
	.date-block span {
		font-size: 1.3rem;
		font-weight: 800;
		line-height: 1;
		color: var(--widget-text);
	}
	.date-block small {
		font-size: 0.6rem;
		color: var(--widget-text-muted);
		text-align: center;
	}

	.ride-image {
		width: 100%;
		height: 100%;
		min-height: 88px;
		object-fit: cover;
		border-radius: 0.6rem;
		border: 1px solid var(--widget-line);
	}

	.ride-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		justify-content: center;
	}
	.ride-card-head h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1.25;
		color: var(--widget-text);
	}
	.ride-summary {
		margin: 0;
		font-size: 0.82rem;
		color: var(--widget-text-muted);
		line-height: 1.4;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.ride-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		margin-top: auto;
	}
	.ride-location {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.76rem;
		color: var(--widget-text-muted);
		flex: 1;
		min-width: 0;
	}
	.ride-location span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.18rem 0.5rem;
		background: var(--widget-accent-soft);
		border: 1px solid color-mix(in oklab, var(--widget-accent) 25%, var(--widget-line));
		border-radius: 999px;
		color: var(--widget-accent);
		white-space: nowrap;
	}

	/* ── Pagination ── */
	.pagination {
		margin-top: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.pagination button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--widget-line);
		background: var(--widget-surface);
		border-radius: 50%;
		color: var(--widget-text-muted);
		cursor: pointer;
		transition:
			background 140ms,
			border-color 140ms,
			color 140ms;
	}
	.pagination button:hover:not(:disabled) {
		border-color: var(--widget-accent);
		color: var(--widget-accent);
	}
	.pagination button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.pagination span {
		font-size: 0.75rem;
		color: var(--widget-text-muted);
		min-width: 3rem;
		text-align: center;
	}

	/* ── Empty state ── */
	.empty-icon {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		background: var(--widget-surface-alt);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: empty-pulse 2.8s ease-in-out infinite;
	}
	@keyframes empty-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.8;
		}
		50% {
			transform: scale(1.06);
			opacity: 1;
		}
	}
	.app-empty-state p {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 500;
	}
	.empty-clear {
		margin-top: 0.25rem;
		font-size: 0.78rem;
		color: var(--widget-accent);
		background: var(--widget-accent-soft);
		border: 1px solid color-mix(in oklab, var(--widget-accent) 25%, transparent);
		border-radius: 999px;
		padding: 0.3rem 0.8rem;
		cursor: pointer;
		transition: background 140ms;
	}
	.empty-clear:hover {
		background: color-mix(in oklab, var(--widget-accent) 18%, transparent);
	}

	/* ════════════════════════════════════════════
	   CALENDAR
	════════════════════════════════════════════ */
	.calendar-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.calendar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.1rem;
	}
	.calendar-head h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--widget-text);
	}
	.calendar-nav {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 999px;
		padding: 0.2rem;
	}
	.calendar-nav button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--widget-text-muted);
		padding: 0.25rem 0.45rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 140ms,
			color 140ms;
	}
	.calendar-nav button:hover {
		background: var(--widget-surface-alt);
		color: var(--widget-text);
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.28rem;
	}
	.calendar-grid.days div {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--widget-text-muted);
		text-align: center;
		padding: 0.18rem 0;
	}

	.day-cell {
		height: 128px;
		display: flex;
		flex-direction: column;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.6rem;
		padding: 0.35rem;
		overflow: hidden;
		transition: border-color 140ms;
	}
	.day-cell.today {
		border-color: var(--widget-accent);
		background: var(--widget-accent-soft);
	}
	.day-cell.out {
		opacity: 0.4;
	}

	.day-number {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--widget-text-muted);
		margin-bottom: 0.2rem;
		flex-shrink: 0;
	}
	.day-number.today-num {
		color: var(--widget-accent);
	}

	.day-rides {
		display: flex;
		flex-direction: column;
		gap: 0.17rem;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.day-rides a {
		font-size: 0.66rem;
		line-height: 1.25;
		color: var(--widget-text);
		text-decoration: none;
		padding: 0.12rem 0.25rem;
		background: var(--widget-surface-alt);
		border-radius: 0.3rem;
		border-left: 3px solid var(--widget-line);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: background 130ms;
	}
	.day-rides a:hover {
		background: color-mix(in oklab, var(--widget-accent) 10%, var(--widget-surface-alt));
	}
	.more {
		font-size: 0.63rem;
		font-weight: 600;
		color: var(--widget-accent);
		background: var(--widget-accent-soft);
		border: 1px solid color-mix(in oklab, var(--widget-accent) 30%, transparent);
		padding: 0.15rem 0.3rem;
		text-align: left;
		cursor: pointer;
		margin-top: 0.15rem;
		line-height: 1;
		border-radius: 0.3rem;
		width: 100%;
		transition: background 130ms;
	}
	.more:hover {
		background: color-mix(in oklab, var(--widget-accent) 18%, transparent);
	}

	/* ════════════════════════════════════════════
	   MAP
	════════════════════════════════════════════ */
	.map-wrap {
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: var(--widget-radius);
		overflow: hidden;
		box-shadow: var(--widget-shadow);
	}
	.map-canvas {
		height: clamp(320px, 55vh, 560px);
	}
	.map-hint {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.76rem;
		padding: 0.5rem 0.75rem;
		color: var(--widget-text-muted);
		border-top: 1px solid var(--widget-line);
	}

	/* ════════════════════════════════════════════
	   FOOTER
	════════════════════════════════════════════ */
	footer {
		display: flex;
		justify-content: flex-end;
		margin-top: auto;
	}
	footer a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--widget-text-muted);
		text-decoration: none;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		transition:
			color 140ms,
			background 140ms;
	}
	footer a:hover {
		color: var(--widget-accent);
		background: var(--widget-accent-soft);
	}

	/* ════════════════════════════════════════════
	   MODAL
	════════════════════════════════════════════ */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(2, 8, 23, 0.55);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 80;
	}
	.modal {
		width: min(620px, 100%);
		max-height: 80vh;
		overflow: auto;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 1.1rem;
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.3),
			0 8px 24px rgba(0, 0, 0, 0.2);
	}
	.modal-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--widget-line);
		background: var(--widget-surface-glass);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}
	.modal-head h3 {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 700;
	}
	.modal-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid var(--widget-line);
		background: var(--widget-surface-alt);
		border-radius: 50%;
		cursor: pointer;
		color: var(--widget-text-muted);
		transition:
			background 130ms,
			color 130ms;
	}
	.modal-close:hover {
		background: var(--widget-accent-soft);
		color: var(--widget-accent);
	}
	.modal-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.9rem 1rem;
	}
	.modal-ride {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		text-decoration: none;
		color: inherit;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--widget-line);
		border-left: 3px solid var(--widget-line);
		border-radius: 0.6rem;
		background: var(--widget-surface-alt);
		transition:
			transform 140ms ease,
			box-shadow 140ms ease,
			border-color 140ms;
	}
	.modal-ride:hover {
		transform: translateX(2px);
		border-left-color: var(--widget-accent);
	}
	.modal-ride strong {
		font-size: 0.88rem;
		font-weight: 700;
	}
	.modal-ride small {
		font-size: 0.75rem;
		color: var(--widget-text-muted);
	}

	/* ════════════════════════════════════════════
	   RESPONSIVE
	════════════════════════════════════════════ */
	@media (max-width: 920px) {
		.widget-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.widget-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.ride-card {
			grid-template-columns: 70px minmax(0, 1fr);
		}
		.ride-card.has-image .ride-image {
			display: none;
		}
		.day-cell {
			height: 110px;
		}
	}

	@media (max-width: 640px) {
		.widget-filters {
			grid-template-columns: repeat(1, minmax(0, 1fr));
		}
		.calendar-grid {
			gap: 0.18rem;
		}
		.day-cell {
			height: 96px;
		}
		.day-rides a {
			font-size: 0.6rem;
		}
	}
</style>
