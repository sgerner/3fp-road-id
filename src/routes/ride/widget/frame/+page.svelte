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
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
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
	let extraCityFilter = $state('');
	let extraStateFilter = $state('');
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

			const cityQuery = extraCityFilter.trim().toLowerCase();
			const stateQuery = extraStateFilter.trim().toLowerCase();
			const matchesCity = !cityQuery || (extractRideCity(ride) || '').toLowerCase() === cityQuery;
			const matchesState =
				!stateQuery || (extractRideState(ride) || '').toLowerCase() === stateQuery;

			const rideDate = parseRideDate(ride?.nextOccurrenceStart);
			const inDateRange = matchesDateRange(rideDate, datePreset, customStartDate, customEndDate);

			return matchesQuery && matchesCity && matchesState && inDateRange;
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
			radius: 7,
			color,
			weight: 2,
			opacity: 1,
			fillColor: color,
			fillOpacity: 0.6
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
				`<div style="min-width:180px"><strong>${rideTitle(ride)}</strong><br/><small>${formatNext(ride)}</small><br/><a href="/ride/${ride.slug}" target="_blank" rel="noopener noreferrer">View ride</a></div>`
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
	<div class="widget-header">
		<div class="widget-title-wrap">
			{#if data?.center?.label && config?.radiusMiles}
				<p class="widget-subtle">
					Showing rides within {config.radiusMiles} mi of {data.center.label}
				</p>
			{/if}
		</div>
		<div class="widget-tabs">
			<button class:active={view === 'list'} onclick={() => (view = 'list')}>
				<IconList class="h-4 w-4" />
				List
			</button>
			<button class:active={view === 'calendar'} onclick={() => (view = 'calendar')}>
				<IconCalendarRange class="h-4 w-4" />
				Calendar
			</button>
			<button class:active={view === 'map'} onclick={() => (view = 'map')}>
				<IconMap class="h-4 w-4" />
				Map
			</button>
			{#if config.showAddButton}
				<a href="/ride/new" target="_blank" rel="noopener noreferrer">
					<IconPlus class="h-4 w-4" />
					Add event
				</a>
			{/if}
		</div>
	</div>

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

	{#if showFilters}
		<div class="widget-filters" transition:slide={{ duration: 180 }}>
			<label class="field search">
				<span>Search</span>
				<div class="search-input-wrap">
					<IconSearch class="search-icon h-4 w-4" />
					<input bind:value={search} placeholder="Title, location, host..." />
				</div>
			</label>
			<label class="field">
				<span>Date preset</span>
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
				<span>City</span>
				<input bind:value={extraCityFilter} placeholder="Phoenix" />
			</label>
			<label class="field">
				<span>State</span>
				<input bind:value={extraStateFilter} placeholder="AZ" />
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
							class="ride-card"
							style={config.difficultyColors ? `--diff-color:${color}` : ''}
						>
							<div class="date-block">
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
									<p>{ride.summary}</p>
								{/if}
								<div class="ride-card-meta">
									<div>
										<IconMapPin class="h-4 w-4" />
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
				<div class="pagination">
					<button disabled={pageNumber <= 1} onclick={() => (pageNumber -= 1)}>Previous</button>
					<span>Page {pageNumber} / {totalPages}</span>
					<button disabled={pageNumber >= totalPages} onclick={() => (pageNumber += 1)}>Next</button
					>
				</div>
			{:else}
				<div class="empty-state">
					<IconBike class="h-9 w-9" />
					<p>No rides match the current filters.</p>
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
							<div class:out={!day.inMonth} class="day-cell">
								<div class="day-number">{day.date.getDate()}</div>
								<div class="day-rides">
									{#each day.rides.slice(0, 2) as ride}
										{@const c = difficultyColor(primaryDifficulty(ride))}
										<a
											href={`/ride/${ride.slug}`}
											target="_blank"
											rel="noopener noreferrer"
											style={config.difficultyColors ? `border-left:3px solid ${c}` : ''}
										>
											{rideTitle(ride)}
										</a>
									{/each}
								</div>
								{#if day.rides.length > 2}
									<button class="more" type="button" onclick={() => openDayModal(day)}>
										+ {day.rides.length - 2} more
									</button>
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
					{filteredRides.length} listing{filteredRides.length === 1 ? '' : 's'} shown on map.
				</div>
			</div>
		{/if}
	</section>

	<footer>
		<a href="https://3fp.org" target="_blank" rel="noopener noreferrer">Powered by 3fp.org</a>
	</footer>

	{#if dayModal.open}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			tabindex="0"
			onclick={handleBackdropClick}
			onkeydown={(event) => event.key === 'Escape' && closeDayModal()}
		>
			<div class="modal">
				<div class="modal-head">
					<h3>{dayModal.dateLabel}</h3>
					<button onclick={closeDayModal}>Close</button>
				</div>
				<div class="modal-list">
					{#each dayModal.rides as ride}
						<a href={`/ride/${ride.slug}`} target="_blank" rel="noopener noreferrer"
							>{rideTitle(ride)}<small>{formatNext(ride)}</small></a
						>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.ride-widget-shell {
		--widget-bg: #f8fafc;
		--widget-surface: #ffffff;
		--widget-surface-alt: #f1f5f9;
		--widget-text: #0f172a;
		--widget-muted: #475569;
		--widget-line: #d8dee8;
		--widget-accent: #0e7490;
		--widget-accent-soft: rgba(14, 116, 144, 0.1);
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
		gap: 1rem;
		padding: 0.9rem;
		background:
			radial-gradient(circle at 0 0, var(--widget-accent-soft), transparent 48%), var(--widget-bg);
		color: var(--widget-text);
	}

	.ride-widget-shell.theme-dark {
		--widget-bg: #08101c;
		--widget-surface: #101b2e;
		--widget-surface-alt: #18253a;
		--widget-text: #e2e8f0;
		--widget-muted: #94a3b8;
		--widget-line: #223450;
		--widget-accent: #22d3ee;
		--widget-accent-soft: rgba(34, 211, 238, 0.13);
	}

	.ride-widget-shell.density-compact {
		padding: 0.65rem;
		gap: 0.7rem;
	}

	.widget-header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		align-items: flex-start;
		justify-content: space-around;
	}

	.widget-subtle {
		margin: 0.25rem 0 0;
		font-size: 0.78rem;
		color: var(--widget-muted);
	}

	.widget-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.widget-tabs button,
	.widget-tabs a {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		border: 1px solid var(--widget-line);
		background: var(--widget-surface);
		color: inherit;
		padding: 0.36rem 0.62rem;
		border-radius: 0.66rem;
		font-size: 0.82rem;
		font-weight: 600;
		text-decoration: none;
	}
	.widget-tabs button.active {
		border-color: var(--widget-accent);
		background: var(--widget-accent-soft);
		color: var(--widget-accent);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.legend-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		padding: 0.2rem 0.4rem;
		background: var(--widget-surface-alt);
		border: 1px solid var(--widget-line);
		border-radius: 999px;
		color: inherit;
		cursor: pointer;
	}
	.legend-chip.active {
		border-color: var(--widget-accent);
		background: var(--widget-accent-soft);
		color: var(--widget-accent);
	}
	.legend i {
		display: inline-block;
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 999px;
	}

	.widget-filters {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field span {
		font-size: 0.73rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--widget-muted);
	}
	.field input,
	.field select {
		width: 100%;
		padding: 0.45rem 0.52rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.55rem;
		font-size: 0.85rem;
		color: inherit;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.55rem;
		padding: 0 0.52rem;
	}
	.field.search .search-input-wrap input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.45rem 0;
	}
	.field.search .search-input-wrap input:focus {
		outline: none;
	}
	.search-icon {
		flex-shrink: 0;
		color: var(--widget-muted);
	}

	.widget-body {
		flex: 1;
	}
	.ride-grid {
		display: grid;
		grid-template-columns: repeat(1, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.ride-card {
		display: grid;
		grid-template-columns: 80px 110px minmax(0, 1fr);
		gap: 0.6rem;
		align-items: stretch;
		padding: 0.7rem;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.82rem;
		text-decoration: none;
		color: inherit;
	}

	.ride-card[style*='--diff-color'] {
		border-left: 4px solid var(--diff-color);
	}

	.date-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		background: var(--widget-surface-alt);
		border: 1px solid var(--widget-line);
		border-radius: 0.65rem;
		padding: 0.3rem;
	}
	.date-block strong {
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		color: var(--widget-muted);
	}
	.date-block span {
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1;
	}
	.date-block small {
		font-size: 0.65rem;
		color: var(--widget-muted);
	}

	.ride-image {
		width: 100%;
		height: 100%;
		min-height: 90px;
		object-fit: cover;
		border-radius: 0.6rem;
		border: 1px solid var(--widget-line);
	}
	.ride-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.ride-card-head h2 {
		margin: 0;
		font-size: 0.97rem;
		line-height: 1.25;
	}
	.ride-main p {
		margin: 0;
		font-size: 0.84rem;
		color: var(--widget-muted);
	}

	.ride-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
	}
	.ride-card-meta > div:first-child {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--widget-muted);
	}
	.chip {
		font-size: 0.72rem;
		padding: 0.2rem 0.45rem;
		background: var(--widget-surface-alt);
		border: 1px solid var(--widget-line);
		border-radius: 999px;
	}

	.pagination {
		margin-top: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
	}
	.pagination button {
		border: 1px solid var(--widget-line);
		background: var(--widget-surface);
		border-radius: 0.5rem;
		padding: 0.3rem 0.6rem;
		font-size: 0.78rem;
		color: inherit;
	}
	.pagination button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.pagination span {
		font-size: 0.75rem;
		color: var(--widget-muted);
	}

	.empty-state {
		min-height: 260px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		background: var(--widget-surface);
		border: 1px dashed var(--widget-line);
		border-radius: 1rem;
		color: var(--widget-muted);
	}

	.calendar-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.calendar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.calendar-head h2 {
		margin: 0;
		font-size: 1.02rem;
	}
	.calendar-nav {
		display: inline-flex;
		gap: 0.35rem;
	}
	.calendar-nav button {
		border: 1px solid var(--widget-line);
		background: var(--widget-surface);
		border-radius: 0.5rem;
		padding: 0.3rem 0.45rem;
		font-size: 0.8rem;
		color: inherit;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.3rem;
	}
	.calendar-grid.days div {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--widget-muted);
		text-align: center;
		padding: 0.2rem 0;
	}

	.day-cell {
		height: 130px;
		display: flex;
		flex-direction: column;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.6rem;
		padding: 0.35rem;
		overflow: hidden;
	}
	.day-cell.out {
		opacity: 0.55;
	}
	.day-number {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--widget-muted);
		margin-bottom: 0.2rem;
	}
	.day-rides {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.day-rides a {
		font-size: 0.68rem;
		line-height: 1.2;
		color: inherit;
		text-decoration: none;
		padding: 0.13rem 0.2rem;
		background: var(--widget-surface-alt);
		border-radius: 0.3rem;
		border-left: 3px solid transparent;
	}
	.more {
		font-size: 0.66rem;
		color: var(--widget-accent);
		background: color-mix(in oklab, var(--widget-accent) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--widget-accent) 35%, transparent);
		padding: 0.18rem 0.2rem;
		text-align: left;
		cursor: pointer;
		margin-top: 0.18rem;
		line-height: 1;
		border-radius: 0.35rem;
		width: 100%;
	}

	.map-wrap {
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.9rem;
		overflow: hidden;
	}
	.map-canvas {
		height: clamp(320px, 55vh, 560px);
	}
	.map-hint {
		font-size: 0.78rem;
		padding: 0.5rem 0.65rem;
		color: var(--widget-muted);
		border-top: 1px solid var(--widget-line);
	}

	footer {
		display: flex;
		justify-content: flex-end;
	}
	footer a {
		font-size: 0.73rem;
		color: var(--widget-muted);
		text-decoration: none;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(2, 8, 23, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 80;
	}
	.modal {
		width: min(640px, 100%);
		max-height: 80vh;
		overflow: auto;
		background: var(--widget-surface);
		border: 1px solid var(--widget-line);
		border-radius: 0.8rem;
	}
	.modal-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.65rem 0.8rem;
		border-bottom: 1px solid var(--widget-line);
		background: var(--widget-surface);
	}
	.modal-head h3 {
		margin: 0;
		font-size: 0.9rem;
	}
	.modal-head button {
		border: 1px solid var(--widget-line);
		background: var(--widget-surface-alt);
		border-radius: 0.45rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: inherit;
	}
	.modal-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.8rem;
	}
	.modal-list a {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		text-decoration: none;
		color: inherit;
		padding: 0.55rem;
		border: 1px solid var(--widget-line);
		border-radius: 0.55rem;
		background: var(--widget-surface-alt);
	}
	.modal-list small {
		color: var(--widget-muted);
	}

	@media (max-width: 1080px) {
		.widget-filters {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.widget-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.ride-card {
			grid-template-columns: 72px minmax(0, 1fr);
		}
		.ride-image {
			display: none;
		}
		.day-cell {
			height: 112px;
		}
	}

	@media (max-width: 640px) {
		.widget-filters {
			grid-template-columns: repeat(1, minmax(0, 1fr));
		}
		.calendar-grid {
			gap: 0.2rem;
		}
		.day-rides a {
			font-size: 0.64rem;
		}
	}
</style>
