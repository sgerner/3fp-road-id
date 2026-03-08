<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import IconBadgeInfo from '@lucide/svelte/icons/badge-info';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconRoute from '@lucide/svelte/icons/route';
	import IconShieldQuestion from '@lucide/svelte/icons/shield-question';
	import { ensureLeafletDefaultIcon } from '$lib/map/leaflet';
	import { escapeHtml } from '$lib/markdown';
	import 'leaflet/dist/leaflet.css';

	const { data } = $props();
	const ride = $derived.by(() => data?.ride ?? null);
	const activity = $derived.by(() => ride?.activity ?? null);
	const rideDetails = $derived.by(() => ride?.rideDetails ?? {});
	const rideImages = $derived.by(() => rideDetails?.image_urls ?? []);
	const leadRideImage = $derived.by(() => rideImages[0] ?? null);
	const occurrences = $derived.by(() => ride?.occurrences ?? []);
	let rsvpLoadingId = $state('');
	let rsvpError = $state('');
	let claimLoading = $state(false);
	let claimError = $state('');
	let selectedOccurrenceId = $state(null);
	let mapEl = $state(null);
	let map;
	let marker;

	const canManage = $derived(Boolean(data?.canManage));
	const currentUser = $derived(data?.currentUser ?? null);
	const selectedOccurrence = $derived(
		occurrences.find((occurrence) => String(occurrence.id) === String(selectedOccurrenceId)) ??
			occurrences[0] ??
			null
	);
	const participantListVisible = $derived(
		canManage || rideDetails?.participant_visibility !== 'private'
	);
	const scheduledOccurrences = $derived(
		occurrences.filter((occurrence) => occurrence.status === 'scheduled')
	);
	const visibleOccurrences = $derived(scheduledOccurrences.slice(0, 5));
	const canClaim = $derived(
		Boolean(currentUser?.id) && !activity?.host_user_id && !activity?.host_group_id
	);
	const claimLabel = $derived(ride?.recurrenceRule ? 'Claim Ride Series' : 'Claim Ride');
	const urlPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
	const maxLinkLabelLength = 88;

	function splitTrailingPunctuation(url) {
		let value = url;
		let trailing = '';
		while (/[.,!?;:]$/.test(value)) {
			trailing = value.slice(-1) + trailing;
			value = value.slice(0, -1);
		}
		if (value.endsWith(')') && !value.includes('(')) {
			trailing = ')' + trailing;
			value = value.slice(0, -1);
		}
		return { value, trailing };
	}

	function truncateMiddle(text, max = maxLinkLabelLength) {
		if (text.length <= max) return text;
		const head = Math.max(12, Math.floor((max - 1) * 0.68));
		const tail = Math.max(8, max - head - 1);
		return `${text.slice(0, head)}…${text.slice(-tail)}`;
	}

	function formatLinkLabel(href, rawValue) {
		try {
			const url = new URL(href);
			const host = url.hostname.replace(/^www\./i, '');
			const path = url.pathname === '/' ? '' : url.pathname;
			const query = url.search ? url.search : '';
			const hash = url.hash ? url.hash : '';
			const full = `${host}${path}${query}${hash}`;
			if (full.length <= maxLinkLabelLength) return full;
			if (query) {
				const base = `${host}${path}`;
				if (base.length <= maxLinkLabelLength - 6) {
					return `${base}${base.includes('?') ? '&' : '?'}…`;
				}
			}
			return truncateMiddle(full);
		} catch {
			return truncateMiddle(rawValue.replace(/^https?:\/\//i, '').replace(/^www\./i, ''));
		}
	}

	function renderLinkifiedText(text) {
		const input = String(text ?? '').replace(/\r\n?/g, '\n');
		if (!input) return '';
		let output = '';
		let lastIndex = 0;
		for (const match of input.matchAll(urlPattern)) {
			const start = match.index ?? 0;
			const rawUrl = match[0] ?? '';
			const end = start + rawUrl.length;
			output += escapeHtml(input.slice(lastIndex, start));
			const { value, trailing } = splitTrailingPunctuation(rawUrl);
			if (value) {
				const href = value.startsWith('www.') ? `https://${value}` : value;
				const label = formatLinkLabel(href, value);
				output += `<a class="linkified-url" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
			}
			output += escapeHtml(trailing);
			lastIndex = end;
		}
		output += escapeHtml(input.slice(lastIndex));
		return output.replace(/\n/g, '<br />');
	}

	$effect(() => {
		if (selectedOccurrenceId || !occurrences.length) return;
		selectedOccurrenceId =
			occurrences.find((occurrence) => new Date(occurrence.starts_at) >= new Date())?.id ??
			occurrences[0]?.id ??
			null;
	});

	function occurrenceLabel(occurrence) {
		const start = new Date(occurrence.starts_at);
		const end = new Date(occurrence.ends_at);
		return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
	}

	function currentUserRsvp(occurrence) {
		if (!currentUser?.id) return null;
		return occurrence?.rsvps?.find((entry) => entry.userId === currentUser.id) ?? null;
	}

	async function submitRsvp(status) {
		if (!selectedOccurrence?.id) return;
		rsvpLoadingId = selectedOccurrence.id;
		rsvpError = '';
		try {
			const response = await fetch(`/api/rides/${activity.id}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					occurrenceId: selectedOccurrence.id,
					status
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to update RSVP.');
			await goto(`/ride/${activity.slug}`, { invalidateAll: true, replaceState: true });
		} catch (error) {
			rsvpError = error.message || 'Unable to update RSVP.';
		} finally {
			rsvpLoadingId = '';
		}
	}

	async function claimRide() {
		if (!activity?.slug) return;
		claimLoading = true;
		claimError = '';
		try {
			const response = await fetch(`/api/rides/${activity.slug}/claim`, {
				method: 'POST'
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to claim ride.');
			await goto(`/ride/${activity.slug}`, { invalidateAll: true, replaceState: true });
		} catch (error) {
			claimError = error.message || 'Unable to claim ride.';
		} finally {
			claimLoading = false;
		}
	}

	onMount(async () => {
		const latitude =
			selectedOccurrence?.start_latitude ??
			activity?.start_latitude ??
			activity?.startLatitude ??
			null;
		const longitude =
			selectedOccurrence?.start_longitude ??
			activity?.start_longitude ??
			activity?.startLongitude ??
			null;
		if (!mapEl || latitude == null || longitude == null) return;
		try {
			const L = await import('leaflet');
			await ensureLeafletDefaultIcon(L);
			map = L.map(mapEl).setView([Number(latitude), Number(longitude)], 13);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);
			marker = L.marker([Number(latitude), Number(longitude)]).addTo(map);
		} catch (error) {
			console.warn('Unable to render ride map', error);
		}

		return () => {
			map?.remove?.();
			map = null;
			marker = null;
		};
	});
</script>

<svelte:head>
	<title>{activity?.title || 'Ride'}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-8">
	<section
		class="hero-section relative overflow-hidden rounded-3xl"
		class:hero-section--cover={leadRideImage}
		style={leadRideImage ? `--hero-bg: url('${leadRideImage}')` : ''}
	>
		{#if leadRideImage}
			<div class="hero-cover-bg" aria-hidden="true"></div>
			<div class="hero-cover-overlay" aria-hidden="true"></div>
		{:else}
			<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-3" aria-hidden="true"></div>
		{/if}

		<div class="relative z-10 flex flex-col justify-end p-6 lg:min-h-[32rem] lg:p-12">
			<div class="max-w-3xl space-y-5">
				<div class="flex flex-wrap gap-2">
					{#each ride?.difficultyLevels ?? [] as level}
						<span class="chip preset-tonal-warning">{level.name}</span>
					{/each}
					{#each ride?.ridingDisciplines ?? [] as discipline}
						<span class="chip preset-tonal-success">{discipline.name}</span>
					{/each}
				</div>
				<h1 class="ride-headline text-4xl font-extrabold tracking-tight text-balance lg:text-6xl">
					{activity?.title}
				</h1>
				{#if activity?.summary}
					<p class="max-w-2xl text-base leading-relaxed opacity-85">
						{@html renderLinkifiedText(activity.summary)}
					</p>
				{/if}
				{#if selectedOccurrence}
					<p class="text-sm font-medium opacity-70">
						{activity?.start_location_name
							? `${activity.start_location_name} · `
							: ''}{occurrenceLabel(selectedOccurrence)}
					</p>
				{/if}
				<div class="flex flex-wrap gap-3 pt-1">
					{#if canManage}
						<a
							class="btn preset-outlined-primary-500 bg-surface-950-50/10 backdrop-blur-sm"
							href={`/ride/${activity.slug}/manage`}>Manage ride</a
						>
					{:else if canClaim}
						<button
							class="btn preset-filled-warning-500 shadow-md transition-transform hover:scale-105"
							onclick={claimRide}
							disabled={claimLoading}
						>
							{claimLoading ? 'Claiming...' : claimLabel}
						</button>
					{/if}
					{#if currentUser}
						<button
							class="btn preset-filled-primary-500 shadow-md transition-transform hover:scale-105"
							onclick={() =>
								submitRsvp(
									currentUserRsvp(selectedOccurrence)?.status === 'going' ? 'cancelled' : 'going'
								)}
							disabled={rsvpLoadingId === selectedOccurrence?.id}
						>
							{#if currentUserRsvp(selectedOccurrence)?.status === 'going'}
								Leave ride
							{:else}
								RSVP
							{/if}
						</button>
					{:else}
						<a
							class="btn preset-filled-primary-500 shadow-md transition-transform hover:scale-105"
							href="/ride/new">Log in to RSVP</a
						>
					{/if}
				</div>
			</div>
		</div>
		{#if rsvpError}
			<div class="card preset-tonal-error relative z-10 mx-6 mb-6 p-3 text-sm lg:mx-12">
				{rsvpError}
			</div>
		{/if}
		{#if claimError}
			<div class="card preset-tonal-error relative z-10 mx-6 mb-6 p-3 text-sm lg:mx-12">
				{claimError}
			</div>
		{/if}
	</section>

	{#if rideImages.length > 1}
		<section class="card preset-tonal-surface overflow-hidden p-5">
			<div class="mb-4 flex items-center justify-between gap-3">
				<div>
					<div class="text-sm tracking-[0.18em] uppercase opacity-60">Photos</div>
					<div class="mt-1 text-lg font-semibold">Route and ride vibe</div>
				</div>
				<div class="text-sm opacity-65">{rideImages.length} images</div>
			</div>
			<div class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div class="gallery-feature-frame">
					<img
						src={rideImages[1]}
						alt={`${activity?.title || 'Ride'} photo 2`}
						class="h-full w-full object-cover"
						loading="lazy"
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					{#each rideImages.slice(2) as imageUrl, index (imageUrl)}
						<div class="gallery-tile">
							<img
								src={imageUrl}
								alt={`${activity?.title || 'Ride'} photo ${index + 3}`}
								class="h-56 w-full object-cover"
								loading="lazy"
							/>
						</div>
					{/each}
				</div>
			</div>
			{#if rideImages.length === 2}
				<div class="mt-4 text-sm opacity-65">
					More ride photos will appear here as organizers add them.
				</div>
			{/if}
		</section>
	{/if}

	{#if !activity?.host_user_id && !activity?.host_group_id}
		<section class="card preset-tonal-warning p-5">
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div class="space-y-2">
					<div class="flex items-center gap-2 text-lg font-semibold">
						<IconShieldQuestion class="h-5 w-5" />
						This {ride?.recurrenceRule ? 'ride series is' : 'ride is'} currently unclaimed
					</div>
					<p class="text-sm opacity-80">
						The listing is public, but no host or host organization is attached yet. Claim it to
						manage updates, RSVPs, reminder emails, and rider communication.
					</p>
				</div>
				{#if canClaim}
					<button class="btn preset-filled-warning-500" onclick={claimRide} disabled={claimLoading}>
						{claimLoading ? 'Claiming...' : claimLabel}
					</button>
				{:else if !currentUser}
					<p class="text-sm font-medium opacity-80">Log in with the header action to claim it.</p>
				{/if}
			</div>
		</section>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
		<div class="space-y-6">
			<section class="card preset-tonal-surface p-5">
				<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<IconBadgeInfo class="h-5 w-5" />
					Hosting
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Organizer</div>
						<div class="mt-1 font-semibold">
							{#if activity?.host_group_id}
								Organization-hosted ride
							{:else if activity?.host_user_id}
								Hosted by a rider on 3FP
							{:else}
								No host attached yet
							{/if}
						</div>
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Participant list</div>
						<div class="mt-1 font-semibold">
							{rideDetails?.participant_visibility === 'private' ? 'Private to hosts' : 'Public'}
						</div>
					</div>
				</div>
			</section>

			<section class="card preset-tonal-surface p-5">
				<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<IconRoute class="h-5 w-5" />
					Ride Details
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Meet</div>
						<div class="mt-1 font-semibold">
							{@html renderLinkifiedText(activity?.start_location_name)}
						</div>
						{#if activity?.start_location_address}
							<div class="text-sm opacity-75">
								{@html renderLinkifiedText(activity.start_location_address)}
							</div>
						{/if}
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Finish</div>
						{#if rideDetails?.end_location_name}
							<div class="mt-1 font-semibold">
								{@html renderLinkifiedText(rideDetails.end_location_name)}
							</div>
						{:else}
							<div class="mt-1 font-semibold">Same as start or route-dependent</div>
						{/if}
						{#if rideDetails?.end_location_address}
							<div class="text-sm opacity-75">
								{@html renderLinkifiedText(rideDetails.end_location_address)}
							</div>
						{/if}
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Distance</div>
						<div class="mt-1 font-semibold">
							{rideDetails?.estimated_distance_miles
								? `${rideDetails.estimated_distance_miles} miles`
								: 'TBD'}
						</div>
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Duration</div>
						<div class="mt-1 font-semibold">
							{rideDetails?.estimated_duration_minutes
								? `${rideDetails.estimated_duration_minutes} min`
								: 'TBD'}
						</div>
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Elevation</div>
						<div class="mt-1 font-semibold">
							{rideDetails?.elevation_gain_feet ? `${rideDetails.elevation_gain_feet} ft` : 'TBD'}
						</div>
					</div>
					<div>
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Drop style</div>
						<div class="mt-1 font-semibold">
							{rideDetails?.is_no_drop ? 'No-drop' : 'Drop ride'}
						</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Pace</div>
						{#if rideDetails?.pace_notes}
							<div class="mt-1">{@html renderLinkifiedText(rideDetails.pace_notes)}</div>
						{:else}
							<div class="mt-1">Not specified</div>
						{/if}
					</div>
					<div class="md:col-span-2">
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Surface</div>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each rideDetails?.surface_types ?? [] as surface}
								<span class="chip preset-tonal-surface">{surface}</span>
							{/each}
						</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-sm tracking-[0.18em] uppercase opacity-60">Bike suitability</div>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each rideDetails?.bike_suitability ?? [] as bike}
								<span class="chip preset-tonal-secondary">{bike}</span>
							{/each}
						</div>
					</div>
					{#if rideDetails?.accessibility_notes}
						<div class="md:col-span-2">
							<div class="text-sm tracking-[0.18em] uppercase opacity-60">Accessibility</div>
							<div class="mt-1">{@html renderLinkifiedText(rideDetails.accessibility_notes)}</div>
						</div>
					{/if}
					{#if activity?.description}
						<div class="md:col-span-2">
							<div class="text-sm tracking-[0.18em] uppercase opacity-60">About this ride</div>
							<div class="mt-1 leading-7">{@html renderLinkifiedText(activity.description)}</div>
						</div>
					{/if}
				</div>
			</section>

			<section class="card preset-tonal-surface p-5">
				<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<IconCalendarClock class="h-5 w-5" />
					Upcoming Occurrences
				</div>
				<div class="space-y-3">
					{#each visibleOccurrences as occurrence}
						<button
							type="button"
							class={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${String(selectedOccurrenceId) === String(occurrence.id) ? 'border-primary-500 bg-primary-500/8' : 'border-surface-500/20'}`}
							onclick={() => (selectedOccurrenceId = occurrence.id)}
						>
							<div>
								<div class="font-semibold">{occurrenceLabel(occurrence)}</div>
								<div class="text-sm opacity-75">
									{@html
										renderLinkifiedText(
											occurrence.start_location_name || activity?.start_location_name
										)}
								</div>
							</div>
							{#if currentUserRsvp(occurrence)?.status === 'going'}
								<span class="chip preset-tonal-success">You're in</span>
							{/if}
						</button>
					{/each}
					{#if scheduledOccurrences.length > 5}
						<p class="text-sm opacity-70">Showing the next 5 upcoming occurrences.</p>
					{/if}
				</div>
			</section>
		</div>

		<aside class="space-y-6">
			<section class="card preset-tonal-surface p-5">
				<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<IconMapPin class="h-5 w-5" />
					Map
				</div>
				{#if activity?.start_latitude != null && activity?.start_longitude != null}
					<div class="border-surface-500/20 h-72 overflow-hidden rounded-xl border">
						<div bind:this={mapEl} class="h-full w-full"></div>
					</div>
				{:else}
					<p class="text-sm opacity-70">
						Map pin will appear when the start location has coordinates.
					</p>
				{/if}
			</section>

			<section class="card preset-tonal-surface p-5">
				<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<IconUsers class="h-5 w-5" />
					Participants
				</div>
				{#if participantListVisible}
					<div class="space-y-3">
						{#each selectedOccurrence?.rsvps?.filter((entry) => entry.status === 'going') ?? [] as rsvp}
							<div class="border-surface-500/20 rounded-xl border p-3">
								<div class="font-medium">{rsvp.participantName}</div>
								{#if canManage}
									<div class="text-sm opacity-70">{rsvp.participantEmail}</div>
								{/if}
							</div>
						{/each}
						{#if !selectedOccurrence?.rsvps?.filter((entry) => entry.status === 'going')?.length}
							<p class="text-sm opacity-70">No RSVPs yet for the selected occurrence.</p>
						{/if}
					</div>
				{:else}
					<p class="text-sm opacity-70">The organizer has kept the participant list private.</p>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	/* ── Hero base (no image) ─────────────────────── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	/* ── Hero with cover image ────────────────────── */
	.hero-section--cover {
		border: none;
		background: var(--color-surface-950);
	}

	.hero-cover-bg {
		position: absolute;
		inset: 0;
		background-image: var(--hero-bg);
		background-size: cover;
		background-position: center;
		transform: scale(1.04);
		filter: brightness(0.72) saturate(1.1);
		transition: transform 0.6s ease;
		pointer-events: none;
	}

	.hero-section--cover:hover .hero-cover-bg {
		transform: scale(1.06);
	}

	.hero-cover-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgba(6, 6, 14, 0.88) 0%,
			rgba(6, 6, 14, 0.45) 50%,
			rgba(6, 6, 14, 0.18) 100%
		);
		pointer-events: none;
	}

	/* ── Orb animations (no-image fallback only) ──── */
	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.hero-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}

	.hero-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}

	.hero-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}

	@keyframes orb-drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		100% {
			transform: translate(4%, 6%) scale(1.08);
		}
	}

	/* ── Typography ───────────────────────────────── */
	.ride-headline {
		color: white;
		text-align: left;
		text-shadow: 0 2px 24px rgba(0, 0, 0, 0.55);
	}

	/* ── Photo gallery below hero ─────────────────── */
	.gallery-feature-frame,
	.gallery-tile {
		overflow: hidden;
		border-radius: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-900) 90%);
	}

	.gallery-feature-frame {
		min-height: 18rem;
	}

	:global(.linkified-url) {
		word-break: break-word;
		overflow-wrap: anywhere;
	}
</style>
