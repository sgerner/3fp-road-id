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
	import 'leaflet/dist/leaflet.css';

	const { data } = $props();
	const ride = $derived.by(() => data?.ride ?? null);
	const activity = $derived.by(() => ride?.activity ?? null);
	const rideDetails = $derived.by(() => ride?.rideDetails ?? {});
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
		Boolean(currentUser?.id) && !canManage && !activity?.host_user_id && !activity?.host_group_id
	);
	const claimLabel = $derived(ride?.recurrenceRule ? 'Claim Ride Series' : 'Claim Ride');

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
			selectedOccurrence?.start_latitude ?? activity?.start_latitude ?? activity?.startLatitude ?? null;
		const longitude =
			selectedOccurrence?.start_longitude ?? activity?.start_longitude ?? activity?.startLongitude ?? null;
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

<div class="mx-auto w-full max-w-7xl space-y-6">
	<section class="card preset-tonal-primary p-6">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="space-y-3">
				<div class="flex flex-wrap gap-2">
					{#each ride?.difficultyLevels ?? [] as level}
						<span class="chip preset-tonal-warning">{level.name}</span>
					{/each}
					{#each ride?.ridingDisciplines ?? [] as discipline}
						<span class="chip preset-tonal-success">{discipline.name}</span>
					{/each}
				</div>
				<h1 class="text-3xl font-bold">{activity?.title}</h1>
				{#if activity?.summary}
					<p class="max-w-3xl text-sm opacity-80">{activity.summary}</p>
				{/if}
			</div>
			<div class="flex flex-wrap gap-3">
				{#if canManage}
					<a class="btn preset-outlined-secondary-500" href={`/ride/${activity.slug}/manage`}>Manage ride</a>
				{/if}
				{#if currentUser}
					<button class="btn preset-filled-primary-500" onclick={() => submitRsvp(currentUserRsvp(selectedOccurrence)?.status === 'going' ? 'cancelled' : 'going')} disabled={rsvpLoadingId === selectedOccurrence?.id}>
						{#if currentUserRsvp(selectedOccurrence)?.status === 'going'}
							Leave ride
						{:else}
							RSVP
						{/if}
					</button>
				{:else}
					<a class="btn preset-filled-primary-500" href="/ride/new">Log in to RSVP</a>
				{/if}
			</div>
		</div>
		{#if rsvpError}
			<div class="card preset-tonal-error mt-4 p-3 text-sm">{rsvpError}</div>
		{/if}
		{#if claimError}
			<div class="card preset-tonal-error mt-4 p-3 text-sm">{claimError}</div>
		{/if}
	</section>

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
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Organizer</div>
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
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Participant list</div>
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
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Meet</div>
						<div class="mt-1 font-semibold">{activity?.start_location_name}</div>
						{#if activity?.start_location_address}
							<div class="text-sm opacity-75">{activity.start_location_address}</div>
						{/if}
					</div>
					<div>
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Finish</div>
						<div class="mt-1 font-semibold">{rideDetails?.end_location_name || 'Same as start or route-dependent'}</div>
						{#if rideDetails?.end_location_address}
							<div class="text-sm opacity-75">{rideDetails.end_location_address}</div>
						{/if}
					</div>
					<div>
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Distance</div>
						<div class="mt-1 font-semibold">{rideDetails?.estimated_distance_miles ? `${rideDetails.estimated_distance_miles} miles` : 'TBD'}</div>
					</div>
					<div>
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Duration</div>
						<div class="mt-1 font-semibold">{rideDetails?.estimated_duration_minutes ? `${rideDetails.estimated_duration_minutes} min` : 'TBD'}</div>
					</div>
					<div>
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Elevation</div>
						<div class="mt-1 font-semibold">{rideDetails?.elevation_gain_feet ? `${rideDetails.elevation_gain_feet} ft` : 'TBD'}</div>
					</div>
					<div>
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Drop style</div>
						<div class="mt-1 font-semibold">{rideDetails?.is_no_drop ? 'No-drop' : 'Drop ride'}</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Pace</div>
						<div class="mt-1">{rideDetails?.pace_notes || 'Not specified'}</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Surface</div>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each rideDetails?.surface_types ?? [] as surface}
								<span class="chip preset-tonal-surface">{surface}</span>
							{/each}
						</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-sm uppercase tracking-[0.18em] opacity-60">Bike suitability</div>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each rideDetails?.bike_suitability ?? [] as bike}
								<span class="chip preset-tonal-secondary">{bike}</span>
							{/each}
						</div>
					</div>
					{#if rideDetails?.accessibility_notes}
						<div class="md:col-span-2">
							<div class="text-sm uppercase tracking-[0.18em] opacity-60">Accessibility</div>
							<div class="mt-1">{rideDetails.accessibility_notes}</div>
						</div>
					{/if}
					{#if activity?.description}
						<div class="md:col-span-2">
							<div class="text-sm uppercase tracking-[0.18em] opacity-60">About this ride</div>
							<div class="mt-1 whitespace-pre-wrap leading-7">{activity.description}</div>
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
						<button type="button" class={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${String(selectedOccurrenceId) === String(occurrence.id) ? 'border-primary-500 bg-primary-500/8' : 'border-surface-500/20'}`} onclick={() => (selectedOccurrenceId = occurrence.id)}>
							<div>
								<div class="font-semibold">{occurrenceLabel(occurrence)}</div>
								<div class="text-sm opacity-75">{occurrence.start_location_name || activity?.start_location_name}</div>
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
					<div class="h-72 overflow-hidden rounded-xl border border-surface-500/20">
						<div bind:this={mapEl} class="h-full w-full"></div>
					</div>
				{:else}
					<p class="text-sm opacity-70">Map pin will appear when the start location has coordinates.</p>
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
							<div class="rounded-xl border border-surface-500/20 p-3">
								<div class="font-medium">{rsvp.participantName}</div>
								{#if canManage}
									<div class="text-sm opacity-70">{rsvp.participantEmail}</div>
								{/if}
							</div>
						{/each}
						{#if !(selectedOccurrence?.rsvps?.filter((entry) => entry.status === 'going')?.length)}
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
