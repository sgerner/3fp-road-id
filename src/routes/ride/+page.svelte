<script>
	import { browser } from '$app/environment';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCalendarRange from '@lucide/svelte/icons/calendar-range';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconShieldQuestion from '@lucide/svelte/icons/shield-question';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconFilter from '@lucide/svelte/icons/sliders-horizontal';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRepeat from '@lucide/svelte/icons/repeat-2';
	import IconFlag from '@lucide/svelte/icons/flag';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconTrendingUp from '@lucide/svelte/icons/trending-up';
	import IconRuler from '@lucide/svelte/icons/ruler';

	const { data } = $props();

	let searchInput = $state('');
	let search = $state('');
	let selectedDifficulty = $state('all');
	let view = $state('list');
	let calendarReference = $state(startOfMonth(new Date()));
	let rideListEl = $state(null);

	let mapEl = $state(null);
	let map;
	let clusterLayer;
	let L;

	const rides = $derived((data?.rides ?? []).filter(Boolean));
	const difficultyOptions = $derived(
		Array.from(
			new Set(
				rides
					.flatMap((ride) => ride.difficultyLevels ?? [])
					.map((level) => level?.name)
					.filter(Boolean)
			)
		)
	);

	const filteredRides = $derived(
		rides.filter((ride) => {
			const query = search.trim().toLowerCase();
			const matchesQuery =
				!query ||
				[
					ride.title,
					ride.summary,
					ride.description,
					ride.startLocationName,
					ride.startLocationAddress,
					ride.group?.name,
					ride.rideDetails?.pace_notes,
					...(ride.difficultyLevels ?? []).map((item) => item?.name),
					...(ride.ridingDisciplines ?? []).map((item) => item?.name)
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
					.includes(query);

			const matchesDifficulty =
				selectedDifficulty === 'all' ||
				(ride.difficultyLevels ?? []).some((level) => level?.name === selectedDifficulty);

			return matchesQuery && matchesDifficulty;
		})
	);

	const featuredRides = $derived(filteredRides.slice(0, 3));
	const claimableRides = $derived(
		filteredRides.filter((ride) => !ride.hostUserId && !ride.hostGroupId)
	);
	const recurringRides = $derived(filteredRides.filter((ride) => ride.recurrenceEnabled));
	const totalUpcoming = $derived(filteredRides.length);

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
		}, /** @type {Record<string, any[]>} */ ({}))
	);

	const earliestRideMonth = $derived.by(() => {
		const first = datedRides[0]?._calendarStart;
		return first ? startOfMonth(first) : startOfMonth(new Date());
	});

	const calendarMatrix = $derived(buildCalendarMatrix(calendarReference, ridesByDate));
	const calendarHeaderText = $derived.by(() =>
		new Intl.DateTimeFormat(undefined, {
			month: 'long',
			year: 'numeric'
		}).format(calendarReference)
	);

	const mobileWeekDays = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const weekWithToday = calendarMatrix.find((week) =>
			week.some((day) => day.date.toDateString() === today.toDateString())
		);
		if (weekWithToday) return weekWithToday;

		const weekWithRides = calendarMatrix.find((week) => week.some((day) => day.rides?.length));
		return weekWithRides ?? calendarMatrix[0] ?? [];
	});

	const tf = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function scrollToRideCards() {
		if (!rideListEl) return;
		rideListEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function applySearchAndScroll() {
		search = searchInput;
		scrollToRideCards();
	}

	function formatNext(ride) {
		if (!ride?.nextOccurrenceStart) return 'Schedule coming soon';
		const start = new Date(ride.nextOccurrenceStart);
		const end = new Date(ride.nextOccurrenceEnd || ride.nextOccurrenceStart);
		return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
	}

	function formatCompactTime(date) {
		const formatted = date.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
		return formatted.replace(/\s?(AM|PM)$/i, (_, meridiem) => meridiem[0].toLowerCase());
	}

	function formatFeaturedNext(ride) {
		if (!ride?.nextOccurrenceStart) return 'Schedule coming soon';
		const start = new Date(ride.nextOccurrenceStart);
		const end = new Date(ride.nextOccurrenceEnd || ride.nextOccurrenceStart);
		const dateLabel = start.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		const startMeridiem = start
			.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true })
			.match(/AM|PM/i)?.[0];
		const endMeridiem = end
			.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true })
			.match(/AM|PM/i)?.[0];
		const startLabel =
			startMeridiem && endMeridiem && startMeridiem === endMeridiem
				? start
						.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
						.replace(/\s?(AM|PM)$/i, '')
				: formatCompactTime(start);
		const endLabel = formatCompactTime(end);
		return `${dateLabel} · ${startLabel} - ${endLabel}`;
	}

	function formatStatNumber(value) {
		return new Intl.NumberFormat().format(value);
	}

	function parseRideDate(value) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function toDateKey(date) {
		if (!date) return '';
		return date.toISOString().slice(0, 10);
	}

	function startOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function changeMonth(offset) {
		const next = new Date(calendarReference);
		next.setMonth(next.getMonth() + offset);
		calendarReference = startOfMonth(next);
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
					key,
					rides: key && lookup[key] ? lookup[key] : []
				});
			}
			weeks.push(days);
		}
		return weeks;
	}

	function rideMeta(ride) {
		const details = ride?.rideDetails ?? {};
		const bits = [];
		if (details.estimated_distance_miles)
			bits.push({ icon: IconRuler, label: `${details.estimated_distance_miles} mi` });
		if (details.estimated_duration_minutes)
			bits.push({
				icon: IconCalendarClock || IconClock,
				label: `${details.estimated_duration_minutes} min`
			});
		if (details.elevation_gain_feet)
			bits.push({ icon: IconTrendingUp, label: `${details.elevation_gain_feet} ft gain` });
		return bits;
	}

	function leadImage(ride) {
		return ride?.imageUrls?.[0] ?? null;
	}

	function heroImage(ride) {
		return ride?.imageUrls?.[0] ?? null;
	}

	// Discipline → accent color map
	const disciplineColor = {
		Road: 'preset-tonal-primary',
		Mountain: 'preset-tonal-success',
		Gravel: 'preset-tonal-tertiary',
		Cyclocross: 'preset-tonal-warning',
		BMX: 'preset-tonal-error',
		Commute: 'preset-tonal-secondary'
	};

	function disciplineChipClass(name) {
		return disciplineColor[name] ?? 'preset-tonal-secondary';
	}

	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import 'leaflet/dist/leaflet.css';

	async function initMap() {
		if (!mapEl || map) return;

		try {
			const mod = await import('leaflet');
			await import('leaflet.markercluster');
			L = mod.default || mod;
			const { ensureLeafletDefaultIcon } = await import('$lib/map/leaflet');
			await ensureLeafletDefaultIcon(L);
		} catch (e) {
			console.error('Failed to load Leaflet or clustering', e);
			return;
		}

		if (!mapEl || map) return; // verify after await
		map = L.map(mapEl);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		clusterLayer = L.markerClusterGroup();
		map.addLayer(clusterLayer);
		updateMarkers();
	}

	$effect(() => {
		if (view === 'map' && mapEl && !map) {
			initMap();
		} else if (view !== 'map' && map) {
			map.remove();
			map = null;
			clusterLayer = null;
		}
	});

	onMount(() => {
		return () => {
			try {
				map?.remove();
				map = null;
				clusterLayer = null;
			} catch {}
		};
	});

	function validCoords(r) {
		return Number.isFinite(Number(r?.startLatitude)) && Number.isFinite(Number(r?.startLongitude));
	}

	function updateMarkers() {
		if (!map || !clusterLayer) return;
		clusterLayer.clearLayers();
		const pts = [];

		for (const r of filteredRides || []) {
			if (!validCoords(r)) continue;
			const lat = Number(r.startLatitude);
			const lng = Number(r.startLongitude);
			const m = L.marker([lat, lng]);
			const timeStr = formatNext(r);
			m.bindPopup(
				`<div style="min-width:180px"><strong>${r.title}</strong><br/><small>${timeStr}</small><br/><a href="/ride/${r.slug}">View ride</a></div>`
			);
			clusterLayer.addLayer(m);
			pts.push([lat, lng]);
		}

		if (pts.length) {
			const b = L.latLngBounds(pts);
			map.fitBounds(b.pad(0.1));
		} else {
			map.setView([37.8, -96], 4);
		}
	}

	$effect(() => {
		void filteredRides;
		updateMarkers();
	});

	$effect(() => {
		if (browser && !['list', 'calendar', 'map'].includes(view)) {
			view = 'list';
		}
	});

	$effect(() => {
		if (datedRides.length && calendarReference.getTime() !== earliestRideMonth.getTime()) {
			const currentMonthHasRide = calendarMatrix.some((week) =>
				week.some((day) => day.rides.length)
			);
			if (!currentMonthHasRide) {
				calendarReference = earliestRideMonth;
			}
		}
	});

	$effect(() => {
		if (view === 'map' && map) {
			setTimeout(() => map?.invalidateSize(), 180);
		}
	});
