<script>
	let { data } = $props();
	import { goto } from '$app/navigation';
	import DirectoryMapExplorer from '#lib/components/map/DirectoryMapExplorer.svelte';
	import { isValidLatLng } from '#lib/map/leaflet';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMaximize2 from '@lucide/svelte/icons/maximize-2';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconLoader2 from '@lucide/svelte/icons/loader-circle';
	import { fade, slide } from 'svelte/transition';
	import { navigating, page as appPage } from '$app/state';
	import { optimizedImageUrl, watchImageError } from '#lib/media/optimized';

	let failedImageUrls = $state({});

	function markImageFailed(url) {
		if (!url || failedImageUrls[url]) return;
		failedImageUrls = { ...failedImageUrls, [url]: true };
	}

	function getInitialFilters() {
		return data.filters ?? {};
	}
	const initialFilters = getInitialFilters();
	const authRequired = $derived(
		appPage.url.searchParams.get('auth') === 'required' && !data?.user?.id
	);
	const heroGroup = $derived((data.groups ?? []).find((group) => group.cover_photo_url) ?? null);
	const rawHeroImage = $derived(
		heroGroup?.cover_photo_url
			? optimizedImageUrl(heroGroup.cover_photo_url, { width: 1200, height: 736, quality: 68 })
			: ''
	);
	const heroImage = $derived(rawHeroImage && !failedImageUrls[rawHeroImage] ? rawHeroImage : '');
	const regionCount = $derived(
		new Set((data.mapPoints || []).map((g) => g.state_region).filter(Boolean)).size || 0
	);

	let q = $state(initialFilters.q || '');
	let country = $state(initialFilters.country || '');
	let state_region = $state(initialFilters.state_region || '');
	let sort = $state(initialFilters.sort || 'name');
	let group_type_ids = $state((initialFilters.group_type_ids || []).slice());
	let skill_level_ids = $state((initialFilters.skill_level_ids || []).slice());
	let audience_focus_ids = $state((initialFilters.audience_focus_ids || []).slice());
	let riding_discipline_ids = $state((initialFilters.riding_discipline_ids || []).slice());
	let page = $state(initialFilters.page || 1);
	const limit = $derived(data.filters?.limit || 24);

	$effect(() => {
		const next = data.filters ?? {};
		q = next.q || '';
		country = next.country || '';
		state_region = next.state_region || '';
		sort = next.sort || 'name';
		group_type_ids = (next.group_type_ids || []).slice();
		skill_level_ids = (next.skill_level_ids || []).slice();
		audience_focus_ids = (next.audience_focus_ids || []).slice();
		riding_discipline_ids = (next.riding_discipline_ids || []).slice();
		page = next.page || 1;
	});

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
	function applyFilters(resetPage = true, options = {}) {
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

			if (options.sortOverride !== undefined) {
				if (options.sortOverride) p.set('sort', options.sortOverride);
				else p.delete('sort');
			} else if ((country || '').trim() || (state_region || '').trim()) {
				p.delete('sort');
			} else if (sort === 'name' && p.get('sort') === 'name') {
				p.set('sort', 'name');
			} else {
				p.delete('sort');
			}

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
			goto(target, /** @type {any} */ ({ replaceState: true, keepFocus: true, noScroll: true }));
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

	function setSortMode(nextSort) {
		if (nextSort === 'proximity') {
			country = '';
			state_region = '';
			sort = 'proximity';
			applyFilters(true, { sortOverride: '' });
			return;
		}
		sort = 'name';
		applyFilters(true, { sortOverride: 'name' });
	}

	function clearAll() {
		const shouldDisableProximity = Boolean(data.proximityActive || country || state_region);
		q = '';
		country = '';
		state_region = '';
		sort = 'name';
		group_type_ids = [];
		skill_level_ids = [];
		audience_focus_ids = [];
		riding_discipline_ids = [];
		applyFilters(true, { sortOverride: shouldDisableProximity ? 'name' : '' });
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
	const hasClearableScope = $derived(activeFilterCount > 0 || Boolean(data.proximityActive));
	const showSortControls = $derived(
		Boolean(data.proximityActive || appPage.url.searchParams.get('sort') === 'name')
	);

	function filterChipClass(active) {
		const base =
			'inline-flex items-center justify-center px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11';
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

	const groupMapItems = $derived(
		(data.mapPoints || [])
			.filter((g) => isValidLatLng(g?.latitude, g?.longitude))
			.map((g) => ({
				id: g.id ?? g.slug,
				lat: Number(g.latitude),
				lng: Number(g.longitude),
				title: g.name || 'Cycling group',
				subtitle: [g.city ? `${g.city}, ${g.state_region || ''}`.trim() : g.state_region, g.country]
					.filter(Boolean)
					.join(' · '),
				badge: (data.group_types_map?.[g.id] || [])[0] || '',
				href: `/groups/${g.slug}`,
				ctaLabel: 'View group'
			}))
	);

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

	function groupPlace(group) {
		return (
			[group?.city, group?.state_region].filter(Boolean).join(', ') ||
			group?.country ||
			'Location coming soon'
		);
	}
</script>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	{#if authRequired}
		<section
			class="bg-tertiary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-14"
		>
			<div>
				<p class="m-0 text-sm font-black tracking-wide uppercase">Sign in to continue</p>
				<p class="m-0 mt-1 text-sm font-medium">We'll return you to the page you requested.</p>
			</div>
			<button
				type="button"
				class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 px-5 py-3 text-xs font-black tracking-wide uppercase transition pointer-coarse:min-h-11"
				onclick={() => window.dispatchEvent(new Event('open-login'))}
			>
				Sign in
			</button>
		</section>
	{/if}
	<!-- HERO (toned-down secondary landing header) -->
	<section
		class="bg-surface-950 border-surface-800 border-b-2"
		aria-labelledby="groups-hero-heading"
	>
		<div class="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
			<div
				class="border-primary-500 flex flex-col justify-between gap-7 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
			>
				<div class="flex flex-col gap-3">
					<p
						class="text-primary-500 m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
						<span>Cycling communities</span>
					</p>

					<h1
						id="groups-hero-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
					>
						Find the people who make <span class="text-primary-500">riding better.</span>
					</h1>
					<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium sm:text-lg">
						Discover clubs, teams, and advocacy organizations that match where—and how—you ride.
					</p>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-6">
					<div class="flex flex-wrap gap-3">
						<a
							href="#group-list"
							class="group bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline pointer-coarse:min-h-11"
						>
							Explore groups
							<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
						</a>
						<a
							href="/groups/new"
							class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline pointer-coarse:min-h-11"
						>
							<IconPlus class="h-4 w-4" /> Start a group
						</a>
					</div>

					<dl
						class="border-surface-800 m-0 flex flex-wrap items-center gap-6 border-t pt-4 sm:border-t-0 sm:pt-0"
						aria-label="Directory statistics"
					>
						{#each [{ value: data.totalGroups || 0, label: 'Groups' }, { value: regionCount, label: 'Regions' }, { value: data.group_types?.length || 0, label: 'Types' }] as stat (stat.label)}
							<div class="border-surface-700 border-l-2 pl-3">
								<dd
									class="text-primary-500 m-0 text-2xl leading-none font-black italic tabular-nums sm:text-3xl"
								>
									{stat.value}
								</dd>
								<dt
									class="text-surface-400 mt-1 text-[0.68rem] font-bold tracking-[0.18em] uppercase"
								>
									{stat.label}
								</dt>
							</div>
						{/each}
					</dl>
				</div>
			</div>

			<div
				class="bg-surface-900 border-surface-800 relative hidden min-h-[16rem] border-l-2 lg:block"
			>
				<img
					src={heroImage || '/images/default-ride.webp'}
					alt={heroGroup ? heroGroup.name : 'Cyclists riding together'}
					class="absolute inset-0 h-full w-full object-cover opacity-85"
					width="1200"
					height="736"
					fetchpriority="high"
					use:watchImageError={() => {
						if (heroImage) markImageFailed(heroImage);
					}}
				/>
				<div class="bg-tertiary-500 absolute inset-y-0 left-0 w-2" aria-hidden="true"></div>

				{#if heroGroup}
					<a
						href={`/groups/${heroGroup.slug}`}
						class="group bg-surface-950/95 text-surface-50 hover:bg-surface-900 border-surface-800 absolute right-0 bottom-0 left-2 flex items-center justify-between gap-4 border-t-2 px-5 py-3.5 transition hover:no-underline"
					>
						<span class="min-w-0">
							<span
								class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.22em] uppercase"
							>
								Featured community
							</span>
							<span class="block truncate text-sm font-black sm:text-base">{heroGroup.name}</span>
							<span class="text-surface-300 block truncate text-xs">{groupPlace(heroGroup)}</span>
						</span>
						<IconArrowUpRight
							class="text-primary-500 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						/>
					</a>
				{/if}
			</div>
		</div>
	</section>

	<!-- DIRECTORY FILTERS (compact dark toolbar) -->
	<section
		class="bg-surface-900 text-surface-50 border-surface-800 border-b-2 px-6 py-6 sm:px-10 lg:px-14"
		aria-label="Directory filters"
	>
		<div class="flex flex-col gap-5">
			<div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
				<div class="border-surface-600 focus-within:border-primary-500 flex border-2">
					<input
						class="bg-surface-950 text-surface-50 placeholder:text-surface-400 min-w-0 flex-1 border-0 px-4 py-2.5 text-sm font-medium focus:outline-none pointer-coarse:min-h-11"
						aria-label="Search groups"
						bind:value={q}
						placeholder="Search by group name, city, or description…"
						oninput={handleSearchInput}
					/>
					<button
						type="button"
						class="bg-primary-500 text-surface-950 hover:bg-primary-400 flex shrink-0 cursor-pointer items-center justify-center px-4 transition pointer-coarse:min-h-11 pointer-coarse:min-w-11"
						onclick={handleSearchButtonClick}
						aria-label="Search groups"
						title="Search"
					>
						<IconSearch class="h-4 w-4" />
					</button>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<select
						class="bg-surface-950 text-surface-50 border-surface-700 focus:border-primary-500 border-2 px-3 py-2.5 text-xs font-bold uppercase focus:outline-none pointer-coarse:min-h-11"
						aria-label="Country"
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
						{#if country && !['US', 'CA', 'MX', 'GB', 'AU', 'NZ', 'OTHER'].includes(country)}
							<option value={country}>{country}</option>
						{/if}
						<option value="OTHER">Other</option>
					</select>

					{#if hasStateList}
						<select
							class="bg-surface-950 text-surface-50 border-surface-700 focus:border-primary-500 border-2 px-3 py-2.5 text-xs font-bold uppercase focus:outline-none pointer-coarse:min-h-11"
							aria-label="State or region"
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
							class="bg-surface-950 text-surface-50 placeholder:text-surface-400 border-surface-700 focus:border-primary-500 border-2 px-3 py-2.5 text-xs font-bold uppercase focus:outline-none pointer-coarse:min-h-11"
							aria-label="State or region"
							bind:value={state_region}
							oninput={scheduleApply}
							placeholder="State/Region"
						/>
					{/if}
				</div>

				{#if hasClearableScope}
					<button
						type="button"
						class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-2.5 text-xs font-black tracking-wide uppercase transition pointer-coarse:min-h-11"
						onclick={clearAll}
						in:fade={{ duration: 120 }}
					>
						{activeFilterCount > 0 ? `Clear (${activeFilterCount})` : 'Clear local sort'}
					</button>
				{/if}
			</div>

			{#if showSortControls}
				<div
					class="border-surface-800 bg-surface-950 flex flex-wrap items-center justify-between gap-3 border-2 px-4 py-2.5"
					role="group"
					aria-label="Directory sort order"
				>
					<span
						class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase"
					>
						<IconMapPin class="text-primary-500 h-3.5 w-3.5 shrink-0" />
						{#if data.proximityActive}
							Sorted near {data.proximityLabel || 'you'}
						{:else}
							Sorted alphabetically (A–Z)
						{/if}
					</span>

					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							aria-pressed={Boolean(data.proximityActive)}
							class="inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11 {data.proximityActive
								? 'bg-primary-500 text-surface-950 border-primary-500 border-2'
								: 'border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 border-2'}"
							onclick={() => setSortMode('proximity')}
						>
							{data.proximityLabel ? `Near ${data.proximityLabel}` : 'Near you'}
						</button>
						<button
							type="button"
							aria-pressed={!data.proximityActive}
							class="inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11 {!data.proximityActive
								? 'bg-primary-500 text-surface-950 border-primary-500 border-2'
								: 'border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 border-2'}"
							onclick={() => setSortMode('name')}
						>
							A–Z
						</button>
					</div>
				</div>
			{/if}

			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="text-surface-400 mr-1 flex items-center gap-1.5 text-xs font-bold tracking-[0.18em] uppercase"
					>
						<IconSlidersHorizontal class="h-3.5 w-3.5" />
						Type:
					</span>
					<button
						type="button"
						aria-pressed={group_type_ids.length === 0}
						class="inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11 {group_type_ids.length ===
						0
							? 'bg-primary-500 text-surface-950'
							: 'border-surface-700 bg-surface-950 text-surface-200 hover:border-primary-500 border'}"
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
							aria-pressed={group_type_ids.includes(t.id)}
							class="inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-xs font-black tracking-[0.14em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11 {group_type_ids.includes(
								t.id
							)
								? 'bg-primary-500 text-surface-950'
								: 'border-surface-700 bg-surface-950 text-surface-200 hover:border-primary-500 border'}"
							onclick={() => toggleType(t.id)}
						>
							{t.name}
						</button>
					{/each}
				</div>

				<button
					type="button"
					class="text-surface-300 hover:text-primary-500 inline-flex cursor-pointer items-center gap-2 py-1 text-xs font-black tracking-[0.18em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11"
					onclick={() => (showAdvanced = !showAdvanced)}
					aria-expanded={showAdvanced}
				>
					<span>
						More Filters
						{#if skill_level_ids.length + audience_focus_ids.length + riding_discipline_ids.length + Math.max(0, group_type_ids.length - 6) > 0}
							<span
								class="bg-tertiary-500 text-surface-950 ml-1 inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-[11px] font-black"
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
			</div>

			{#if showAdvanced}
				<div
					class="border-surface-800 flex flex-col gap-4 border-t pt-4"
					in:slide={{ duration: 180 }}
					out:fade={{ duration: 120 }}
				>
					{#if (data.group_types || []).length > 6}
						<div class="flex flex-col gap-2">
							<div class="text-surface-400 text-xs font-bold tracking-[0.2em] uppercase">
								More Types
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each (data.group_types || []).slice(6) as t (t.id)}
									<button
										type="button"
										aria-pressed={group_type_ids.includes(t.id)}
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
						<div class="text-surface-400 text-xs font-bold tracking-[0.2em] uppercase">
							Skill Levels
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each data.skill_levels || [] as t (t.id)}
								<button
									type="button"
									aria-pressed={skill_level_ids.includes(t.id)}
									class="{filterChipClass(
										skill_level_ids.includes(t.id)
									)} border-surface-700 border"
									onclick={() => toggleSkill(t.id)}>{t.name}</button
								>
							{/each}
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<div class="text-surface-400 text-xs font-bold tracking-[0.2em] uppercase">
							Audience Focus
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each data.audience_focuses || [] as t (t.id)}
								<button
									type="button"
									aria-pressed={audience_focus_ids.includes(t.id)}
									class="{filterChipClass(
										audience_focus_ids.includes(t.id)
									)} border-surface-700 border"
									onclick={() => toggleAudience(t.id)}>{t.name}</button
								>
							{/each}
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<div class="text-surface-400 text-xs font-bold tracking-[0.2em] uppercase">
							Riding Disciplines
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each data.riding_disciplines || [] as t (t.id)}
								<button
									type="button"
									aria-pressed={riding_discipline_ids.includes(t.id)}
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
	</section>

	<!-- RESULTS + MAP -->
	<section
		id="group-list"
		class="bg-surface-950 text-surface-50 px-6 py-8 sm:px-10 lg:px-14 lg:py-10"
		aria-labelledby="listings-heading"
	>
		{#if data.error}
			<div class="bg-tertiary-500 text-surface-950 mb-8 px-5 py-4">
				<p class="m-0 text-sm font-black uppercase">{data.error}</p>
			</div>
		{/if}

		<!-- Results toolbar -->
		<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-baseline gap-4">
				<h2
					id="listings-heading"
					class="text-surface-50! m-0 text-2xl leading-none font-black tracking-[-0.02em] uppercase italic sm:text-3xl"
				>
					Group listings
				</h2>
				<p class="text-surface-400 m-0 text-xs font-bold tracking-[0.15em] uppercase tabular-nums">
					{data.totalGroups ?? 0}
					{data.totalGroups === 1 ? 'group' : 'groups'}
				</p>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					aria-pressed={showMap}
					class="inline-flex min-h-9 cursor-pointer items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition pointer-coarse:min-h-11 {showMap
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-700 text-surface-200 hover:border-primary-500 hover:text-primary-500 border-2'}"
					onclick={() => (showMap = !showMap)}
				>
					<IconMapPin class="h-4 w-4" />
					{showMap ? 'Hide Map' : 'Show Map'}
				</button>
				{#if showMap}
					<button
						type="button"
						aria-haspopup="dialog"
						class="border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-9 cursor-pointer items-center gap-2 border-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition pointer-coarse:min-h-11"
						onclick={() => (showMapLightbox = true)}
					>
						<IconMaximize2 class="h-4 w-4" />
						Expand Map
					</button>
				{/if}
			</div>
		</div>

		<!-- Map -->
		{#if showMap}
			<div class="mb-8">
				<DirectoryMapExplorer
					regionLabel="Cycling group locations map"
					items={groupMapItems}
					itemNounSingular="group"
					itemNounPlural="groups"
					cluster
					expandable
					bind:expanded={showMapLightbox}
					expandedTitle="Expanded cycling group locations map"
					shellClass="border-surface-700 border-2"
					canvasClass="h-[380px] w-full"
				/>
			</div>
		{/if}

		<!-- Groups grid -->
		<div bind:this={groupCardsEl}>
			{#if !data.groups?.length}
				<!-- Empty state -->
				<div class="border-surface-800 flex flex-col gap-6 border-t-2 pt-10">
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
						{@const coverUrl = g.cover_photo_url
							? optimizedImageUrl(g.cover_photo_url, {
									width: 768,
									height: 576,
									quality: 64
								})
							: ''}
						{@const logoUrl = g.logo_url
							? optimizedImageUrl(g.logo_url, {
									width: 96,
									height: 96,
									quality: 64
								})
							: ''}
						<a
							href={`/groups/${g.slug}`}
							class="group border-surface-800 bg-surface-900/90 text-surface-50 hover:bg-surface-900 hover:border-primary-500 flex flex-col justify-between border-2 transition hover:no-underline"
						>
							<div>
								<!-- Cover image area -->
								<div
									class="bg-surface-800 border-surface-800 relative aspect-[16/9] w-full overflow-hidden border-b-2"
								>
									{#if coverUrl && !failedImageUrls[coverUrl]}
										<img
											src={coverUrl}
											alt="{g.name} cover"
											loading="lazy"
											class="absolute inset-0 h-full w-full object-cover"
											width="768"
											height="576"
											decoding="async"
											use:watchImageError={() => markImageFailed(coverUrl)}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center">
											<span
												class="text-surface-700 text-5xl leading-none font-black italic select-none"
												aria-hidden="true"
											>
												3FT
											</span>
										</div>
									{/if}

									<!-- Top-left index numeral -->
									<span
										class="bg-surface-950/90 text-tertiary-400 absolute top-0 left-0 px-2.5 py-1 text-xs font-black italic tabular-nums"
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
													class="bg-primary-500 text-surface-950 px-2 py-0.5 text-[0.65rem] font-black tracking-[0.14em] uppercase"
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
										class="bg-surface-50 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center p-1"
									>
										{#if logoUrl && !failedImageUrls[logoUrl]}
											<img
												src={logoUrl}
												alt="{g.name} logo"
												loading="lazy"
												class="h-full w-full object-contain"
												width="96"
												height="96"
												decoding="async"
												use:watchImageError={() => markImageFailed(logoUrl)}
											/>
										{:else}
											<IconUsers class="h-5 w-5" />
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<h3
											class="text-surface-50! group-hover:text-primary-500! m-0 line-clamp-2 text-lg leading-tight font-black uppercase transition"
										>
											{g.name}
										</h3>
										<p
											class="text-surface-400 m-0 mt-1 flex items-center gap-1 truncate text-xs font-bold tracking-[0.12em] uppercase"
										>
											<IconMapPin class="h-3.5 w-3.5 shrink-0" />
											{#if data.proximityActive && Number.isFinite(g.distance_miles)}
												<span class="text-primary-500">{Math.round(g.distance_miles)} mi</span>
												·
											{/if}
											{#if g.city}{g.city},{/if}
											{g.state_region}
											{#if g.state_region && g.country}
												·
											{/if}
											{g.country}
										</p>
										{#if g.tagline}
											<p class="text-surface-300 m-0 mt-2 line-clamp-2 text-sm leading-snug">
												{g.tagline}
											</p>
										{/if}
									</div>
								</div>
							</div>

							<div
								class="border-surface-800 text-surface-300 group-hover:text-primary-500 flex items-center justify-between border-t px-5 py-3 text-xs font-black tracking-[0.18em] uppercase transition"
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
					disabled={page <= 1 || Boolean(navigating)}
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
					disabled={page >= totalPages || Boolean(navigating)}
					onclick={() => setPage(page + 1)}
				>
					Next
				</button>
			</div>
		{/if}
	</section>
</div>
