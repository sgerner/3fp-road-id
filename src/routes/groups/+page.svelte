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
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';

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

	// Advanced filters collapse state
	let showAdvanced = $state(false);
	// Map visibility
	let showMap = $state(true);

	let applyTimer;
	function scheduleApply() {
		clearTimeout(applyTimer);
		applyTimer = setTimeout(applyFilters, 300);
	}
	function applyFilters() {
		try {
			const url = new URL(window.location.href);
			const p = url.searchParams;
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
	let mapEl;
	let map;
	let clusterLayer;
	let L;

	function validCoords(g) {
		return Number.isFinite(g?.latitude) && Number.isFinite(g?.longitude);
	}

	onMount(async () => {
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
		if (!mapEl) return;
		map = L.map(mapEl);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		clusterLayer = L.markerClusterGroup();
		map.addLayer(clusterLayer);
		updateMarkers();
		return () => {
			try {
				map?.remove();
			} catch {}
		};
	});

	function updateMarkers() {
		if (!map || !clusterLayer) return;
		clusterLayer.clearLayers();
		const pts = [];
		for (const g of data.groups || []) {
			if (!validCoords(g)) continue;
			const lat = Number(g.latitude);
			const lng = Number(g.longitude);
			const m = L.marker([lat, lng]);
			m.bindPopup(
				`<div style="min-width:180px"><strong>${g.name}</strong><br/><small>${g.city ? g.city + ', ' : ''}${g.state_region} · ${g.country}</small><br/><a href="/groups/${g.slug}">View group</a></div>`
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
		void data.groups;
		updateMarkers();
	});

	// Invalidate map size when map becomes visible
	$effect(() => {
		if (showMap && map) {
			setTimeout(() => map?.invalidateSize(), 180);
		}
	});
</script>

<div class="mx-auto w-full max-w-6xl space-y-5 pb-10">
	<!-- ═══════════════════════════════ HERO HEADER ═══════════════════════════════ -->
	<header class="relative overflow-hidden rounded-2xl px-8 py-10">
		<!-- Subtle bg glow behind header -->
		<div
			class="from-primary-500/15 to-secondary-500/10 pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br"
		></div>
		<div
			class="border-primary-500/15 bg-surface-50-950/30 pointer-events-none absolute inset-0 rounded-2xl border backdrop-blur-sm"
		></div>

		<div class="relative z-10 flex flex-col items-center gap-3">
			<div class="flex flex-wrap items-center justify-center gap-3">
				<h1 class="m-0 text-4xl font-extrabold tracking-tight drop-shadow-sm">Cycling Groups</h1>
				<a
					href="/groups/new"
					class="btn preset-filled-primary-500 flex items-center gap-1.5 shadow-md transition-transform hover:scale-105"
				>
					<IconPlus class="h-4 w-4" />
					<span class="font-semibold">Add Group</span>
				</a>
			</div>
			<p class="text-surface-600-400 m-0 text-center text-sm">
				Discover local clubs, teams, and advocacy organizations near you.
			</p>

			<!-- Result count badge -->
			{#key data.groups?.length}
				<div class="flex items-center gap-2" in:fade={{ duration: 180 }}>
					<span class="chip preset-tonal-surface text-xs font-medium">
						<IconUsers class="h-3.5 w-3.5" />
						{#if data.groups?.length === 1}
							1 group found
						{:else}
							{data.groups?.length ?? 0} groups found
						{/if}
					</span>
				</div>
			{/key}
		</div>
	</header>

	<!-- ═══════════════════════════════ FILTER PANEL ══════════════════════════════ -->
	<section
		class="border-primary-500/20 bg-surface-50-950/40 rounded-2xl border p-4 shadow-sm backdrop-blur-xl"
	>
		<!-- Row 1: Search + Country + State -->
		<div class="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
			<!-- Search -->
			<div class="flex flex-col gap-1">
				<label class="label" for="q">Search</label>
				<div class="relative">
					<IconSearch
						class="text-surface-500-400 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<input
						id="q"
						class="input bg-surface-950-50/5 pl-9"
						bind:value={q}
						placeholder="Name, city, description…"
						oninput={scheduleApply}
					/>
				</div>
			</div>

			<!-- Country -->
			<div class="flex flex-col gap-1">
				<label class="label" for="country">Country</label>
				<select
					id="country"
					class="select bg-surface-950-50/5"
					bind:value={country}
					onchange={scheduleApply}
				>
					<option value="">Any</option>
					<option value="US">United States</option>
					<option value="CA">Canada</option>
					<option value="MX">Mexico</option>
					<option value="GB">United Kingdom</option>
					<option value="AU">Australia</option>
					<option value="NZ">New Zealand</option>
					<option value="OTHER">Other</option>
				</select>
			</div>

			<!-- State / Region -->
			<div class="flex flex-col gap-1">
				<label class="label" for="state_region">State / Region</label>
				{#if hasStateList}
					<select
						id="state_region"
						class="select bg-surface-950-50/5"
						bind:value={state_region}
						onchange={scheduleApply}
					>
						<option value="">Any</option>
						{#each statesByCountry[country] as st}
							<option value={st}>{st}</option>
						{/each}
					</select>
				{:else}
					<input
						id="state_region"
						class="input bg-surface-950-50/5"
						bind:value={state_region}
						oninput={scheduleApply}
						placeholder="e.g. AZ"
					/>
				{/if}
			</div>
		</div>

		<!-- Row 2: Group Type chips -->
		<div class="mt-3">
			<div class="label mb-1.5">Group Type</div>
			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					class={group_type_ids.length === 0 ? chipFilled('All') : chipOutlined('All')}
					onclick={() => {
						group_type_ids = [];
						scheduleApply();
					}}
				>
					All
				</button>
				{#each data.group_types || [] as t}
					<button
						type="button"
						class={group_type_ids.includes(t.id) ? chipFilled(t.name) : chipOutlined(t.name)}
						onclick={() => toggleType(t.id)}>{t.name}</button
					>
				{/each}
			</div>
		</div>

		<!-- Row 3: Advanced toggle + clear -->
		<div class="mt-3 flex items-center justify-between gap-2">
			<button
				type="button"
				class="btn btn-sm preset-outlined-surface-500 flex items-center gap-1.5"
				onclick={() => (showAdvanced = !showAdvanced)}
				aria-expanded={showAdvanced}
			>
				<IconSlidersHorizontal class="h-3.5 w-3.5" />
				<span>{showAdvanced ? 'Hide' : 'More'} Filters</span>
				{#if skill_level_ids.length + audience_focus_ids.length + riding_discipline_ids.length > 0}
					<span
						class="bg-primary-500 text-surface-50 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
					>
						{skill_level_ids.length + audience_focus_ids.length + riding_discipline_ids.length}
					</span>
				{/if}
				<IconChevronDown
					class="h-3.5 w-3.5 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}"
				/>
			</button>

			{#if activeFilterCount > 0}
				<button
					type="button"
					class="btn btn-sm preset-tonal-error flex items-center gap-1"
					onclick={clearAll}
					in:fade={{ duration: 120 }}
				>
					<IconX class="h-3.5 w-3.5" />
					Clear All
				</button>
			{/if}
		</div>

		<!-- Advanced filters -->
		{#if showAdvanced}
			<div class="mt-3 space-y-3" in:slide={{ duration: 180 }} out:fade={{ duration: 120 }}>
				<div class="border-surface-500/10 border-t pt-3">
					<!-- Skill Levels -->
					<div class="mb-3">
						<div class="label mb-1.5">Skill Levels</div>
						<div class="flex flex-wrap gap-1.5">
							<button
								type="button"
								class={skill_level_ids.length === 0 ? chipFilled('All') : chipOutlined('All')}
								onclick={() => {
									skill_level_ids = [];
									scheduleApply();
								}}>All</button
							>
							{#each data.skill_levels || [] as t}
								<button
									type="button"
									class={skill_level_ids.includes(t.id) ? chipFilled(t.name) : chipOutlined(t.name)}
									onclick={() => toggleSkill(t.id)}>{t.name}</button
								>
							{/each}
						</div>
					</div>

					<!-- Audience Focus -->
					<div class="mb-3">
						<div class="label mb-1.5">Audience Focus</div>
						<div class="flex flex-wrap gap-1.5">
							<button
								type="button"
								class={audience_focus_ids.length === 0 ? chipFilled('All') : chipOutlined('All')}
								onclick={() => {
									audience_focus_ids = [];
									scheduleApply();
								}}>All</button
							>
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

					<!-- Riding Disciplines -->
					<div>
						<div class="label mb-1.5">Riding Disciplines</div>
						<div class="flex flex-wrap gap-1.5">
							<button
								type="button"
								class={riding_discipline_ids.length === 0 ? chipFilled('All') : chipOutlined('All')}
								onclick={() => {
									riding_discipline_ids = [];
									scheduleApply();
								}}>All</button
							>
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
			</div>
		{/if}
	</section>

	<!-- ═══════════════════════════════ RESULTS + MAP ═════════════════════════════ -->
	<section class="space-y-4">
		{#if data.error}
			<div class="bg-error-500/10 border-error-500/30 rounded-xl border px-4 py-3">
				<p class="text-error-600-400 m-0 text-sm">{data.error}</p>
			</div>
		{/if}

		<!-- Results toolbar -->
		<div class="flex items-center justify-between gap-2">
			<p class="text-surface-600-400 m-0 text-sm">
				{#if data.groups?.length}
					Showing <strong class="text-surface-950-50">{data.groups.length}</strong>
					{data.groups.length === 1 ? 'group' : 'groups'}
				{/if}
			</p>
			<button
				type="button"
				class="btn btn-sm {showMap
					? 'preset-filled-primary-500'
					: 'preset-outlined-surface-500'} flex items-center gap-1.5 transition-all"
				onclick={() => (showMap = !showMap)}
			>
				<IconMap class="h-3.5 w-3.5" />
				{showMap ? 'Hide Map' : 'Show Map'}
			</button>
		</div>

		<!-- Map -->
		{#if showMap}
			<div transition:slide={{ duration: 220 }}>
				<div class="border-surface-500/15 overflow-hidden rounded-2xl border shadow-lg">
					<div bind:this={mapEl} class="h-[380px] w-full"></div>
				</div>
			</div>
		{/if}

		<!-- Groups grid -->
		{#if !data.groups?.length}
			<!-- Empty state -->
			<div
				class="border-surface-500/15 bg-surface-50-950/30 flex flex-col items-center gap-4 rounded-2xl border py-16 text-center"
				in:fade={{ duration: 200 }}
			>
				<div class="bg-surface-500/10 flex h-16 w-16 items-center justify-center rounded-2xl">
					<IconUsers class="text-surface-400-600 h-8 w-8" />
				</div>
				<div>
					<h3 class="m-0 mb-1 text-lg font-semibold">No groups found</h3>
					<p class="text-surface-600-400 m-0 text-sm">
						Try adjusting your filters, or be the first to add a group!
					</p>
				</div>
				<div class="flex gap-2">
					{#if activeFilterCount > 0}
						<button type="button" class="btn btn-sm preset-tonal-surface" onclick={clearAll}>
							Clear Filters
						</button>
					{/if}
					<a href="/groups/new" class="btn btn-sm preset-filled-primary-500">
						<IconPlus class="h-4 w-4" />
						Add a Group
					</a>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each data.groups as g (g.id)}
					<a
						href={`/groups/${g.slug}`}
						class="group border-surface-500/15 bg-surface-100-900/60 hover:border-primary-500/40 hover:shadow-primary-500/10 block overflow-hidden rounded-2xl border shadow-md backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
						in:fade={{ duration: 120 }}
						out:fade={{ duration: 120 }}
						animate:flip
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
	</section>
</div>