</script>

<svelte:head>
	<title>Ride · 3 Feet Please</title>
	<meta
		name="description"
		content="Browse community rides, recurring series, and group-hosted events in your city."
	/>
</svelte:head>

<div class="ride-page mx-auto flex w-full max-w-7xl flex-col gap-10">
	<!-- ═══════════════════════════════════════════════
	     HERO
	═══════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl">
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
						<IconBike class="h-3.5 w-3.5" />
						Ride
					</span>
					<span class="chip preset-tonal-secondary">Public listings</span>
					<span class="chip preset-tonal-tertiary">
						<IconRepeat class="h-3 w-3" />
						Recurring series
					</span>
				</div>

				<div class="space-y-4">
					<h1
						class="ride-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						Find your ride.<br />
						<span class="ride-headline-accent">Share rides you love.</span>
					</h1>
					<p class="max-w-xl text-base leading-relaxed opacity-75">
						Browse community rides, recurring series, and group-hosted events in one place. If a
						ride is public but unclaimed, someone local can adopt it and keep the details current.
					</p>
				</div>

				<!-- Stat cards -->
				<div class="grid gap-3 sm:grid-cols-3">
					{#each [{ icon: IconCalendarRange, label: 'Upcoming rides', value: formatStatNumber(rides.length), accent: 'var(--color-primary-500)' }, { icon: IconRepeat, label: 'Recurring series', value: formatStatNumber(recurringRides.length), accent: 'var(--color-secondary-500)' }, { icon: IconShieldQuestion, label: 'Claimable', value: formatStatNumber(claimableRides.length), accent: 'var(--color-tertiary-500)' }] as stat}
						<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
							<div
								class="stat-card-glow"
								style="background: {stat.accent};"
								aria-hidden="true"
							></div>
							<div
								class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
							>
								<stat.icon class="h-4 w-4" />
								{stat.label}
							</div>
							<div class="text-3xl font-black tabular-nums">{stat.value}</div>
						</div>
					{/each}
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
						Explore rides
					</div>
					<h2 class="text-xl font-bold">Search by vibe, route, or neighborhood</h2>
				</div>

				<div class="input-group grid-cols-[1fr_auto]">
					<input
						class="ig-input bg-surface-950-50/5"
						bind:value={searchInput}
						placeholder="Title, location, pace, discipline…"
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								applySearchAndScroll();
							}
						}}
					/>
					<button
						type="button"
						class="ig-cell btn-icon preset-filled-primary-500 shrink-0"
						onclick={applySearchAndScroll}
						aria-label="Search rides"
						title="Search"
					>
						<IconSearch class="h-4 w-4" />
					</button>
				</div>

				{#if difficultyOptions.length}
					<div class="space-y-2">
						<div
							class="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-50"
						>
							<IconFilter class="h-3.5 w-3.5" />
							Difficulty
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class={`chip ${selectedDifficulty === 'all' ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
								onclick={() => (selectedDifficulty = 'all')}
							>
								All
							</button>
							{#each difficultyOptions as option}
								<button
									type="button"
									class={`chip ${selectedDifficulty === option ? 'preset-filled-secondary-500' : 'preset-tonal-secondary'}`}
									onclick={() => (selectedDifficulty = option)}
								>
									{option}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="mt-auto grid gap-3 pt-2 sm:grid-cols-2">
					<a class="btn preset-outlined-primary-500 gap-2" href="/ride/new">
						<IconPlus class="h-4 w-4" />
						Create ride
					</a>
					<a class="btn preset-outlined-surface-950-50 gap-2" href="#ride-list">
						Browse listings
						<IconArrowRight class="h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     FEATURED + CLAIMABLE (shown only when rides exist)
	═══════════════════════════════════════════════ -->
	{#if featuredRides.length}
		<section class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(290px,0.8fr)]">
			<!-- Featured rides -->
			<div class="card preset-tonal-surface p-6">
				<div class="mb-5 flex items-center justify-between gap-3">
					<div>
						<p class="label opacity-60">Featured</p>
						<h2 class="text-xl font-bold">Fresh rides worth opening first</h2>
					</div>
					<a class="btn btn-sm preset-outlined-primary-500" href="#ride-list">See all</a>
				</div>
				<div class="grid gap-4 lg:grid-cols-3">
					{#each featuredRides as ride, i}
						<a
							class="featured-card card preset-tonal-primary flex h-full flex-col gap-4 p-5"
							href={`/ride/${ride.slug}`}
							style="--stagger: {i}"
						>
							{#if leadImage(ride)}
								<div class="relative -m-5 mb-0 overflow-hidden rounded-t-[inherit]">
									<img
										src={leadImage(ride)}
										alt={ride.title}
										class="featured-card-image h-52 w-full object-cover"
										loading="lazy"
									/>
									<div class="featured-card-image-overlay" aria-hidden="true"></div>
									<div class="featured-card-image-badges">
										{#if !ride.hostUserId && !ride.hostGroupId}
											<span class="chip preset-tonal-warning text-xs backdrop-blur-sm"
												>Needs host</span
											>
										{/if}
									</div>
								</div>
							{/if}
							<div class="flex flex-wrap gap-2">
								<span class="featured-time-chip chip preset-tonal-surface text-xs">
									{formatFeaturedNext(ride)}
								</span>
							</div>
							<div class="space-y-1.5">
								<h3 class="text-lg leading-snug font-bold">{ride.title}</h3>
								{#if ride.summary}
									<p class="line-clamp-2 text-sm leading-relaxed opacity-75">{ride.summary}</p>
								{/if}
							</div>
							<div class="mt-auto space-y-3">
								<div class="flex items-center gap-2 text-sm opacity-70">
									<IconMapPin class="h-3.5 w-3.5 shrink-0" />
									<span class="truncate">{ride.startLocationName || 'Location coming soon'}</span>
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each rideMeta(ride) as meta}
										<span class="chip preset-tonal-tertiary gap-1 text-xs">
											<meta.icon class="h-3 w-3" />
											{meta.label}
										</span>
									{/each}
									{#each ride.ridingDisciplines ?? [] as discipline}
										<span class="chip {disciplineChipClass(discipline.name)} text-xs">
											{discipline.name}
										</span>
									{/each}
								</div>
								<span class="inline-flex items-center gap-1.5 text-sm font-semibold">
									Open ride
									<IconArrowRight class="h-3.5 w-3.5" />
								</span>
							</div>
						</a>
					{/each}
				</div>
			</div>

			<!-- Claimable rides callout -->
			<div class="claim-panel card relative overflow-hidden p-6">
				<div class="claim-glow" aria-hidden="true"></div>
				<div class="relative z-10 mb-5 space-y-2">
					<div class="flex items-center gap-2">
						<IconFlag class="text-warning-400-600 h-5 w-5" />
						<p class="label opacity-70">Claim a series</p>
					</div>
					<h2 class="text-xl font-bold">See a public ride with no host attached?</h2>
					<p class="text-sm leading-relaxed opacity-75">
						Logged-in users can post rides even when they are not the host. If a listing has no host
						or organization, someone local can claim it and manage reminders, RSVPs, and updates.
					</p>
				</div>
				<div class="relative z-10 space-y-3">
					{#each claimableRides.slice(0, 3) as ride}
						<a
							class="claim-item card preset-tonal-surface flex items-start justify-between gap-3 p-4"
							href={`/ride/${ride.slug}`}
						>
							<div class="min-w-0">
								<div class="truncate text-sm font-semibold">{ride.title}</div>
								<div class="mt-0.5 text-xs opacity-60">{formatNext(ride)}</div>
							</div>
							<span class="chip preset-filled-warning-500 shrink-0 text-xs font-semibold">
								{ride.recurrenceEnabled ? 'Claim series' : 'Claim'}
							</span>
						</a>
					{/each}
					{#if !claimableRides.length}
						<div class="card preset-tonal-surface p-4 text-center text-sm opacity-70">
							All rides currently have a host. Check back soon!
						</div>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     RIDE LISTING DIRECTORY
	═══════════════════════════════════════════════ -->
	<section id="ride-list" class="space-y-5" bind:this={rideListEl}>
		<div class="flex items-center justify-between gap-2">
			<div>
				<p class="label opacity-60">Directory</p>
				<h2 class="text-2xl font-bold">Public ride listings</h2>
			</div>

			<div class="flex flex-col items-end gap-2">
				<p class="text-sm tabular-nums opacity-60">
					{totalUpcoming} upcoming ride{totalUpcoming === 1 ? '' : 's'}
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
			{#if filteredRides.length}
				<div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3" transition:slide={{ duration: 220 }}>
					{#each filteredRides as ride, i}
						<a
							class="ride-card card preset-tonal-surface group flex h-full flex-col overflow-hidden no-underline"
							style="--stagger: {i % 9}"
							href={`/ride/${ride.slug}`}
						>
							<div class="ride-card-accent" aria-hidden="true"></div>

							{#if heroImage(ride)}
								<div class="ride-card-media">
									<img
										src={heroImage(ride)}
										alt={ride.title}
										class="ride-card-image h-48 w-full object-cover"
										loading="lazy"
									/>
									<div class="ride-card-image-overlay" aria-hidden="true"></div>
									<div class="ride-card-image-badges">
										<span class="chip preset-tonal-primary text-xs font-medium backdrop-blur-sm">
											{formatNext(ride)}
										</span>
										{#if !ride.hostUserId && !ride.hostGroupId}
											<span class="chip preset-tonal-warning text-xs backdrop-blur-sm"
												>Unclaimed</span
											>
										{/if}
									</div>
								</div>
							{/if}

							<div class="flex flex-1 flex-col gap-4 p-5">
								<div class="flex flex-wrap items-center gap-2">
									{#if !heroImage(ride)}
										<span class="chip preset-tonal-primary text-xs font-medium">
											{formatNext(ride)}
										</span>
									{/if}
									{#if ride.group?.name}
										<span class="chip preset-tonal-secondary text-xs">{ride.group.name}</span>
									{/if}
									{#if ride.recurrenceEnabled}
										<span class="chip preset-tonal-tertiary gap-1 text-xs">
											<IconRepeat class="h-3 w-3" />
											Series
										</span>
									{/if}
								</div>

								<div>
									<h3 class="text-lg leading-snug font-bold">{ride.title}</h3>
									{#if ride.summary}
										<p class="mt-1.5 line-clamp-2 text-sm leading-relaxed opacity-75">
											{ride.summary}
										</p>
									{/if}
								</div>

								<div class="space-y-1 text-sm opacity-65">
									<div class="flex items-center gap-2">
										<IconMapPin class="h-3.5 w-3.5 shrink-0" />
										<span class="truncate">{ride.startLocationName ?? 'Location coming soon'}</span>
									</div>
									{#if ride.startLocationAddress}
										<div class="truncate pl-5 text-xs opacity-75">{ride.startLocationAddress}</div>
									{/if}
								</div>

								<div class="flex flex-wrap gap-1.5">
									{#each ride.difficultyLevels ?? [] as level}
										<span class="chip preset-tonal-warning text-xs">{level.name}</span>
									{/each}
									{#each ride.ridingDisciplines ?? [] as discipline}
										<span class="chip {disciplineChipClass(discipline.name)} text-xs">
											{discipline.name}
										</span>
									{/each}
									{#each rideMeta(ride) as meta}
										<span class="chip preset-tonal-tertiary gap-1 text-xs">
											<meta.icon class="h-3 w-3" />
											{meta.label}
										</span>
									{/each}
								</div>

								<div class="mt-auto flex items-center justify-between gap-3 pt-1">
									<div class="flex items-center gap-1.5 text-xs opacity-55">
										<IconUsers class="h-3.5 w-3.5" />
										<span>
											{ride.rideDetails?.participant_visibility === 'private'
												? 'Private RSVP list'
												: 'Public RSVP list'}
										</span>
									</div>
									<span
										class="ride-card-link inline-flex items-center gap-1.5 text-sm font-semibold"
									>
										View ride
										<IconArrowRight class="h-3.5 w-3.5" />
									</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<!-- Empty state -->
				<div
					class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
				>
					<div class="app-empty-orb" aria-hidden="true"></div>
					<div class="relative z-10 mx-auto max-w-lg space-y-4">
						<div
							class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
						>
							<IconBike class="h-10 w-10 opacity-60" />
						</div>
						<h3 class="text-2xl font-bold">No rides match that filter yet</h3>
						<p class="text-sm leading-relaxed opacity-70">
							Try a broader search, clear the difficulty filter, or be the first to post a ride for
							that route.
						</p>
						<div class="flex flex-wrap justify-center gap-3 pt-2">
							<button
								class="btn preset-outlined-surface-950-50"
								onclick={() => ((search = ''), (selectedDifficulty = 'all'))}
							>
								Clear filters
							</button>
							<a class="btn preset-outlined-primary-500 gap-2" href="/ride/new">
								<IconPlus class="h-4 w-4" />
								Create ride
							</a>
						</div>
					</div>
				</div>
			{/if}
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
							onclick={() => (calendarReference = earliestRideMonth)}
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
									{day.rides.length} ride{day.rides.length === 1 ? '' : 's'}
								</div>
							</div>
							<div class="mt-2 space-y-1.5">
								{#if day.rides.length === 0}
									<p class="text-surface-500 text-xs">No rides</p>
								{:else}
									{#each day.rides as ride}
										<a
											class="bg-secondary-500/10 text-secondary-800-200 hover:bg-secondary-500/20 block rounded-lg px-2 py-1 text-xs font-medium"
											href={`/ride/${ride.slug}`}
										>
											<span class="text-secondary-600-400 font-mono text-xs">
												{tf.format(parseRideDate(ride.nextOccurrenceStart))} -
											</span>
											{ride.title}
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
										{#if day.rides.length === 0}
											<p class="text-surface-500 text-[11px]">No rides</p>
										{:else}
											{#each day.rides.slice(0, 3) as ride}
												<a
													class="bg-secondary-500/10 text-secondary-800-200 hover:bg-secondary-500/20 block rounded px-1 py-0.5 text-[11px] font-medium"
													href={`/ride/${ride.slug}`}
												>
													<span class="text-secondary-600-400 font-mono text-xs">
														{tf.format(parseRideDate(ride.nextOccurrenceStart))} -
													</span>
													{ride.title}
												</a>
											{/each}
											{#if day.rides.length > 3}
												<div class="text-secondary-700-300 text-[10px] font-medium">
													+{day.rides.length - 3} more
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
				<div bind:this={mapEl} class="h-[480px] w-full rounded-2xl"></div>
				<div class="text-surface-700-300 border-surface-500/30 border-t px-6 py-3 text-sm">
					Zoom and click markers to preview ride details. Listings without mapped coordinates are
					hidden from the map view.
				</div>
			</div>
		{:else}
			<!-- Empty state -->
			<div
				class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
			>
				<div class="app-empty-orb" aria-hidden="true"></div>
				<div class="relative z-10 mx-auto max-w-lg space-y-4">
					<div
						class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
					>
						<IconBike class="h-10 w-10 opacity-60" />
					</div>
					<h3 class="text-2xl font-bold">No rides match that filter yet</h3>
					<p class="text-sm leading-relaxed opacity-70">
						Try a broader search, clear the difficulty filter, or be the first to post a ride for
						that route.
					</p>
					<div class="flex flex-wrap justify-center gap-3 pt-2">
						<button
							class="btn preset-outlined-surface-950-50"
							onclick={() => ((search = ''), (selectedDifficulty = 'all'))}
						>
							Clear filters
						</button>
						<a class="btn preset-outlined-primary-500 gap-2" href="/ride/new">
							<IconPlus class="h-4 w-4" />
							Create ride
						</a>
					</div>
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	/* ── Hero ── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	/* ── Headline accent ── */
	.ride-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.ride-headline-accent {
		background: linear-gradient(
			120deg,
			var(--color-primary-300),
			var(--color-secondary-300),
			var(--color-tertiary-300)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* ── Stat cards ── */
	.stat-card {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.stat-card-glow {
		position: absolute;
		inset: 0;
		opacity: 0.06;
		pointer-events: none;
	}

	/* ── Search panel ── */
	.search-panel {
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	/* ── Featured cards ── */
	.featured-card {
		transition:
			transform 220ms ease,
			box-shadow 220ms ease;
		animation: card-in 420ms ease both;
		animation-delay: calc(var(--stagger, 0) * 80ms);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 18%, transparent);
	}

	.featured-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 32px -6px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.featured-time-chip {
		max-width: 100%;
		white-space: normal;
		line-height: 1.2;
		font-size: 0.7rem;
	}

	.featured-card-image {
		display: block;
		border-bottom: 1px solid color-mix(in oklab, var(--color-primary-500) 18%, transparent);
	}

	.featured-card-image-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(6, 6, 14, 0.72) 0%, transparent 55%);
		pointer-events: none;
	}

	.featured-card-image-badges {
		position: absolute;
		bottom: 0.625rem;
		left: 0.625rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* ── Claim panel ── */
	.claim-panel {
		background: color-mix(in oklab, var(--color-warning-500) 10%, var(--color-surface-900) 90%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 28%, transparent);
	}

	.claim-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 60% at 100% 0%,
			color-mix(in oklab, var(--color-warning-500) 18%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.claim-item {
		transition:
			transform 150ms ease,
			background-color 150ms ease;
	}

	.claim-item:hover {
		transform: translateX(3px);
	}

	/* ── Ride cards ── */
	.ride-card {
		transition:
			transform 220ms ease,
			box-shadow 220ms ease;
		animation: card-in 380ms ease both;
		animation-delay: calc(var(--stagger, 0) * 50ms);
		text-decoration: none;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
	}

	.ride-card:hover {
		transform: translateY(-3px);
		box-shadow: 0 8px 28px -6px color-mix(in oklab, var(--color-primary-500) 22%, transparent);
	}

	.ride-card-accent {
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.6;
		transition: opacity 220ms ease;
	}

	.ride-card:hover .ride-card-accent {
		opacity: 1;
	}

	.ride-card-media {
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		background:
			linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.48) 100%),
			color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-900) 90%);
	}

	.ride-card-image {
		display: block;
		transform: scale(1.01);
		transition:
			transform 260ms ease,
			filter 260ms ease;
	}

	.ride-card:hover .ride-card-image {
		transform: scale(1.05);
		filter: saturate(1.08);
	}

	.ride-card-image-overlay {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(180deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.58) 100%),
			radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 45%);
		pointer-events: none;
	}

	.ride-card-image-badges {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.ride-card-link {
		color: var(--color-primary-300);
		transition:
			transform 180ms ease,
			color 180ms ease;
	}

	.ride-card:hover .ride-card-link {
		transform: translateX(2px);
		color: var(--color-primary-200);
	}

	/* ── Empty state ── */
	.event-card {
		animation: calendar-card-in 380ms ease both;
		animation-delay: calc(var(--stagger, 0) * 30ms);
	}

	/* ── Card entrance animation ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes calendar-card-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
