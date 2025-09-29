<script>
	let { data } = $props();
	import IconLink from '@lucide/svelte/icons/link';
	import GroupHeroCard from '$lib/components/groups/GroupHeroCard.svelte';
	import {
		buildContactLinks,
		selectPrimaryCta,
		CTA_ICON_MAP,
		CONTACT_ICON_MAP
	} from '$lib/groups/contactLinks';
	import IconMountain from '@lucide/svelte/icons/mountain';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// UI state
	let showSticky = $state(false);
	let heroSentinel = $state(null);

	// Leaflet map (loaded client-side)
	let L;
	let mapEl = $state(null);
	let map;
	let marker;

	const hasCoords = Number.isFinite(data.group?.latitude) && Number.isFinite(data.group?.longitude);
	const lat = hasCoords ? Number(data.group.latitude) : undefined;
	const lng = hasCoords ? Number(data.group.longitude) : undefined;

	function ensureMap() {
		if (!L || !mapEl || map) return;
		const z = 12;
		map = L.map(mapEl).setView([lat, lng], z);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		marker = L.marker([lat, lng]).addTo(map);
	}

	onMount(async () => {
		if (!hasCoords) return;
		try {
			const mod = await import('leaflet');
			L = mod.default || mod;
			const { ensureLeafletDefaultIcon } = await import('$lib/map/leaflet');
			await ensureLeafletDefaultIcon(L);
		} catch (e) {
			console.error('Failed to load Leaflet', e);
			return;
		}
		// Defer to ensure the element is laid out
		requestAnimationFrame(() => ensureMap());
	});

	// Sticky subheader observer
	onMount(() => {
		if (!heroSentinel) return;
		const obs = new IntersectionObserver((entries) => {
			const e = entries[0];
			showSticky = !e.isIntersecting;
		});
		obs.observe(heroSentinel);
		return () => obs.disconnect();
	});

	// Do not auto-load Instagram embeds to respect content blockers; load on user action

	function pickNames(all, ids) {
		const set = new Set(ids || []);
		return (all || []).filter((x) => set.has(x.id)).map((x) => x.name);
	}

	const types = pickNames(data.group_types, data.selected?.group_type_ids);
	const audiences = pickNames(data.audience_focuses, data.selected?.audience_focus_ids);
	const disciplines = pickNames(data.riding_disciplines, data.selected?.riding_discipline_ids);
	const skills = pickNames(data.skill_levels, data.selected?.skill_level_ids);

	// Claim group support
	const hasOwner = (data.owners_count ?? 0) > 0;
	let claimOpen = $state(false);
	let claimEmail = $state('');
	let claimLoading = $state(false);
	let claimError = $state('');
	let claimSuccess = $state('');
	let claimEmailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(claimEmail));

	async function claimGroup() {
		claimError = '';
		try {
			const res = await fetch(`/api/groups/${data.group.slug}/claim`, { method: 'POST' });
			if (res.status === 401) {
				claimOpen = true; // prompt login/register
				return;
			}
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Unable to claim group');
			}
			window.location.href = `/groups/${data.group.slug}/edit`;
		} catch (e) {
			claimError = e.message;
		}
	}

	async function sendClaimLogin(e) {
		e?.preventDefault?.();
		claimError = '';
		claimSuccess = '';
		if (!claimEmailValid) {
			claimError = 'Enter a valid email address.';
			return;
		}
		claimLoading = true;
		try {
			const url = new URL(window.location.href);
			url.searchParams.set('auto_claim_group', data.group.slug);
			const rt = `${url.pathname}${url.search}${url.hash}`;
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: claimEmail, createProfile: true, returnTo: rt })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send magic link');
			}
			claimSuccess = `We sent a login link to ${claimEmail}. After logging in, you'll be directed to the edit page for this group.`;
		} catch (err) {
			claimError = err.message || 'Login failed.';
		} finally {
			claimLoading = false;
		}
	}

	const contactLinks = $derived(buildContactLinks(data.group));

	let aboutExpanded = $state(false);

	const primaryCta = $derived(selectPrimaryCta(data.group, contactLinks));
	const ctaIcons = CTA_ICON_MAP;
	const contactIconByKey = CONTACT_ICON_MAP;

	const upcomingVolunteerEvents = $derived(
		Array.isArray(data?.volunteer_events) ? data.volunteer_events : []
	);

	function parseVolunteerDate(value) {
		if (!value) return null;
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	const volunteerDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const volunteerTimeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function volunteerEventDateRange(event) {
		const start = parseVolunteerDate(event?.event_start);
		const end = parseVolunteerDate(event?.event_end);
		if (!start) return 'Date to be announced';
		if (!end || end.getTime() === start.getTime() || start.toDateString() === end.toDateString()) {
			return volunteerDateFormatter.format(start);
		}
		return `${volunteerDateFormatter.format(start)} → ${volunteerDateFormatter.format(end)}`;
	}

	function volunteerEventTimeRange(event) {
		const start = parseVolunteerDate(event?.event_start);
		const end = parseVolunteerDate(event?.event_end);
		if (!start) return '';
		if (!end || end.getTime() === start.getTime()) {
			return volunteerTimeFormatter.format(start);
		}
		const sameDay = start.toDateString() === end.toDateString();
		if (sameDay) {
			return `${volunteerTimeFormatter.format(start)} – ${volunteerTimeFormatter.format(end)}`;
		}
		return `${volunteerTimeFormatter.format(start)} → ${volunteerTimeFormatter.format(end)}`;
	}

	function volunteerEventLocation(event) {
		if (event?.location_name) return event.location_name;
		if (event?.location_address) return event.location_address;
		const parts = [data.group?.city, data.group?.state_region, data.group?.country]
			.map((part) => (part || '').trim())
			.filter(Boolean);
		return parts.length ? parts.join(', ') : 'Location details coming soon';
	}

	// Notices via query params
	const authFlag = $derived(($page && $page.url && $page.url.searchParams.get('auth')) || '');
</script>

<div class="mx-auto w-full max-w-4xl space-y-6">
	<GroupHeroCard group={data.group} canEdit={data.can_edit} {contactLinks} {primaryCta} />

	{#if authFlag === 'required' || authFlag === 'forbidden'}
		<section
			class="mx-auto max-w-3xl rounded-xl border p-4 {authFlag === 'required'
				? 'border-warning-600/40 bg-warning-900/20'
				: 'border-error-600/40 bg-error-900/20'}"
		>
			{#if authFlag === 'required'}
				<div class="text-sm">
					<strong>Please log in to edit this group.</strong>
					<div class="text-surface-300">
						Use the “Log in / Register” button in the header, then try again.
					</div>
				</div>
			{:else}
				<div class="text-sm">
					<strong>You don’t have permission to edit this group.</strong>
					{#if (data.owners_count ?? 0) === 0}
						<div class="text-surface-300">
							If you represent this group, claim it below to become an owner.
						</div>
					{:else}
						<div class="text-surface-300">Ask an existing owner to add you as an owner.</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	{#if !hasOwner}
		<section
			class="border-warning-600/40 bg-warning-900/20 mx-auto max-w-3xl rounded-xl border p-4"
		>
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div class="min-w-0">
					<div class="text-lg font-semibold">This group hasn’t been claimed yet</div>
					<p class="text-surface-300 text-sm">
						If you represent this group, claim it to manage details, photos and more.
					</p>
				</div>
				{#if data.user}
					<button class="btn preset-filled-warning-500 shrink-0" onclick={claimGroup}
						>Claim Group</button
					>
				{:else}
					<button class="btn preset-filled-warning-500 shrink-0" onclick={() => (claimOpen = true)}
						>Claim Group</button
					>
				{/if}
			</div>
			{#if claimOpen && !data.user}
				<form
					class="border-surface-700 bg-surface-900 mt-4 rounded-md border p-3"
					onsubmit={sendClaimLogin}
				>
					<label for="claim-email" class="text-surface-300 mb-1 block text-xs"
						>Log in / Register to continue</label
					>
					<input
						id="claim-email"
						type="email"
						bind:value={claimEmail}
						placeholder="you@example.com"
						class="input w-full"
						required
					/>
					{#if claimError}
						<div class="mt-2 text-xs text-red-400">{claimError}</div>
					{/if}
					{#if claimSuccess}
						<div class="mt-2 text-xs text-green-400">{claimSuccess}</div>
					{/if}
					<button
						type="submit"
						class="btn preset-filled-primary-500 mt-3 w-full {claimLoading
							? 'animate-pulse'
							: ''} {!claimEmailValid || claimLoading ? 'cursor-not-allowed opacity-50' : ''}"
						disabled={!claimEmailValid || claimLoading}>Send Magic Link</button
					>
				</form>
			{/if}
		</section>
	{/if}

	<!-- Sticky subheader (appears after hero scrolls out) -->
	{#if showSticky}
		<div class="border-surface-700 bg-surface-900/80 sticky top-0 z-40 border-b backdrop-blur">
			<div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-2">
				<div class="flex min-w-0 items-center gap-3">
					{#if data.group?.logo_url}
						<img src={data.group.logo_url} alt="{data.group.name} logo" class="h-8 w-8 rounded" />
					{/if}
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold">{data.group?.name}</div>
						<div class="text-surface-300 truncate text-xs">
							{#if data.group?.city}{data.group.city},
							{/if}{data.group?.state_region} · {data.group?.country}
						</div>
					</div>
				</div>
				{#if data.is_owner}
					<a href={`/groups/${data.group.slug}/edit`} class="chip preset-filled-primary-500"
						>Edit Group</a
					>
				{:else if primaryCta}
					<a
						href={primaryCta.href}
						target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
						rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
							? undefined
							: 'noopener noreferrer'}
						class="chip preset-filled-primary-500 flex items-center gap-2"
					>
						{#if primaryCta.key !== 'custom'}
							{@const IconComp3 = ctaIcons[primaryCta.key] || IconLink}
							<IconComp3 class="h-4 w-4" />
						{/if}
						<span>{primaryCta.label}</span>
					</a>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Sentinel for sticky observer -->
	<div bind:this={heroSentinel}></div>

	<!-- Identity card -->
	<section class="">
		<div class="border-surface-300 bg-surface-950/90 mx-auto rounded-xl border p-4">
			<!-- Top row: type chip rail + compact contact icons -->
			<div class="flex items-start justify-between gap-3">
				{#if types.length}
					<div class="flex w-full gap-2 overflow-x-auto pr-1 whitespace-nowrap">
						{#each types as t}
							<button type="button" class="chip preset-tonal-primary shrink-0">{t}</button>
						{/each}
					</div>
				{/if}
				<div class="ml-auto flex shrink-0 items-center gap-2">
					{#if contactLinks.length}
						<div class="ml-auto flex shrink-0 items-center gap-2">
							{#each contactLinks.slice(0, 6) as c}
								<a
									href={c.href}
									title={c.key}
									target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
									rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
									class="rounded-md p-2 text-white/90 hover:bg-white/10 hover:text-white"
								>
									<svelte:component
										this={contactIconByKey[c.key] || IconLink}
										class="h-5 w-5"
										className="h-5 w-5"
									/>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- About preview -->
			{#if data.group?.description}
				<div class="mt-3">
					<div
						class={'text-surface-200 whitespace-pre-wrap ' +
							(aboutExpanded ? '' : 'max-h-24 overflow-hidden')}
					>
						{data.group.description}
					</div>
					{#if data.group.description?.length > 220}
						<button
							type="button"
							class="text-primary-300 hover:text-primary-200 mt-2 text-sm"
							onclick={() => (aboutExpanded = !aboutExpanded)}
						>
							{aboutExpanded ? 'Show less' : 'Read more'}
						</button>
					{/if}
				</div>
			{/if}
			<!-- Info belt: audience and discipline chip rails -->
			<div class="mt-3 space-y-1">
				{#if audiences.length || disciplines.length}
					{#if audiences.length}
						<div class="flex items-center gap-2">
							<div class="text-surface-300 mr-2 text-sm">Audience</div>
							<div class="flex w-full gap-2 overflow-x-auto whitespace-nowrap">
								{#each audiences as a}
									<button type="button" class="chip preset-tonal-secondary shrink-0">{a}</button>
								{/each}
							</div>
						</div>
					{/if}
					{#if disciplines.length}
						<div class="flex items-center gap-2 py-2">
							<div class="text-surface-300 min-w-24 text-sm">Discipline</div>
							<div class="flex w-full gap-2 overflow-x-auto whitespace-nowrap">
								{#each disciplines as d}
									<button type="button" class="chip preset-tonal-surface shrink-0">{d}</button>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</section>

	{#if upcomingVolunteerEvents.length}
		<section class="card border-surface-300 bg-surface-950 card-hover space-y-4 border p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="text-surface-100 !text-left text-lg font-semibold">
						Upcoming Volunteer Opportunities
					</h2>
					<p class="text-surface-400 text-sm">
						Support {data.group?.name} by lending a hand at an upcoming event.
					</p>
				</div>
			</div>
			<ul class="space-y-4">
				{#each upcomingVolunteerEvents as event}
					<li class="bg-surface-900/60 border-surface-500/20 rounded-xl border p-4">
						<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
							<div class="space-y-3">
								<div class="space-y-1">
									<a
										href={`/volunteer/${event.slug}`}
										class="text-secondary-200 hover:text-secondary-100 text-lg font-semibold"
									>
										{event.title}
									</a>
									<div
										class="text-surface-300 max-w-2xl truncate overflow-hidden text-sm leading-relaxed text-ellipsis whitespace-nowrap"
									>
										{#if event.summary}
											{event.summary}
										{:else}
											Details coming soon.
										{/if}
									</div>
								</div>
								<div class="space-y-1 text-sm">
									<div class="text-surface-100 font-medium">
										<strong class="mr-4">{volunteerEventDateRange(event)}</strong>
										{volunteerEventTimeRange(event)}
									</div>
								</div>
							</div>
							<div class="flex flex-wrap items-center gap-2 md:justify-end">
								{#if event.can_manage}
									<a
										href={`/volunteer/${event.slug}/edit`}
										class="btn btn-sm preset-outlined-secondary-500 whitespace-nowrap"
									>
										Edit
									</a>
									<a
										href={`/volunteer/${event.slug}/manage`}
										class="btn btn-sm preset-tonal-tertiary whitespace-nowrap"
									>
										Manage
									</a>
								{:else}
									<a
										href={`/volunteer/${event.slug}`}
										class="btn preset-outlined-primary-500 whitespace-nowrap"
									>
										Volunteer
									</a>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
			<div class="flex w-full justify-end">
				<a
					href={`/volunteer/groups/${data.group.slug}`}
					class="btn preset-filled-tertiary-500 font-bold whitespace-nowrap"
				>
					All Volunteer Events →
				</a>
			</div>
		</section>
	{/if}

	<!-- Contact next + categories -->
	<!-- Removed bulky contact/categories card to declutter header. -->

	<!-- Additional details -->
	{#if data.group?.membership_info || data.group?.service_area_description || data.group?.activity_frequency || data.group?.typical_activity_day_time || data.group?.preferred_contact_method_instructions || data.group?.specific_meeting_point_address || (Number.isFinite(data.group?.latitude) && Number.isFinite(data.group?.longitude)) || data.group?.zip_code || skills.length || data.group?.how_to_join_instructions}
		<section class="card border-surface-300 bg-surface-950 card-hover space-y-4 border p-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				{#if data.group?.membership_info}
					<div>
						<div class="label">Membership Info</div>
						<p class="text-surface-200 whitespace-pre-wrap">{data.group.membership_info}</p>
					</div>
				{/if}
				{#if data.group?.how_to_join_instructions}
					<div>
						<div class="label">How to Join</div>
						<p class="text-surface-200 whitespace-pre-wrap">
							{data.group.how_to_join_instructions}
						</p>
					</div>
				{/if}
				{#if data.group?.zip_code}
					<div>
						<div class="label">ZIP / Postal Code</div>
						<p class="text-surface-200">{data.group.zip_code}</p>
					</div>
				{/if}
				{#if data.group?.preferred_contact_method_instructions}
					<div>
						<div class="label">Preferred Contact Method</div>
						<p class="text-surface-200">{data.group.preferred_contact_method_instructions}</p>
					</div>
				{/if}
				{#if skills.length}
					<div>
						<div class="label">Skill Levels</div>
						<p class="text-surface-200">{skills.join(', ')}</p>
					</div>
				{/if}
			</div>
			{#if data.group?.activity_frequency || data.group?.typical_activity_day_time || data.group?.specific_meeting_point_address}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					{#if data.group?.activity_frequency}
						<div>
							<div class="label">Activity Frequency</div>
							<p class="text-surface-200">{data.group.activity_frequency}</p>
						</div>
					{/if}
					{#if data.group?.typical_activity_day_time}
						<div>
							<div class="label">Typical Day/Time</div>
							<p class="text-surface-200">{data.group.typical_activity_day_time}</p>
						</div>
					{/if}
					{#if data.group?.specific_meeting_point_address}
						<div>
							<div class="label">Meeting Point</div>
							<p class="text-surface-200">{data.group.specific_meeting_point_address}</p>
						</div>
					{/if}
				</div>
			{/if}
			{#if data.group?.service_area_description || hasCoords}
				<div>
					<div class="label">Service Area</div>
					{#if data.group?.service_area_description}
						<p class="text-surface-200 whitespace-pre-wrap">
							{data.group.service_area_description}
						</p>
					{/if}
					{#if hasCoords}
						<div class="border-surface-700/50 mt-3 overflow-hidden rounded-md border">
							<!-- Leaflet map container -->
							<div bind:this={mapEl} class="h-64 w-full"></div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Instagram gallery/embeds removed per request -->
</div>
