<script>
	import { browser } from '$app/environment';
	import { getRideImage } from '#lib/rides/media';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRepeat from '@lucide/svelte/icons/repeat-2';
	import IconFlag from '@lucide/svelte/icons/flag';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconTrendingUp from '@lucide/svelte/icons/trending-up';
	import IconRuler from '@lucide/svelte/icons/ruler';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';

	const { data } = $props();

	let searchInput = $state('');
	let search = $state('');
	let selectedDifficulty = $state('all');
	let view = $state('list');
	let currentPage = $state(1);
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
	const heroRide = $derived(rides.find((ride) => heroImage(ride)) ?? null);
	const claimableRides = $derived(
		filteredRides.filter((ride) => !ride.hostUserId && !ride.hostGroupId)
	);
	const recurringRides = $derived(filteredRides.filter((ride) => ride.recurrenceEnabled));
	const totalUpcoming = $derived(filteredRides.length);
	const ridesPerPage = 24;
	const totalPages = $derived(Math.max(1, Math.ceil(filteredRides.length / ridesPerPage)));
	const paginatedRides = $derived(
		filteredRides.slice((currentPage - 1) * ridesPerPage, currentPage * ridesPerPage)
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
		currentPage = 1;
		scrollToRideCards();
	}

	function selectDifficulty(difficulty) {
		selectedDifficulty = difficulty;
		currentPage = 1;
	}

	function changeRidePage(nextPage) {
		currentPage = Math.min(Math.max(nextPage, 1), totalPages);
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
		return optimizedImageUrl(getRideImage(ride), {
			width: 768,
			height: 432,
			quality: 64
		});
	}

	function cardImage(ride) {
		return leadImage(ride);
	}

	function heroImage(ride) {
		return getRideImage(ride);
	}

	let mapLoadPromise;

	async function initMap() {
		if (!mapEl || map) return;

		try {
			if (!mapLoadPromise) {
				mapLoadPromise = (async () => {
					await import('#lib/map/leaflet.css');
					const mod = await import('leaflet');
					L = mod.default || mod;
					// markercluster is a legacy UMD bundle and reads Leaflet from the global scope.
					globalThis.L = L;
					await import('leaflet.markercluster');
					return L;
				})();
			}
			await mapLoadPromise;
			const { ensureLeafletDefaultIcon } = await import('#lib/map/leaflet');
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
		if (currentPage > totalPages) currentPage = totalPages;
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

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
		aria-labelledby="ride-hero-heading"
	>
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<div class="flex flex-col gap-3">
				<p
					class="text-primary-500 m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
					<span>Community rides</span>
				</p>

				<h1
					id="ride-hero-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Find a ride worth <span class="text-primary-500">showing up for.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium text-balance">
					Discover public rides, recurring series, and group-hosted events—then help keep the rides
					your community loves accurate and welcoming.
				</p>
			</div>

			<div
				class="border-surface-800 flex flex-wrap items-center justify-between gap-4 border-t pt-5"
			>
				<div class="flex flex-wrap gap-3">
					<a
						href="#ride-list"
						class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						Browse rides
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</a>
					<a
						href="/ride/new"
						class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<IconPlus class="h-4 w-4" /> Share a ride
					</a>
				</div>

				<dl class="m-0 flex flex-wrap items-center gap-6">
					<div>
						<dt class="text-surface-400 text-[0.65rem] font-bold tracking-[0.2em] uppercase">
							Upcoming
						</dt>
						<dd class="text-primary-500 m-0 text-2xl leading-none font-black italic tabular-nums">
							{formatStatNumber(rides.length)}
						</dd>
					</div>
					<div>
						<dt class="text-surface-400 text-[0.65rem] font-bold tracking-[0.2em] uppercase">
							Recurring
						</dt>
						<dd class="text-surface-50 m-0 text-2xl leading-none font-black italic tabular-nums">
							{formatStatNumber(recurringRides.length)}
						</dd>
					</div>
					<div>
						<dt class="text-surface-400 text-[0.65rem] font-bold tracking-[0.2em] uppercase">
							Need a host
						</dt>
						<dd class="text-tertiary-500 m-0 text-2xl leading-none font-black italic tabular-nums">
							{formatStatNumber(claimableRides.length)}
						</dd>
					</div>
				</dl>
			</div>
		</div>

		<div
			class="bg-surface-900 border-surface-800 relative min-h-[14rem] border-t-2 lg:border-t-0 lg:border-l-2"
		>
			<img
				src={heroRide ? heroImage(heroRide) : '/images/default-ride.webp'}
				alt={heroRide ? heroRide.title : 'Cyclists riding together'}
				class="absolute inset-0 h-full w-full object-cover opacity-75"
				width="1200"
				height="736"
				fetchpriority="high"
			/>
			<div class="bg-tertiary-500 absolute inset-y-0 left-0 w-2" aria-hidden="true"></div>

			{#if heroRide}
				<a
					href={`/ride/${heroRide.slug}`}
					class="group bg-surface-950/95 text-surface-50 hover:bg-surface-900 border-surface-800 absolute right-0 bottom-0 left-2 flex items-center justify-between gap-4 border-t-2 px-5 py-3.5 transition hover:no-underline"
				>
					<span class="min-w-0">
						<span
							class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.22em] uppercase"
						>
							Next up
						</span>
						<span class="block truncate text-sm font-black sm:text-base">{heroRide.title}</span>
						<span class="block truncate text-xs opacity-75">{formatNext(heroRide)}</span>
					</span>
					<IconArrowUpRight
						class="text-primary-500 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					/>
				</a>
			{/if}
		</div>
	</section>

	<!-- DISCOVERY TOOLBAR -->
	<section
		class="bg-surface-900 text-surface-50 border-surface-800 border-b-2 px-6 py-5 sm:px-10 lg:px-12"
		aria-label="Search and filter rides"
	>
		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
			<div class="flex w-full">
				<input
					class="bg-surface-950 text-surface-50 border-surface-700 placeholder:text-surface-400 focus:border-primary-500 min-w-0 flex-1 border-2 px-4 py-2.5 text-sm font-medium focus:outline-none"
					bind:value={searchInput}
					placeholder="Search by title, location, pace, discipline…"
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							applySearchAndScroll();
						}
					}}
				/>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 border-surface-700 inline-flex shrink-0 items-center justify-center gap-2 border-2 border-l-0 px-5 py-2.5 text-xs font-black tracking-wide uppercase transition"
					onclick={applySearchAndScroll}
					aria-label="Search rides"
				>
					<IconSearch class="h-4 w-4" />
					<span class="hidden sm:inline">Search</span>
				</button>
			</div>

			{#if difficultyOptions.length}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class={`border-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition ${
							selectedDifficulty === 'all'
								? 'bg-primary-500 text-surface-950 border-primary-500'
								: 'bg-surface-950 text-surface-200 border-surface-700 hover:border-primary-500 hover:text-primary-500'
						}`}
						onclick={() => selectDifficulty('all')}
					>
						All levels
					</button>
					{#each difficultyOptions as option (option)}
						<button
							type="button"
							class={`border-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition ${
								selectedDifficulty === option
									? 'bg-primary-500 text-surface-950 border-primary-500'
									: 'bg-surface-950 text-surface-200 border-surface-700 hover:border-primary-500 hover:text-primary-500'
							}`}
							onclick={() => selectDifficulty(option)}
						>
							{option}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- FEATURED + CLAIMABLE -->
	{#if featuredRides.length}
		<section
			class="bg-surface-950 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
			aria-labelledby="featured-heading"
		>
			<div class="flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
				<div class="flex flex-col gap-2">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Featured
						</p>
						<a
							href="#ride-list"
							class="text-surface-300 hover:text-primary-500 inline-flex items-center gap-1.5 text-xs font-bold uppercase"
						>
							See all <IconArrowRight class="h-4 w-4" />
						</a>
					</div>
					<h2
						id="featured-heading"
						class="text-surface-50! m-0 max-w-3xl text-2xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-4xl"
					>
						Fresh rides worth opening first
					</h2>
				</div>

				<ol class="border-surface-800 m-0 list-none border-t-2 p-0">
					{#each featuredRides as ride, i (ride.id ?? ride.slug)}
						<li class="border-surface-800 border-b">
							<a
								href={`/ride/${ride.slug}`}
								class="group text-surface-50 hover:bg-surface-900 -mx-3 flex min-w-0 flex-col gap-4 px-3 py-4 transition hover:no-underline sm:flex-row sm:items-center sm:gap-5"
							>
								<div class="flex items-center gap-4">
									<span
										class="text-tertiary-500 group-hover:text-primary-500 w-8 shrink-0 text-xl font-black italic tabular-nums sm:w-10 sm:text-2xl"
									>
										{String(i + 1).padStart(2, '0')}
									</span>
									{#if leadImage(ride)}
										<span class="bg-surface-800 block h-14 w-20 shrink-0 overflow-hidden">
											<img
												src={leadImage(ride)}
												alt={ride.title}
												class="h-full w-full object-cover"
												loading="lazy"
											/>
										</span>
									{/if}
								</div>

								<div class="min-w-0 flex-1">
									<div class="mb-1 flex flex-wrap items-center gap-2">
										<span class="text-primary-500 text-xs font-black tracking-[0.14em] uppercase">
											{formatFeaturedNext(ride)}
										</span>
										{#if !ride.hostUserId && !ride.hostGroupId}
											<span
												class="bg-tertiary-500 text-surface-950 px-2 py-0.5 text-[0.65rem] font-black tracking-[0.16em] uppercase"
											>
												Needs host
											</span>
										{/if}
									</div>
									<h3
										class="text-surface-50! group-hover:text-primary-500! m-0 truncate text-base leading-tight font-black uppercase sm:text-xl"
									>
										{ride.title}
									</h3>
									{#if ride.summary}
										<p class="m-0 mt-1 line-clamp-1 text-sm opacity-80">{ride.summary}</p>
									{/if}
									<div
										class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase opacity-75"
									>
										<span class="inline-flex items-center gap-1">
											<IconMapPin class="h-3.5 w-3.5 shrink-0" />
											{ride.startLocationName || 'Location coming soon'}
										</span>
										{#each rideMeta(ride) as meta (meta.label)}
											<span class="inline-flex items-center gap-1">
												<meta.icon class="h-3 w-3" />
												{meta.label}
											</span>
										{/each}
										{#each ride.ridingDisciplines ?? [] as discipline (discipline.name)}
											<span>{discipline.name}</span>
										{/each}
									</div>
								</div>

								<span
									class="text-primary-500 inline-flex shrink-0 items-center gap-1.5 text-xs font-black tracking-[0.16em] uppercase"
								>
									Open ride
									<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</div>

			<!-- Claimable rides callout -->
			<aside
				class="bg-surface-900 text-surface-50 border-surface-800 border-t-tertiary-500 flex min-w-0 flex-col justify-between border-t-4 lg:border-l-2"
				aria-labelledby="claim-series-heading"
			>
				<div class="flex flex-col gap-5 px-6 py-10 sm:px-10 lg:px-10 lg:py-12">
					<div class="flex flex-col gap-2">
						<p
							class="text-tertiary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconFlag class="h-4 w-4" /> Claim a series
						</p>
						<h2
							id="claim-series-heading"
							class="text-surface-50! m-0 text-2xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-3xl"
						>
							See a public ride with no host attached?
						</h2>
						<p class="text-surface-300 m-0 text-sm leading-snug font-medium">
							Logged-in users can post rides even when they are not the host. If a listing has no
							host or organization, someone local can claim it and manage reminders, RSVPs, and
							updates.
						</p>
					</div>

					<div class="border-surface-800 border-t-2">
						{#each claimableRides.slice(0, 3) as ride (ride.id ?? ride.slug)}
							<a
								class="group border-surface-800 hover:bg-surface-950 -mx-3 flex items-center justify-between gap-3 border-b px-3 py-3.5 transition hover:no-underline"
								href={`/ride/${ride.slug}`}
							>
								<div class="min-w-0">
									<div class="group-hover:text-primary-500 truncate text-sm font-black uppercase">
										{ride.title}
									</div>
									<div class="text-surface-400 mt-0.5 text-xs font-bold">{formatNext(ride)}</div>
								</div>
								<span
									class="bg-tertiary-500 text-surface-950 group-hover:bg-primary-500 shrink-0 px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase"
								>
									{ride.recurrenceEnabled ? 'Claim series' : 'Claim'}
								</span>
							</a>
						{/each}
						{#if !claimableRides.length}
							<div class="text-surface-400 py-5 text-sm font-bold uppercase">
								All rides currently have a host. Check back soon!
							</div>
						{/if}
					</div>
				</div>
			</aside>
		</section>
	{/if}

	<!-- RIDE LISTING DIRECTORY -->
	<section
		id="ride-list"
		class="bg-surface-950 text-surface-50 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-12"
		bind:this={rideListEl}
		aria-labelledby="directory-heading"
	>
		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Directory</p>
				<h2
					id="directory-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
				>
					Public ride listings
				</h2>
			</div>

			<div class="flex flex-col items-start gap-2 sm:items-end">
				<p class="text-surface-300 m-0 text-xs font-bold tracking-[0.22em] uppercase tabular-nums">
					{totalUpcoming} upcoming ride{totalUpcoming === 1 ? '' : 's'}
				</p>
				<div class="border-surface-700 flex shrink-0 border-2">
					<button
						type="button"
						class={`px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition ${
							view === 'list'
								? 'bg-primary-500 text-surface-950'
								: 'bg-surface-950 text-surface-50 hover:bg-surface-800'
						}`}
						onclick={() => (view = 'list')}
					>
						List
					</button>
					<button
						type="button"
						class={`border-surface-700 border-l-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition ${
							view === 'calendar'
								? 'bg-primary-500 text-surface-950'
								: 'bg-surface-950 text-surface-50 hover:bg-surface-800'
						}`}
						onclick={() => (view = 'calendar')}
					>
						Calendar
					</button>
					<button
						type="button"
						class={`border-surface-700 border-l-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition ${
							view === 'map'
								? 'bg-primary-500 text-surface-950'
								: 'bg-surface-950 text-surface-50 hover:bg-surface-800'
						}`}
						onclick={() => (view = 'map')}
					>
						Map
					</button>
				</div>
			</div>
		</div>

		<!-- lane divider -->
		<div
			class="h-1 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_48px,transparent_48px_80px)]"
			aria-hidden="true"
		></div>

		{#if view === 'list'}
			{#if filteredRides.length}
				<div
					class="border-surface-800 grid border-t border-l md:grid-cols-2 xl:grid-cols-3"
					transition:slide={{ duration: 220 }}
				>
					{#each paginatedRides as ride, i (ride.id ?? ride.slug)}
						<a
							class="group bg-surface-950 text-surface-50 border-surface-800 hover:bg-surface-900 flex h-full flex-col border-r border-b transition hover:no-underline"
							href={`/ride/${ride.slug}`}
						>
							{#if cardImage(ride)}
								<div class="bg-surface-900 relative aspect-[16/10] w-full overflow-hidden">
									<img
										src={cardImage(ride)}
										alt={ride.title}
										class="h-full w-full object-cover"
										loading="lazy"
										width="768"
										height="432"
										decoding="async"
										onerror={(e) => {
											if (!e.currentTarget.dataset.fallback) {
												e.currentTarget.dataset.fallback = '1';
												e.currentTarget.src = '/images/default-ride.webp';
											}
										}}
									/>
									<span
										class="bg-primary-500 text-surface-950 absolute top-0 left-0 px-3 py-1.5 text-xs font-black tracking-[0.12em] uppercase"
									>
										{formatNext(ride)}
									</span>
									{#if !ride.hostUserId && !ride.hostGroupId}
										<span
											class="bg-tertiary-500 text-surface-950 absolute top-0 right-0 px-3 py-1.5 text-xs font-black tracking-[0.16em] uppercase"
										>
											Unclaimed
										</span>
									{/if}
								</div>
							{/if}

							<div class="flex flex-1 flex-col gap-4 p-6">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-tertiary-500 text-xl font-black italic tabular-nums">
										{String((currentPage - 1) * ridesPerPage + i + 1).padStart(2, '0')}
									</span>
									{#if !cardImage(ride)}
										<span
											class="bg-primary-500 text-surface-950 px-2.5 py-1 text-xs font-black uppercase"
										>
											{formatNext(ride)}
										</span>
									{/if}
									{#if ride.group?.name}
										<span
											class="bg-secondary-500 text-surface-50 px-2.5 py-1 text-xs font-bold uppercase"
										>
											{ride.group.name}
										</span>
									{/if}
									{#if ride.recurrenceEnabled}
										<span
											class="bg-tertiary-500 text-surface-950 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black uppercase"
										>
											<IconRepeat class="h-3 w-3" />
											Series
										</span>
									{/if}
								</div>

								<div>
									<h3
										class="text-surface-50! group-hover:text-primary-500! m-0 text-2xl leading-tight font-black uppercase"
									>
										{ride.title}
									</h3>
									{#if ride.summary}
										<p class="text-surface-300 m-0 mt-2 line-clamp-2 text-sm leading-relaxed">
											{ride.summary}
										</p>
									{/if}
								</div>

								<div class="text-surface-300 flex flex-col gap-1 text-sm">
									<div class="flex items-center gap-2 font-medium">
										<IconMapPin class="text-primary-500 h-4 w-4 shrink-0" />
										<span class="truncate">{ride.startLocationName ?? 'Location coming soon'}</span>
									</div>
									{#if ride.startLocationAddress}
										<div class="truncate pl-6 text-xs opacity-80">{ride.startLocationAddress}</div>
									{/if}
								</div>

								<div class="flex flex-wrap gap-1.5">
									{#each ride.difficultyLevels ?? [] as level (level.name)}
										<span
											class="bg-primary-500 text-surface-950 px-2.5 py-1 text-xs font-black uppercase"
										>
											{level.name}
										</span>
									{/each}
									{#each ride.ridingDisciplines ?? [] as discipline (discipline.name)}
										<span
											class="bg-secondary-500 text-surface-50 px-2.5 py-1 text-xs font-bold uppercase"
										>
											{discipline.name}
										</span>
									{/each}
									{#each rideMeta(ride) as meta (meta.label)}
										<span
											class="border-surface-700 text-surface-200 inline-flex items-center gap-1 border px-2.5 py-1 text-xs font-bold uppercase"
										>
											<meta.icon class="h-3 w-3" />
											{meta.label}
										</span>
									{/each}
								</div>

								<div
									class="border-surface-800 mt-auto flex items-center justify-between gap-3 border-t pt-4"
								>
									<div
										class="text-surface-300 flex items-center gap-1.5 text-xs font-bold uppercase"
									>
										<IconUsers class="h-3.5 w-3.5" />
										<span>
											{ride.rideDetails?.participant_visibility === 'private'
												? 'Private RSVP list'
												: 'Public RSVP list'}
										</span>
									</div>
									<span
										class="text-primary-500 inline-flex items-center gap-1.5 text-xs font-black tracking-[0.16em] uppercase"
									>
										View ride
										<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
									</span>
								</div>
							</div>
						</a>
					{/each}
				</div>

				{#if totalPages > 1}
					<nav
						class="border-surface-800 flex flex-col items-center justify-between gap-4 border-t-2 pt-6 sm:flex-row"
						aria-label="Ride pages"
					>
						<p class="text-surface-300 m-0 text-sm font-bold uppercase tabular-nums">
							Showing {(currentPage - 1) * ridesPerPage + 1}–{Math.min(
								currentPage * ridesPerPage,
								totalUpcoming
							)} of {totalUpcoming}
						</p>
						<div class="border-surface-50 flex border-[3px]" aria-label="Pagination controls">
							<button
								type="button"
								class="bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 px-5 py-2.5 text-xs font-black tracking-[0.16em] uppercase transition disabled:opacity-40"
								onclick={() => changeRidePage(currentPage - 1)}
								disabled={currentPage === 1}
							>
								Previous
							</button>
							<span
								class="border-surface-50 bg-surface-900 text-primary-500 border-x-[3px] px-5 py-2.5 text-xs font-black tracking-[0.16em] uppercase"
								aria-current="page"
							>
								Page {currentPage} of {totalPages}
							</span>
							<button
								type="button"
								class="bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 px-5 py-2.5 text-xs font-black tracking-[0.16em] uppercase transition disabled:opacity-40"
								onclick={() => changeRidePage(currentPage + 1)}
								disabled={currentPage === totalPages}
							>
								Next
							</button>
						</div>
					</nav>
				{/if}
			{:else}
				<div class="border-surface-50 flex flex-col items-start gap-6 border-t-2 pt-10">
					<IconBike class="text-primary-500 h-12 w-12" />
					<div class="flex flex-col gap-2">
						<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
							No rides match that filter yet
						</h3>
						<p class="text-surface-300 m-0 max-w-xl text-base leading-relaxed">
							Try a broader search, clear the difficulty filter, or be the first to post a ride for
							that route.
						</p>
					</div>
					<div class="flex flex-wrap gap-3">
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 border-[3px] px-6 py-3 text-sm font-black uppercase transition"
							onclick={() => ((search = ''), (selectedDifficulty = 'all'), (currentPage = 1))}
						>
							Clear filters
						</button>
						<a
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black uppercase transition hover:no-underline"
							href="/ride/new"
						>
							<IconPlus class="h-4 w-4" />
							Create ride
						</a>
					</div>
				</div>
			{/if}
		{:else if view === 'calendar'}
			<div transition:slide class="flex flex-col gap-6">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
						{calendarHeaderText}
					</h3>
					<div class="border-surface-50 flex border-[3px]">
						<button
							type="button"
							class="bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 px-4 py-2 text-xs font-black uppercase transition"
							onclick={() => changeMonth(-1)}
						>
							Prev
						</button>
						<button
							type="button"
							class="border-surface-50 bg-surface-950 text-primary-500 hover:bg-primary-500 hover:text-surface-950 border-x-[3px] px-4 py-2 text-xs font-black uppercase transition"
							onclick={() => (calendarReference = earliestRideMonth)}
						>
							Today
						</button>
						<button
							type="button"
							class="bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 px-4 py-2 text-xs font-black uppercase transition"
							onclick={() => changeMonth(1)}
						>
							Next
						</button>
					</div>
				</div>

				<div class="border-surface-50 flex flex-col border-t-2 sm:hidden">
					{#each mobileWeekDays as day (day.key)}
						<div
							class={`border-surface-800 border-b py-4 ${
								day.inMonth ? 'text-surface-50' : 'text-surface-300 opacity-60'
							}`}
						>
							<div class="flex items-center justify-between">
								<div class="text-sm font-black uppercase">
									{new Intl.DateTimeFormat(undefined, {
										weekday: 'short',
										month: 'short',
										day: 'numeric'
									}).format(day.date)}
								</div>
								<div class="text-primary-500 text-xs font-bold uppercase">
									{day.rides.length} ride{day.rides.length === 1 ? '' : 's'}
								</div>
							</div>
							<div class="mt-3 flex flex-col gap-2">
								{#if day.rides.length === 0}
									<p class="text-surface-300 m-0 text-xs uppercase">No rides</p>
								{:else}
									{#each day.rides as ride (ride.id ?? ride.slug)}
										<a
											class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 block px-3 py-2 text-xs font-bold transition hover:no-underline"
											href={`/ride/${ride.slug}`}
										>
											<span class="text-primary-500 font-black">
												{tf.format(parseRideDate(ride.nextOccurrenceStart))} —
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
						class="bg-primary-500 text-surface-950 grid grid-cols-7 text-center text-xs font-black tracking-[0.2em] uppercase"
					>
						<div class="py-2.5">Sun</div>
						<div class="py-2.5">Mon</div>
						<div class="py-2.5">Tue</div>
						<div class="py-2.5">Wed</div>
						<div class="py-2.5">Thu</div>
						<div class="py-2.5">Fri</div>
						<div class="py-2.5">Sat</div>
					</div>
					<div class="border-surface-800 grid grid-cols-7 border-t border-l">
						{#each calendarMatrix as week, i (i)}
							{#each week as day (day.key)}
								<div
									class={`border-surface-800 flex h-32 flex-col border-r border-b p-2 text-left ${
										day.inMonth
											? 'bg-surface-950 text-surface-50'
											: 'bg-surface-900 text-surface-300 opacity-50'
									}`}
								>
									<div class="text-xs font-black tabular-nums">{day.date.getDate()}</div>
									<div class="mt-1.5 flex flex-col gap-1 overflow-y-auto">
										{#if day.rides.length === 0}
											<p class="text-surface-300 m-0 text-[11px] opacity-50">No rides</p>
										{:else}
											{#each day.rides.slice(0, 3) as ride (ride.id ?? ride.slug)}
												<a
													class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 block truncate px-1.5 py-1 text-[11px] font-bold transition hover:no-underline"
													href={`/ride/${ride.slug}`}
												>
													<span class="font-black">
														{tf.format(parseRideDate(ride.nextOccurrenceStart))}
													</span>
													{ride.title}
												</a>
											{/each}
											{#if day.rides.length > 3}
												<div class="text-primary-500 text-[10px] font-black uppercase">
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
			<div transition:slide class="border-surface-50 border-[3px]">
				<div bind:this={mapEl} class="h-[480px] w-full"></div>
				<div
					class="bg-surface-900 text-surface-300 border-surface-50 border-t-[3px] px-6 py-4 text-sm font-medium"
				>
					Zoom and click markers to preview ride details. Listings without mapped coordinates are
					hidden from the map view.
				</div>
			</div>
		{/if}
	</section>
</div>
