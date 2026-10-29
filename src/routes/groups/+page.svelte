<script>
	let { data } = $props();
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMaximize2 from '@lucide/svelte/icons/maximize-2';
	import IconMinimize2 from '@lucide/svelte/icons/minimize-2';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconLoader2 from '@lucide/svelte/icons/loader-2';
	import { fade, slide } from 'svelte/transition';
	import { navigating } from '$app/state';
	import { optimizedImageUrl } from '#lib/media/optimized';

	function getInitialFilters() {
		return data.filters ?? {};
	}
	const initialFilters = getInitialFilters();
	const heroGroup = $derived((data.groups ?? []).find((group) => group.cover_photo_url) ?? null);
	const heroImage = $derived(
		heroGroup?.cover_photo_url
			? optimizedImageUrl(heroGroup.cover_photo_url, { width: 1200, height: 736, quality: 68 })
			: ''
	);
	const regionCount = $derived(
		new Set((data.mapPoints || []).map((g) => g.state_region).filter(Boolean)).size || 0
	);

	let q = $state(initialFilters.q || '');
	let country = $state(initialFilters.country || '');
	let state_region = $state(initialFilters.state_region || '');
	let group_type_ids = $state((initialFilters.group_type_ids || []).slice());
	let skill_level_ids = $state((initialFilters.skill_level_ids || []).slice());
	let audience_focus_ids = $state((initialFilters.audience_focus_ids || []).slice());
	let riding_discipline_ids = $state((initialFilters.riding_discipline_ids || []).slice());
	let page = $state(initialFilters.page || 1);
	const limit = initialFilters.limit || 24;

	// Advanced filters collapse state
	let showAdvanced = $state(false);
	let showMap = $state(false);
	let showMapLightbox = $state(false);
	let groupCardsEl = $state();
	let scrollToCardsAfterSearch = $state(false);

	let applyTimer;
	function scheduleApply() {
		clearTimeout(applyTimer);
		applyTimer = setTimeout(() => applyFilters(true), 300);
	}
	function setPage(p) {
		page = p;
		applyFilters(false);
	}
	function applyFilters(resetPage = true) {
		try {
			if (resetPage) page = 1;

			const url = new URL(window.location.href);
			const p = url.searchParams;

			if (page > 1) p.set('page', String(page));
			else p.delete('page');

			if ((q || '').trim()) p.set('q', q.trim());
			else p.delete('q');
			if ((country || '').trim()) p.set('country', country.trim());
			else p.delete('country');
			if ((state_region || '').trim()) p.set('state_region', state_region.trim());
			else p.delete('state_region');
			p.delete('skill_level_ids');
			p.delete('group_type_ids');
			p.delete('audience_focus_ids');
			p.delete('riding_discipline_ids');
			for (const id of group_type_ids) p.append('group_type_ids', String(id));
			for (const id of skill_level_ids) p.append('skill_level_ids', String(id));
			for (const id of audience_focus_ids) p.append('audience_focus_ids', String(id));
			for (const id of riding_discipline_ids) p.append('riding_discipline_ids', String(id));
			const qs = p.toString();
			const target = url.pathname + (qs ? `?${qs}` : '');
			goto(target, { replaceState: true, keepFocus: true, noScroll: true });
		} catch {}
	}

	function handleSearchInput(event) {
		void event;
		scheduleApply();
	}

	function scrollToGroupCards() {
		if (!groupCardsEl) return;
		groupCardsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleSearchButtonClick() {
		scrollToCardsAfterSearch = true;
		applyFilters(true);
	}

	function clearAll() {
		q = '';
		country = '';
		state_region = '';
		group_type_ids = [];
		skill_level_ids = [];
		audience_focus_ids = [];
		riding_discipline_ids = [];
		applyFilters();
	}

	function toggleType(id) {
		const s = new Set(group_type_ids);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		group_type_ids = Array.from(s);
		scheduleApply();
	}

	function toggleSkill(id) {
		const s = new Set(skill_level_ids);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		skill_level_ids = Array.from(s);
		scheduleApply();
	}

	function toggleAudience(id) {
		const s = new Set(audience_focus_ids);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		audience_focus_ids = Array.from(s);
		scheduleApply();
	}

	function toggleDiscipline(id) {
		const s = new Set(riding_discipline_ids);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		riding_discipline_ids = Array.from(s);
		scheduleApply();
	}

	const activeFilterCount = $derived(
		(q ? 1 : 0) +
			(country ? 1 : 0) +
			(state_region ? 1 : 0) +
			group_type_ids.length +
			skill_level_ids.length +
			audience_focus_ids.length +
			riding_discipline_ids.length
	);

	function filterChipClass(active) {
		const base =
			'px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition cursor-pointer';
		return active
			? `${base} bg-primary-500 text-surface-950`
			: `${base} bg-surface-950 text-surface-50 hover:bg-tertiary-500 hover:text-surface-950`;
	}

	// Country -> State/Region mapping
	const statesByCountry = {
		US: [
			'AL',
			'AK',
			'AZ',
			'AR',
			'CA',
			'CO',
			'CT',
			'DE',
			'FL',
			'GA',
			'HI',
			'ID',
			'IL',
			'IN',
			'IA',
			'KS',
			'KY',
			'LA',
			'ME',
			'MD',
			'MA',
			'MI',
			'MN',
			'MS',
			'MO',
			'MT',
			'NE',
			'NV',
			'NH',
			'NJ',
			'NM',
			'NY',
			'NC',
			'ND',
			'OH',
			'OK',
			'OR',
			'PA',
			'RI',
			'SC',
			'SD',
			'TN',
			'TX',
			'UT',
			'VT',
			'VA',
			'WA',
			'WV',
			'WI',
			'WY',
			'DC'
		],
		CA: ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'],
		AU: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']
	};
	const hasStateList = $derived(!!statesByCountry[country]?.length);

	// Leaflet map + clustering
	let mapEl = $state();
	let mapLightboxEl = $state();
	let map = $state(null);
	let mapLightbox = $state(null);
	let clusterLayer = $state(null);
	let clusterLayerLightbox = $state(null);
	let L = $state(null);

	function validCoords(g) {
		return Number.isFinite(g?.latitude) && Number.isFinite(g?.longitude);
	}

	let mapLoadPromise;
	async function ensureMapLibrary() {
		if (L) return L;
		if (!mapLoadPromise) {
			mapLoadPromise = Promise.all([
				import('#lib/map/leaflet.css'),
				import('leaflet'),
				import('leaflet.markercluster')
			]).then(([, mod]) => {
				L = mod.default || mod;
				return L;
			});
		}
		return mapLoadPromise;
	}

	onMount(() => {
		return () => {
			try {
				map?.remove();
				mapLightbox?.remove();
			} catch {}
		};
	});

	$effect(() => {
		if (showMap && !L) {
			ensureMapLibrary().catch((error) => console.error('Failed to load map', error));
		}
	});

	function createMap(targetEl) {
		if (!L || !targetEl) return null;
		const createdMap = L.map(targetEl);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(createdMap);
		const createdClusterLayer = L.markerClusterGroup({
			chunkedLoading: true,
			chunkInterval: 50,
			chunkDelay: 16,
			removeOutsideVisibleBounds: true,
			showCoverageOnHover: false
		});
		createdMap.addLayer(createdClusterLayer);
		return { map: createdMap, clusterLayer: createdClusterLayer };
	}

	function updateMarkers(targetMap, targetClusterLayer) {
		if (!targetMap || !targetClusterLayer || !L) return;
		targetClusterLayer.clearLayers();
		const pts = [];
		for (const g of data.mapPoints || []) {
			if (!validCoords(g)) continue;
			const lat = Number(g.latitude);
			const lng = Number(g.longitude);
			const m = L.marker([lat, lng]);
			m.bindPopup(
				`<div style="min-width:180px"><strong>${g.name}</strong><br/><small>${g.city ? g.city + ', ' : ''}${g.state_region} · ${g.country}</small><br/><a href="/groups/${g.slug}">View group</a></div>`
			);
			targetClusterLayer.addLayer(m);
			pts.push([lat, lng]);
		}
		if (pts.length) {
			const b = L.latLngBounds(pts);
			targetMap.fitBounds(b.pad(0.1));
		} else {
			targetMap.setView([37.8, -96], 4);
		}
	}

	$effect(() => {
		if (!L || !showMap || !mapEl || map) return;
		const created = createMap(mapEl);
		if (!created) return;
		map = created.map;
		clusterLayer = created.clusterLayer;
		updateMarkers(map, clusterLayer);
		setTimeout(() => map?.invalidateSize(), 120);
	});

	$effect(() => {
		if (showMap) return;
		try {
			map?.remove();
		} catch {}
		map = undefined;
		clusterLayer = undefined;
	});

	$effect(() => {
		if (!L || !showMapLightbox || !mapLightboxEl || mapLightbox) return;
		const created = createMap(mapLightboxEl);
		if (!created) return;
		mapLightbox = created.map;
		clusterLayerLightbox = created.clusterLayer;
		updateMarkers(mapLightbox, clusterLayerLightbox);
		setTimeout(() => mapLightbox?.invalidateSize(), 80);
	});

	$effect(() => {
		if (showMapLightbox) return;
		try {
			mapLightbox?.remove();
		} catch {}
		mapLightbox = undefined;
		clusterLayerLightbox = undefined;
	});

	$effect(() => {
		void data.mapPoints;
		updateMarkers(map, clusterLayer);
		updateMarkers(mapLightbox, clusterLayerLightbox);
	});

	$effect(() => {
		if (showMap && map) {
			setTimeout(() => map?.invalidateSize(), 180);
		}
	});

	$effect(() => {
		if (showMapLightbox && mapLightbox) {
			setTimeout(() => mapLightbox?.invalidateSize(), 80);
		}
	});

	$effect(() => {
		if (!showMap && showMapLightbox) {
			showMapLightbox = false;
		}
	});

	$effect(() => {
		if (!scrollToCardsAfterSearch) return;
		if (navigating) return;
		scrollToCardsAfterSearch = false;
		setTimeout(() => scrollToGroupCards(), 10);
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		if (!showMapLightbox) return;
		const previousOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden';
		return () => {
			document.documentElement.style.overflow = previousOverflow;
		};
	});

	onMount(() => {
		const onKeyDown = (event) => {
			if (event.key === 'Escape' && showMapLightbox) {
				showMapLightbox = false;
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	function groupPlace(group) {
		return (
			[group?.city, group?.state_region].filter(Boolean).join(', ') ||
			group?.country ||
			'Location coming soon'
		);
	}
</script>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
		aria-labelledby="groups-hero-heading"
	>
		<div
			class="flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p
				class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Cycling communities</span>
			</p>

			<div class="flex flex-col gap-6">
				<h1
					id="groups-hero-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.4vw,6.5rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Find the people who make <span class="text-secondary-500">riding better.</span>
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					Discover clubs, teams, and advocacy organizations that match where—and how—you ride.
				</p>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<a
					href="#group-list"
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					Explore groups
					<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
				</a>
				<a
					href="/groups/new"
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					<IconPlus class="h-5 w-5" /> Start a group
				</a>
			</div>
		</div>

		<div class="bg-surface-950 relative min-h-[22rem] sm:min-h-[28rem]">
			<img
				src={heroImage || '/images/default-ride.webp'}
				alt={heroGroup ? heroGroup.name : 'Cyclists riding together'}
				class="absolute inset-0 h-full w-full object-cover"
				width="1200"
				height="736"
				fetchpriority="high"
			/>

			<!-- Signature: the 3-foot ruler -->
			<div
				class="bg-tertiary-500 text-surface-950 absolute inset-y-0 left-0 flex w-12 flex-col items-center justify-between py-4 sm:w-16"
				aria-hidden="true"
			>
				<span class="text-lg leading-none font-black italic sm:text-2xl">3FT</span>
				<span
					class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
				></span>
				<span class="text-lg leading-none font-black italic sm:text-2xl">0</span>
			</div>

			{#if heroGroup}
				<a
					href={`/groups/${heroGroup.slug}`}
					class="group bg-surface-950 text-surface-50 hover:bg-secondary-500 absolute right-0 bottom-0 left-12 flex items-center justify-between gap-4 px-5 py-4 transition hover:no-underline sm:left-16"
				>
					<span class="min-w-0">
						<span
							class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.22em] uppercase"
						>
							Featured community
						</span>
						<span class="block truncate text-base font-black sm:text-lg">{heroGroup.name}</span>
						<span class="block truncate text-xs opacity-75">{groupPlace(heroGroup)}</span>
					</span>
					<IconArrowUpRight
						class="text-primary-500 h-6 w-6 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					/>
				</a>
			{/if}
		</div>
	</section>

	<!-- STATS RULER BAND -->
	<div
		class="bg-primary-500 text-surface-950 border-surface-950 grid grid-cols-3 border-t-[3px]"
		aria-label="Directory statistics"
	>
		{#each [{ value: data.totalGroups || 0, label: 'Groups', mark: '01' }, { value: regionCount, label: 'Regions', mark: '02' }, { value: data.group_types?.length || 0, label: 'Community types', mark: '03' }] as stat (stat.label)}
			<div
				class="border-surface-950 relative flex flex-col justify-between gap-2 border-l-[3px] px-4 pt-6 pb-4 first:border-l-0 sm:px-8 sm:pt-7 sm:pb-5"
			>
				<span
					class="absolute inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(90deg,var(--color-surface-950)_0_2px,transparent_2px_calc(100%/12))]"
					aria-hidden="true"
				></span>
				<span
					class="text-tertiary-600 text-xs font-black tracking-[0.2em] uppercase italic tabular-nums"
				>
					{stat.mark}
				</span>
				<div>
					<div
						class="text-3xl leading-none font-black tracking-tight uppercase italic tabular-nums sm:text-5xl"
					>
						{stat.value}
					</div>
					<div class="mt-1 text-xs font-bold tracking-[0.18em] uppercase">{stat.label}</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- DIRECTORY FILTERS -->
	<section
		class="bg-secondary-500 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-labelledby="filters-heading"
	>
		<div class="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] lg:gap-14">
			<div class="flex flex-col gap-5">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconSearch class="h-4 w-4" /> Directory filters
				</p>
				<h2
					id="filters-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-6xl"
				>
					Search by name, place, or riding style
				</h2>
				<p class="m-0 max-w-md text-lg leading-snug font-medium">
					The essentials stay visible; deeper filters are one tap away.
				</p>

				<div class="flex flex-wrap gap-3 pt-2">
					{#if activeFilterCount > 0}
						<button
							type="button"
							class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex cursor-pointer items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
							onclick={clearAll}
							in:fade={{ duration: 120 }}
						>
							Clear filters ({activeFilterCount})
						</button>
					{:else}
						<a
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 inline-flex items-center gap-2 border-[3px] px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							href="#group-list"
						>
							Browse all
						</a>
					{/if}

					<a
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						href="/groups/new"
					>
						<IconPlus class="h-4 w-4" />
						Create group
					</a>
				</div>
			</div>

			<div class="bg-surface-950 text-surface-50 flex flex-col gap-6 p-6 sm:p-8">
				<div class="flex flex-col gap-3">
					<div class="border-surface-50 flex border-[3px]">
						<input
							class="bg-surface-950 text-surface-50 placeholder:text-surface-400 min-w-0 flex-1 border-0 px-4 py-3 text-base font-medium focus:outline-none"
							bind:value={q}
							placeholder="Name, city, description…"
							oninput={handleSearchInput}
						/>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 flex shrink-0 cursor-pointer items-center justify-center px-5 transition"
							onclick={handleSearchButtonClick}
							aria-label="Search groups"
							title="Search"
						>
							<IconSearch class="h-5 w-5" />
						</button>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<select
							class="bg-surface-900 text-surface-50 border-surface-700 focus:border-primary-500 border-2 px-4 py-3 text-sm font-bold uppercase focus:outline-none"
							bind:value={country}
							onchange={scheduleApply}
						>
							<option value="">Any Country</option>
							<option value="US">United States</option>
							<option value="CA">Canada</option>
							<option value="MX">Mexico</option>
							<option value="GB">United Kingdom</option>
							<option value="AU">Australia</option>
							<option value="NZ">New Zealand</option>
							<option value="OTHER">Other</option>
						</select>

						{#if hasStateList}
							<select
								class="bg-surface-900 text-surface-50 border-surface-700 focus:border-primary-500 border-2 px-4 py-3 text-sm font-bold uppercase focus:outline-none"
								bind:value={state_region}
								onchange={scheduleApply}
							>
								<option value="">Any Region</option>
								{#each statesByCountry[country] as st (st)}
									<option value={st}>{st}</option>
								{/each}
							</select>
						{:else}
							<input
								class="bg-surface-900 text-surface-50 placeholder:text-surface-400 border-surface-700 focus:border-primary-500 border-2 px-4 py-3 text-sm font-bold uppercase focus:outline-none"
								bind:value={state_region}
								oninput={scheduleApply}
								placeholder="State/Region"
							/>
						{/if}
					</div>
				</div>

				<div class="flex flex-col gap-3">
					<div
						class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconSlidersHorizontal class="h-3.5 w-3.5" />
						Group Type
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="cursor-pointer px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition {group_type_ids.length ===
							0
								? 'bg-primary-500 text-surface-950'
								: 'border-surface-700 text-surface-50 hover:border-primary-500 border-2'}"
							onclick={() => {
								group_type_ids = [];
								scheduleApply();
							}}
						>
							All
						</button>
						{#each (data.group_types || []).slice(0, 6) as t (t.id)}
							<button
								type="button"
								class="cursor-pointer px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition {group_type_ids.includes(
									t.id
								)
									? 'bg-primary-500 text-surface-950'
									: 'border-surface-700 text-surface-50 hover:border-primary-500 border-2'}"
								onclick={() => toggleType(t.id)}
							>
								{t.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Advanced Settings Accordion -->
				<div class="border-surface-800 border-t-2 pt-4">
					<button
						type="button"
						class="text-surface-50 hover:text-primary-500 flex w-full cursor-pointer items-center justify-between py-1 text-left text-xs font-black tracking-[0.2em] uppercase transition"
						onclick={() => (showAdvanced = !showAdvanced)}
						aria-expanded={showAdvanced}
					>
						<span class="flex items-center gap-2">
							More Filters
							{#if skill_level_ids.length + audience_focus_ids.length + riding_discipline_ids.length + Math.max(0, group_type_ids.length - 6) > 0}
								<span
									class="bg-tertiary-500 text-surface-950 inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-[11px] font-black"
								>
									{skill_level_ids.length +
										audience_focus_ids.length +
										riding_discipline_ids.length +
										Math.max(0, group_type_ids.length - 6)}
								</span>
							{/if}
						</span>
						<IconChevronDown
							class="h-4 w-4 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}"
						/>
					</button>

					{#if showAdvanced}
						<div
							class="border-surface-800 mt-4 flex flex-col gap-5 border-t pt-4"
							in:slide={{ duration: 180 }}
							out:fade={{ duration: 120 }}
						>
							{#if (data.group_types || []).length > 6}
								<div class="flex flex-col gap-2">
									<div class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
										More Types
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each (data.group_types || []).slice(6) as t (t.id)}
											<button
												type="button"
												class="{filterChipClass(
													group_type_ids.includes(t.id)
												)} border-surface-700 border"
												onclick={() => toggleType(t.id)}>{t.name}</button
											>
										{/each}
									</div>
								</div>
							{/if}

							<div class="flex flex-col gap-2">
								<div class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
									Skill Levels
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.skill_levels || [] as t (t.id)}
										<button
											type="button"
											class="{filterChipClass(
												skill_level_ids.includes(t.id)
											)} border-surface-700 border"
											onclick={() => toggleSkill(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>

							<div class="flex flex-col gap-2">
								<div class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
									Audience Focus
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.audience_focuses || [] as t (t.id)}
										<button
											type="button"
											class="{filterChipClass(
												audience_focus_ids.includes(t.id)
											)} border-surface-700 border"
											onclick={() => toggleAudience(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>

							<div class="flex flex-col gap-2">
								<div class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
									Riding Disciplines
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.riding_disciplines || [] as t (t.id)}
										<button
											type="button"
											class="{filterChipClass(
												riding_discipline_ids.includes(t.id)
											)} border-surface-700 border"
											onclick={() => toggleDiscipline(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- RESULTS + MAP -->
	<section
		id="group-list"
		class="bg-surface-950 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-labelledby="listings-heading"
	>
		{#if data.error}
			<div class="bg-tertiary-500 text-surface-950 mb-8 px-5 py-4">
				<p class="m-0 text-sm font-black uppercase">{data.error}</p>
			</div>
		{/if}

		<!-- Results toolbar -->
		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Directory</p>
				<h2
					id="listings-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Group listings
				</h2>
			</div>

			<div class="flex flex-wrap items-center gap-4">
				<p class="text-surface-300 m-0 text-sm font-bold tracking-[0.15em] uppercase tabular-nums">
					{data.totalGroups ?? 0}
					{data.totalGroups === 1 ? 'group' : 'groups'} match
				</p>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="inline-flex cursor-pointer items-center gap-2 px-5 py-3 text-xs font-black tracking-[0.16em] uppercase transition {showMap
							? 'bg-primary-500 text-surface-950'
							: 'border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 border-2'}"
						onclick={() => (showMap = !showMap)}
					>
						<IconMapPin class="h-4 w-4" />
						{showMap ? 'Hide Map' : 'Show Map'}
					</button>
					{#if showMap}
						<button
							type="button"
							class="border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex cursor-pointer items-center gap-2 border-2 px-5 py-3 text-xs font-black tracking-[0.16em] uppercase transition"
							onclick={() => (showMapLightbox = true)}
						>
							<IconMaximize2 class="h-4 w-4" />
							Expand Map
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Lane divider -->
		<div
			class="my-8 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)] lg:my-10"
			aria-hidden="true"
		></div>

		<!-- Map -->
		{#if showMap}
			<div class="border-primary-500 mb-10 border-[3px]">
				<div bind:this={mapEl} class="map-canvas"></div>
			</div>
		{/if}
		{#if showMap && showMapLightbox}
			<button
				type="button"
				class="map-lightbox-backdrop"
				aria-label="Close expanded map"
				onclick={() => (showMapLightbox = false)}
			></button>
			<div class="map-shell-lightbox border-primary-500 border-[3px]">
				<div class="map-lightbox-toolbar">
					<button
						type="button"
						class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-black tracking-[0.16em] uppercase"
						onclick={() => (showMapLightbox = false)}
					>
						<IconMinimize2 class="h-4 w-4" />
						Close Expanded Map
					</button>
				</div>
				<div bind:this={mapLightboxEl} class="map-canvas map-canvas-lightbox"></div>
			</div>
		{/if}

		<!-- Groups grid -->
		<div bind:this={groupCardsEl}>
			{#if !data.groups?.length}
				<!-- Empty state -->
				<div class="border-surface-50 flex flex-col gap-6 border-t-2 pt-10">
					<div class="bg-tertiary-500 text-surface-950 flex h-16 w-16 items-center justify-center">
						<IconUsers class="h-8 w-8" />
					</div>
					<div class="flex max-w-xl flex-col gap-3">
						<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
							No groups match that filter yet
						</h3>
						<p class="text-surface-300 m-0 text-lg leading-relaxed">
							Try a broader search, clear some filters, or be the first to start a group in this
							area!
						</p>
					</div>
					<div class="flex flex-wrap gap-3">
						{#if activeFilterCount > 0}
							<button
								type="button"
								class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 cursor-pointer border-2 px-6 py-3 font-black uppercase transition"
								onclick={clearAll}
							>
								Clear filters
							</button>
						{/if}
						<a
							class="bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex items-center gap-2 px-6 py-3 font-black uppercase hover:no-underline"
							href="/groups/new"
						>
							<IconPlus class="h-4 w-4" />
							Create group
						</a>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
					{#each data.groups as g, index (g.id)}
						<a
							href={`/groups/${g.slug}`}
							class="group border-surface-800 bg-surface-900 text-surface-50 hover:bg-primary-500 hover:text-surface-950 hover:border-primary-500 flex flex-col justify-between border-2 transition hover:no-underline"
						>
							<div>
								<!-- Cover image area -->
								<div
									class="bg-secondary-500 border-surface-800 relative aspect-[16/10] w-full overflow-hidden border-b-2"
								>
									{#if g.cover_photo_url}
										<img
											src={optimizedImageUrl(g.cover_photo_url, {
												width: 768,
												height: 576,
												quality: 64
											})}
											alt="{g.name} cover"
											loading="lazy"
											class="absolute inset-0 h-full w-full object-cover"
											width="768"
											height="576"
											decoding="async"
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center">
											<span
												class="text-primary-500/30 text-7xl leading-none font-black italic select-none"
												aria-hidden="true"
											>
												3FT
											</span>
										</div>
									{/if}

									<!-- Top-left index numeral -->
									<span
										class="bg-surface-950 text-tertiary-500 absolute top-0 left-0 px-3 py-1.5 text-sm font-black italic tabular-nums"
									>
										{String((page - 1) * limit + index + 1).padStart(2, '0')}
									</span>

									<!-- Top-right: group type tags -->
									{#if (data.group_types_map?.[g.id] || []).length}
										<div
											class="absolute top-0 right-0 flex max-w-[75%] flex-wrap justify-end gap-1 p-2"
										>
											{#each (data.group_types_map[g.id] || []).slice(0, 2) as t (t)}
												<span
													class="bg-primary-500 text-surface-950 px-2.5 py-1 text-[0.65rem] font-black tracking-[0.15em] uppercase"
												>
													{t}
												</span>
											{/each}
										</div>
									{/if}
								</div>

								<!-- Identity & copy -->
								<div class="flex items-start gap-4 p-5">
									<div
										class="bg-surface-50 text-surface-950 flex h-14 w-14 shrink-0 items-center justify-center p-1.5"
									>
										{#if g.logo_url}
											<img
												src={optimizedImageUrl(g.logo_url, {
													width: 96,
													height: 96,
													quality: 64
												})}
												alt="{g.name} logo"
												loading="lazy"
												class="h-full w-full object-contain"
												width="96"
												height="96"
												decoding="async"
											/>
										{:else}
											<IconUsers class="h-6 w-6" />
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<h3
											class="text-surface-50! group-hover:text-surface-950! m-0 line-clamp-2 text-xl leading-tight font-black uppercase"
										>
											{g.name}
										</h3>
										<p
											class="m-0 mt-1 flex items-center gap-1 truncate text-xs font-bold tracking-[0.12em] uppercase opacity-75"
										>
											<IconMapPin class="h-3.5 w-3.5 shrink-0" />
											{#if g.city}{g.city},{/if}
											{g.state_region}
											{#if g.state_region && g.country}
												·
											{/if}
											{g.country}
										</p>
										{#if g.tagline}
											<p class="m-0 mt-2.5 line-clamp-2 text-sm leading-snug opacity-85">
												{g.tagline}
											</p>
										{/if}
									</div>
								</div>
							</div>

							<div
								class="border-surface-800 group-hover:border-surface-950/20 flex items-center justify-between border-t px-5 py-3 text-xs font-black tracking-[0.18em] uppercase"
							>
								<span>Open group</span>
								<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Pagination Controls -->
		{#if data.totalGroups > limit}
			{@const totalPages = Math.ceil(data.totalGroups / limit)}
			<div
				class="border-surface-800 mt-12 flex flex-wrap items-center justify-between gap-4 border-t-2 pt-8"
			>
				<button
					type="button"
					class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 cursor-pointer border-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-40"
					disabled={page <= 1 || navigating}
					onclick={() => setPage(page - 1)}
				>
					Previous
				</button>
				<span
					class="flex items-center justify-center gap-2 px-4 text-sm font-black tracking-[0.2em] uppercase tabular-nums"
				>
					{#if navigating}
						<IconLoader2 class="text-primary-500 h-4 w-4 animate-spin" />
					{/if}
					Page {page} of {totalPages}
				</span>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 cursor-pointer px-6 py-3 text-sm font-black tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-40"
					disabled={page >= totalPages || navigating}
					onclick={() => setPage(page + 1)}
				>
					Next
				</button>
			</div>
		{/if}
	</section>
</div>

<style>
	.map-canvas {
		height: 380px;
		width: 100%;
	}

	.map-lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		border: none;
		padding: 0;
		margin: 0;
		background: rgba(10, 10, 14, 0.88);
	}

	.map-shell-lightbox {
		position: fixed;
		inset: 3vh 2vw;
		z-index: 1250;
		background: var(--color-surface-950);
	}

	.map-lightbox-toolbar {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 10;
	}

	.map-canvas-lightbox {
		height: 100%;
		min-height: 78vh;
	}
</style>
