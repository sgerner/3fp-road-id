<script>
	let { data } = $props();
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import IconPlus from '@lucide/svelte/icons/plus';
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	let q = $state(data.filters?.q || '');
	let country = $state(data.filters?.country || '');
	let state_region = $state(data.filters?.state_region || '');
	let group_type_ids = $state((data.filters?.group_type_ids || []).slice());
	let skill_level_ids = $state((data.filters?.skill_level_ids || []).slice());
	let audience_focus_ids = $state((data.filters?.audience_focus_ids || []).slice());
	let riding_discipline_ids = $state((data.filters?.riding_discipline_ids || []).slice());

	// Advanced filters collapse state
	let showAdvanced = $state(false);

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
			// multi-select params: clear then append current values
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

	// Deterministic chip color per group type name using Tailwind palettes (10 options)
	const filledClasses = [
		'chip text-xs border border-red-600 bg-red-600 text-white',
		'chip text-xs border border-orange-600 bg-orange-600 text-white',
		'chip text-xs border border-amber-600 bg-amber-600 text-black',
		'chip text-xs border border-lime-600 bg-lime-600 text-black',
		'chip text-xs border border-green-600 bg-green-600 text-white',
		'chip text-xs border border-teal-600 bg-teal-600 text-white',
		'chip text-xs border border-cyan-600 bg-cyan-600 text-black',
		'chip text-xs border border-sky-600 bg-sky-600 text-white',
		'chip text-xs border border-blue-600 bg-blue-600 text-white',
		'chip text-xs border border-indigo-600 bg-indigo-600 text-white'
	];
	const outlinedClasses = [
		'chip text-xs border border-red-500 bg-red-500/10 text-red-300',
		'chip text-xs border border-orange-500 bg-orange-500/10 text-orange-300',
		'chip text-xs border border-amber-500 bg-amber-500/10 text-amber-700',
		'chip text-xs border border-lime-500 bg-lime-500/10 text-lime-700',
		'chip text-xs border border-green-500 bg-green-500/10 text-green-300',
		'chip text-xs border border-teal-500 bg-teal-500/10 text-teal-300',
		'chip text-xs border border-cyan-500 bg-cyan-500/10 text-cyan-700',
		'chip text-xs border border-sky-500 bg-sky-500/10 text-sky-300',
		'chip text-xs border border-blue-500 bg-blue-500/10 text-blue-300',
		'chip text-xs border border-indigo-500 bg-indigo-500/10 text-indigo-300'
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

	// Country -> State/Region mapping (partial starter)
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
			// Default view (continental US)
			map.setView([37.8, -96], 4);
		}
	}

	$effect(() => {
		// Rerun when the list of groups changes (via filters)
		void data.groups; // dependency hint
		updateMarkers();
	});
</script>

