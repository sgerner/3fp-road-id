<script>
	let { data } = $props();
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconMap from '@lucide/svelte/icons/map';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconX from '@lucide/svelte/icons/x';
	import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMaximize2 from '@lucide/svelte/icons/maximize-2';
	import IconMinimize2 from '@lucide/svelte/icons/minimize-2';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconLoader2 from '@lucide/svelte/icons/loader-2';
	import { fade, slide } from 'svelte/transition';
	import { navigating } from '$app/stores';

	function getInitialFilters() {
		return data.filters ?? {};
	}
	const initialFilters = getInitialFilters();
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
	// Map visibility
	function isMobileViewport() {
		return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
	}
	let showMap = $state(!isMobileViewport());
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

	// Active filter count (excluding group_type_ids which are always visible)
	const activeFilterCount = $derived(
		(q ? 1 : 0) +
			(country ? 1 : 0) +
			(state_region ? 1 : 0) +
			group_type_ids.length +
			skill_level_ids.length +
			audience_focus_ids.length +
			riding_discipline_ids.length
	);

	// Deterministic chip styling per group type name using Skeleton presets
	const filledClasses = [
		'chip text-xs preset-filled-primary-500',
		'chip text-xs preset-filled-secondary-500',
		'chip text-xs preset-filled-tertiary-500',
		'chip text-xs preset-filled-success-500',
		'chip text-xs preset-filled-warning-500',
		'chip text-xs preset-filled-error-500',
		'chip text-xs preset-tonal-primary',
		'chip text-xs preset-tonal-secondary',
		'chip text-xs preset-tonal-tertiary',
		'chip text-xs preset-tonal-surface'
	];
	const outlinedClasses = [
		'chip text-xs preset-outlined-primary-500',
		'chip text-xs preset-outlined-secondary-500',
		'chip text-xs preset-outlined-tertiary-500',
		'chip text-xs preset-outlined-success-500',
		'chip text-xs preset-outlined-warning-500',
		'chip text-xs preset-outlined-error-500',
		'chip text-xs preset-tonal-primary',
		'chip text-xs preset-tonal-secondary',
		'chip text-xs preset-tonal-tertiary',
		'chip text-xs preset-tonal-surface'
	];

	function hashStr(s) {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return Math.abs(h);
	}
	function chipIndex(name) {
		return hashStr(name || '') % filledClasses.length;
	}
	function chipFilled(name) {
		return filledClasses[chipIndex(name)];
	}
	function chipOutlined(name) {
		return outlinedClasses[chipIndex(name)];
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

	onMount(async () => {
		if (isMobileViewport()) showMap = false;
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
		return () => {
			try {
				map?.remove();
				mapLightbox?.remove();
			} catch {}
		};
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

	// Invalidate map size when map becomes visible
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
		if ($navigating) return;
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
</script>

<div class="groups-page mx-auto flex w-full max-w-7xl flex-col gap-10">
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
						<IconUsers class="h-3.5 w-3.5" />
						Groups
					</span>
					<span class="chip preset-tonal-secondary">Community</span>
					<span class="chip preset-tonal-tertiary">Clubs & Teams</span>
				</div>

				<div class="space-y-4">
					<h1
						class="groups-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						Find your people.<br />
						<span class="groups-headline-accent">Ride together.</span>
					</h1>
					<p class="max-w-xl text-base leading-relaxed opacity-75">
						Discover local clubs, teams, and advocacy organizations near you. Join a community that
						matches your vibe and riding style.
					</p>
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
							<IconUsers class="h-4 w-4" />
							Total Groups
						</div>
						<div class="text-3xl font-black tabular-nums">{data.totalGroups || 0}</div>
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
							<IconMapPin class="h-4 w-4" />
							Active Regions
						</div>
						<div class="text-3xl font-black tabular-nums">
							{new Set((data.mapPoints || []).map((g) => g.state_region).filter(Boolean)).size || 0}
						</div>
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
							<IconMap class="h-4 w-4" />
							Group Types
						</div>
						<div class="text-3xl font-black tabular-nums">{data.group_types?.length || 0}</div>
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
						Explore groups
					</div>
					<h2 class="text-xl font-bold">Search by type, location, or name</h2>
				</div>

				<div class="flex flex-col gap-3">
					<div class="relative">
						<IconSearch
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
						/>
						<input
							class="input bg-surface-950-50/5 pl-9"
							bind:value={q}
							placeholder="Name, city, description…"
							oninput={handleSearchInput}
						/>
					</div>
					<button
						type="button"
						class="btn preset-filled-primary-500 gap-2 self-start"
						onclick={handleSearchButtonClick}
					>
						<IconSearch class="h-4 w-4" />
						Search
					</button>

					<div class="grid grid-cols-2 gap-2">
						<select
							class="select bg-surface-950-50/5 text-sm"
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
								class="select bg-surface-950-50/5 text-sm"
								bind:value={state_region}
								onchange={scheduleApply}
							>
								<option value="">Any Region</option>
								{#each statesByCountry[country] as st}
									<option value={st}>{st}</option>
								{/each}
							</select>
						{:else}
							<input
								class="input bg-surface-950-50/5 text-sm"
								bind:value={state_region}
								oninput={scheduleApply}
								placeholder="State/Region"
							/>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<div
						class="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-50"
					>
						<IconSlidersHorizontal class="h-3.5 w-3.5" />
						Group Type
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class={`chip ${group_type_ids.length === 0 ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
							onclick={() => {
								group_type_ids = [];
								scheduleApply();
							}}
						>
							All
						</button>
						{#each (data.group_types || []).slice(0, 6) as t}
							<button
								type="button"
								class={`chip ${group_type_ids.includes(t.id) ? 'preset-filled-secondary-500' : 'preset-tonal-secondary'}`}
								onclick={() => toggleType(t.id)}
							>
								{t.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Advanced Settings Accordion -->
				<div class="mt-2 text-sm">
					<button
						type="button"
						class="flex w-full items-center justify-between py-2 text-left font-medium opacity-80 hover:opacity-100"
						onclick={() => (showAdvanced = !showAdvanced)}
						aria-expanded={showAdvanced}
					>
						<span class="flex items-center gap-2">
							More Filters
							{#if skill_level_ids.length + audience_focus_ids.length + riding_discipline_ids.length + Math.max(0, group_type_ids.length - 6) > 0}
								<span
									class="bg-primary-500 text-surface-50 ml-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
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
							class="border-surface-500/10 mt-2 space-y-4 border-t pt-3"
							in:slide={{ duration: 180 }}
							out:fade={{ duration: 120 }}
						>
							{#if (data.group_types || []).length > 6}
								<div>
									<div class="mb-1.5 text-xs font-semibold opacity-60">More Types</div>
									<div class="flex flex-wrap gap-1.5">
										{#each (data.group_types || []).slice(6) as t}
											<button
												type="button"
												class={group_type_ids.includes(t.id)
													? chipFilled(t.name)
													: chipOutlined(t.name)}
												onclick={() => toggleType(t.id)}>{t.name}</button
											>
										{/each}
									</div>
								</div>
							{/if}

							<div>
								<div class="mb-1.5 text-xs font-semibold opacity-60">Skill Levels</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.skill_levels || [] as t}
										<button
											type="button"
											class={skill_level_ids.includes(t.id)
												? chipFilled(t.name)
												: chipOutlined(t.name)}
											onclick={() => toggleSkill(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>

							<div>
								<div class="mb-1.5 text-xs font-semibold opacity-60">Audience Focus</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.audience_focuses || [] as t}
										<button
											type="button"
											class={audience_focus_ids.includes(t.id)
												? chipFilled(t.name)
												: chipOutlined(t.name)}
											onclick={() => toggleAudience(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>

							<div>
								<div class="mb-1.5 text-xs font-semibold opacity-60">Riding Disciplines</div>
								<div class="flex flex-wrap gap-1.5">
									{#each data.riding_disciplines || [] as t}
										<button
											type="button"
											class={riding_discipline_ids.includes(t.id)
												? chipFilled(t.name)
												: chipOutlined(t.name)}
											onclick={() => toggleDiscipline(t.id)}>{t.name}</button
										>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>

				<div class="mt-auto grid gap-3 pt-2 sm:grid-cols-2">
					{#if activeFilterCount > 0}
						<button
							type="button"
							class="btn preset-outlined-surface-950-50 col-span-1 hidden sm:flex"
							onclick={clearAll}
							in:fade={{ duration: 120 }}
						>
							Clear filters
						</button>
					{:else}
						<a
							class="btn preset-outlined-surface-950-50 col-span-1 hidden sm:flex"
							href="#group-list"
						>
							Browse all
						</a>
					{/if}

					<a
						class="btn preset-outlined-primary-500 gap-2 {activeFilterCount > 0
							? 'col-span-1 sm:col-span-1'
							: 'col-span-1 sm:col-span-1'}"
						href="/groups/new"
					>
						<IconPlus class="h-4 w-4" />
						Create group
					</a>

					{#if activeFilterCount > 0}
						<button
							type="button"
							class="btn preset-outlined-error-500 col-span-1 flex sm:hidden"
							onclick={clearAll}
						>
							Clear filters
						</button>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════ RESULTS + MAP ═════════════════════════════ -->
	<section id="group-list" class="space-y-5">
		{#if data.error}
			<div class="bg-error-500/10 border-error-500/30 rounded-xl border px-4 py-3">
				<p class="text-error-600-400 m-0 text-sm">{data.error}</p>
			</div>
		{/if}

		<!-- Results toolbar -->
		<div class="flex items-center justify-between gap-2">
			<div>
				<p class="label opacity-60">Directory</p>
				<h2 class="text-2xl font-bold">Group listings</h2>
			</div>

			<div class="flex flex-col items-end gap-2">
				<p class="text-sm tabular-nums opacity-60">
					{data.totalGroups ?? 0}
					{data.totalGroups === 1 ? 'group' : 'groups'} match
				</p>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="btn btn-sm {showMap
							? 'preset-filled-primary-500'
							: 'preset-outlined-surface-500'} flex items-center gap-1.5 transition-all"
						onclick={() => (showMap = !showMap)}
					>
						<IconMapPin class="h-3.5 w-3.5" />
						{showMap ? 'Hide Map' : 'Show Map'}
					</button>
					{#if showMap}
						<button
							type="button"
							class="btn btn-sm preset-outlined-primary-500 flex items-center gap-1.5"
							onclick={() => (showMapLightbox = true)}
						>
							<IconMaximize2 class="h-3.5 w-3.5" />
							Expand Map
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Map -->
		{#if showMap}
			<div>
				<div class="map-shell border-surface-500/15 overflow-hidden rounded-2xl border shadow-lg">
					<div bind:this={mapEl} class="map-canvas"></div>
				</div>
			</div>
		{/if}
		{#if showMap && showMapLightbox}
			<button
				type="button"
				class="map-lightbox-backdrop"
				aria-label="Close expanded map"
				onclick={() => (showMapLightbox = false)}
			></button>
			<div
				class="map-shell map-shell-lightbox border-surface-500/15 overflow-hidden border shadow-lg"
			>
				<div class="map-lightbox-toolbar">
					<button
						type="button"
						class="btn btn-sm preset-tonal-surface"
						onclick={() => (showMapLightbox = false)}
					>
						<IconMinimize2 class="h-3.5 w-3.5" />
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
				<div
					class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
				>
					<div class="app-empty-orb" aria-hidden="true"></div>
					<div class="relative z-10 mx-auto max-w-lg space-y-4">
						<div
							class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
						>
							<IconUsers class="h-10 w-10 opacity-60" />
						</div>
						<h3 class="text-2xl font-bold">No groups match that filter yet</h3>
						<p class="text-sm leading-relaxed opacity-70">
							Try a broader search, clear some filters, or be the first to start a group in this area!
						</p>
						<div class="flex flex-wrap justify-center gap-3 pt-2">
							{#if activeFilterCount > 0}
								<button class="btn preset-outlined-surface-950-50" onclick={clearAll}>
									Clear filters
								</button>
							{/if}
							<a class="btn preset-filled-primary-500 gap-2" href="/groups/new">
								<IconPlus class="h-4 w-4" />
								Create group
							</a>
						</div>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each data.groups as g (g.id)}
					<a
						href={`/groups/${g.slug}`}
						class="group border-surface-500/15 bg-surface-100-900/60 hover:border-primary-500/40 hover:shadow-primary-500/10 block overflow-hidden rounded-2xl border shadow-md backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
					>
						<!-- Cover image area -->
						<div
							class="from-primary-800/70 to-secondary-700/50 relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br"
						>
							{#if g.cover_photo_url}
								<img
									src={g.cover_photo_url}
									alt="{g.name} cover"
									loading="lazy"
									class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
								/>
							{/if}

							<!-- Bottom gradient scrim -->
							<div
								class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
							></div>

							<!-- Top-right: group type chips -->
							{#if (data.group_types_map?.[g.id] || []).length}
								<div
									class="absolute top-2.5 right-2.5 flex max-w-[70%] flex-wrap justify-end gap-1"
								>
									{#each (data.group_types_map[g.id] || []).slice(0, 2) as t}
										<span class="{chipFilled(t)} shadow-sm">{t}</span>
									{/each}
								</div>
							{/if}

							<!-- Bottom overlay: logo + name + location -->
							<div class="absolute inset-x-0 bottom-0 p-3">
								<div class="flex items-end gap-3">
									<!-- Logo -->
									{#if g.logo_url}
										<img
											src={g.logo_url}
											alt="{g.name} logo"
											loading="lazy"
											class="ring-surface-950-50/20 h-12 w-12 shrink-0 rounded-xl object-cover shadow-lg ring-2"
										/>
									{:else}
										<div
											class="bg-surface-950-50/20 ring-surface-950-50/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-2 backdrop-blur-sm"
										>
											<IconUsers class="text-surface-50 h-5 w-5" />
										</div>
									{/if}

									<div class="min-w-0 flex-1">
										<h3
											class="text-surface-50 m-0 truncate !text-left text-base leading-tight font-bold drop-shadow-sm"
										>
											{g.name}
										</h3>
										<p
											class="m-0 mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/70"
										>
											<IconMapPin class="h-3 w-3 shrink-0" />
											{#if g.city}{g.city},{/if}
											{g.state_region}
											{#if g.state_region && g.country}
												·
											{/if}
											{g.country}
										</p>
									</div>
								</div>

								<!-- Tagline, shown below -->
								{#if g.tagline}
									<p class="m-0 mt-2 line-clamp-1 text-xs text-white/60 drop-shadow-sm">
										{g.tagline}
									</p>
								{/if}
							</div>
						</div>
					</a>
				{/each}
				</div>
			{/if}
		</div>

		<!-- Pagination Controls -->
		{#if data.totalGroups > limit}
			{@const totalPages = Math.ceil(data.totalGroups / limit)}
			<div class="mt-10 flex items-center justify-center gap-3">
					<button
						class="btn preset-filled-surface-50-950 px-5 shadow-sm"
						disabled={page <= 1 || $navigating}
						onclick={() => setPage(page - 1)}
					>
						Previous
					</button>
					<span
						class="flex min-w-[140px] items-center justify-center gap-2 px-4 text-sm font-semibold opacity-70"
					>
						{#if $navigating}
							<IconLoader2 class="text-primary-500 h-4 w-4 animate-spin" />
						{/if}
						Page {page} of {totalPages}
					</span>
					<button
						class="btn preset-filled-surface-50-950 px-5 shadow-sm"
						disabled={page >= totalPages || $navigating}
						onclick={() => setPage(page + 1)}
					>
						Next
					</button>
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
	.groups-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.groups-headline-accent {
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
		background: color-mix(in oklab, var(--color-surface-950) 78%, black 22%);
		backdrop-filter: blur(2px);
	}

	.map-shell-lightbox {
		position: fixed;
		inset: 3vh 2vw;
		z-index: 1250;
		border-width: 1px;
		border-color: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		border-radius: 1rem;
		box-shadow: 0 20px 80px -24px color-mix(in oklab, black 50%, transparent);
		background: var(--color-surface-900);
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

	/* ── Empty state ── */
</style>