<div class="mx-auto w-full max-w-5xl space-y-6">
	<header class="space-y-2">
		<div class="flex items-center justify-center gap-3">
			<h1 class="m-0 text-center text-3xl font-bold">Cycling Groups</h1>
			<a
				href="/groups/new"
				class="btn btn-sm preset-outlined-secondary-500 flex items-center gap-2 font-bold"
			>
				<IconPlus class="h-4 w-4" />
				<span>Add Group</span>
			</a>
		</div>
		<p class="text-surface-400 text-center">Browse local clubs, teams, and advocacy orgs.</p>
	</header>

	<section class="card border-primary-300 bg-surface-950 card-hover border p-4">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-4">
			<div class="flex flex-col md:col-span-2">
				<label class="label" for="q">Search</label>
				<input
					id="q"
					class="input bg-primary-950/30"
					bind:value={q}
					placeholder="Name, city, description"
					oninput={scheduleApply}
				/>
			</div>
			<div class="flex flex-col">
				<label class="label" for="country">Country</label>
				<select
					id="country"
					class="select bg-primary-950/30"
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
			<div class="flex flex-col">
				<label class="label" for="state_region">State/Region</label>
				{#if hasStateList}
					<select
						id="state_region"
						class="select bg-primary-950/30"
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
						class="input bg-primary-950/30"
						bind:value={state_region}
						oninput={scheduleApply}
					/>
				{/if}
			</div>
			<div class="md:col-span-4">
				<div class="label mb-1">Group Type</div>
				<div class="flex flex-wrap gap-2">
					<!-- 'All' option clears type filter -->
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

			<!-- Advanced filters toggle -->
			<div class="flex items-center justify-between gap-2 md:col-span-4">
				<button
					type="button"
					class="btn btn-sm preset-outlined-surface-500"
					onclick={() => (showAdvanced = !showAdvanced)}
					aria-expanded={showAdvanced}
				>
					{showAdvanced ? 'Hide' : 'Show'} Advanced Filters
				</button>
				<button type="button" class="btn btn-sm preset-tonal-error" onclick={clearAll}>
					Clear All
				</button>
			</div>

			{#if showAdvanced}
				<div class="md:col-span-4" in:slide={{ duration: 180 }} out:fade={{ duration: 120 }}>
					<div class="label mb-1">Skill Levels</div>
					<div class="flex flex-wrap gap-2">
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
				<div class="md:col-span-4" in:slide={{ duration: 180 }} out:fade={{ duration: 120 }}>
					<div class="label mb-1">Audience Focus</div>
					<div class="flex flex-wrap gap-2">
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
				<div class="md:col-span-4" in:slide={{ duration: 180 }} out:fade={{ duration: 120 }}>
					<div class="label mb-1">Riding Disciplines</div>
					<div class="flex flex-wrap gap-2">
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
			{/if}
		</div>
	</section>

	<section class="space-y-3">
		{#if data.error}
			<p class="text-error-400">{data.error}</p>
		{/if}
		<!-- Map of filtered groups -->
		<div bind:this={mapEl} class="h-[420px] w-full overflow-hidden rounded-md"></div>
		{#if !data.groups?.length}
			<p class="text-surface-400" in:fade={{ duration: 120 }} out:fade={{ duration: 120 }}>
				No groups found.
			</p>
		{:else}
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				{#each data.groups as g (g.id)}
					<a
						href={`/groups/${g.slug}`}
						class="card group border-surface-300 bg-surface-900 card-hover block overflow-hidden border"
						in:fade={{ duration: 120 }}
						out:fade={{ duration: 120 }}
						animate:flip
					>
						<!-- Cover area with gradient and bottom overlay badge -->
						<div
							class="from-primary-800/60 to-primary-600/40 relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-r"
						>
							{#if g.cover_photo_url}
								<img
									src={g.cover_photo_url}
									alt="{g.name} cover"
									loading="lazy"
									class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
								/>
							{/if}
							<!-- Top-right chip rail for up to 2 group types -->
							{#if (data.group_types_map?.[g.id] || []).length}
								<div class="absolute top-2 right-2 flex max-w-[70%] flex-wrap justify-end gap-1">
									{#each (data.group_types_map[g.id] || []).slice(0, 2) as t}
										<span class={chipFilled(t)}>{t}</span>
									{/each}
								</div>
							{/if}
							<div class="absolute inset-x-0 bottom-0">
								<div
									class="bg-surface-950/60 flex items-center gap-2 rounded-md p-2 backdrop-blur-xs"
								>
									{#if g.logo_url}
										<img
											src={g.logo_url}
											alt="{g.name} logo"
											loading="lazy"
											class="h-20 w-20 rounded-md object-cover"
										/>
									{/if}
									<div class="min-w-0">
										<h3 class="truncate !text-left text-base font-bold text-white">{g.name}</h3>
										<p class="!m-0 truncate text-[11px] text-white/90">
											{#if g.city}{g.city},
											{/if}
											{g.state_region} · {g.country}
										</p>
										{#if g.tagline}
											<p class="line-clamp-1 hidden text-white/80 md:block">
												{g.tagline}
											</p>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
