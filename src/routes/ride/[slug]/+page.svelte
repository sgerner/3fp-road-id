<script>
	import ShareButton from '#lib/components/ui/ShareButton.svelte';
	import { getRideImages } from '#lib/rides/media';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import IconBadgeInfo from '@lucide/svelte/icons/badge-info';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconRoute from '@lucide/svelte/icons/route';
	import IconShieldQuestion from '@lucide/svelte/icons/shield-question';
	import SmsContextOptIn from '#lib/components/sms/SmsContextOptIn.svelte';
	import { ensureLeafletDefaultIcon } from '#lib/map/leaflet';
	import { escapeHtml } from '#lib/markdown';
	import { buildGoogleCalendarUrl, eventLocation } from '#lib/calendar/links';
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '#lib/seo';

	const { data } = $props();
	const ride = $derived.by(() => data?.ride ?? null);
	const activity = $derived.by(() => ride?.activity ?? null);
	const rideDetails = $derived.by(() => ride?.rideDetails ?? {});
	const rideImageSources = $derived.by(() => getRideImages(rideDetails));
	const rideImages = $derived.by(() =>
		rideImageSources.map((image) =>
			optimizedImageUrl(image, { width: 768, height: 512, quality: 64 })
		)
	);
	const leadRideImage = $derived.by(
		() => optimizedImageUrl(rideImageSources[0], { width: 1200, height: 576, quality: 68 }) || null
	);
	const occurrences = $derived.by(() => ride?.occurrences ?? []);
	let rsvpLoadingId = $state('');
	let rsvpError = $state('');
	let claimLoading = $state(false);
	let claimError = $state('');
	let selectedOccurrenceId = $state(null);
	let mapEl = $state(null);
	let map;
	let marker;
	let mapLoadPromise;

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
	const selectedCalendarLinks = $derived(selectedOccurrenceCalendarLinks());
	const seoTitle = $derived.by(() => cleanSeoText(activity?.title || 'Ride'));
	const seoDescription = $derived.by(() =>
		limitSeoText(
			activity?.summary ||
				activity?.description ||
				`${seoTitle} on 3 Feet Please with route details, RSVP links, and calendar downloads.`,
			165
		)
	);
	const seoCanonical = $derived(buildCanonicalUrl(page.url));
	const seoImage = $derived.by(() => {
		const image = leadRideImage || '';
		if (!image) return '';
		try {
			return new URL(image, page.url.origin).toString();
		} catch {
			return image;
		}
	});
	const seoStructuredData = $derived.by(() => {
		const breadcrumbs = {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Rides',
					item: buildAbsoluteUrl(page.url.origin, '/ride')
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: seoTitle,
					item: seoCanonical
				}
			]
		};
		const rideEvent = {
			'@context': 'https://schema.org',
			'@type': 'Event',
			name: seoTitle,
			description: seoDescription,
			url: seoCanonical,
			image: seoImage || undefined,
			startDate: selectedOccurrence?.starts_at || activity?.starts_at || undefined,
			endDate: selectedOccurrence?.ends_at || activity?.ends_at || undefined,
			eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
			location:
				activity?.start_location_name || activity?.start_location_address
					? {
							'@type': 'Place',
							name: activity?.start_location_name || undefined,
							address: activity?.start_location_address || undefined
						}
					: undefined
		};
		return toJsonLd([breadcrumbs, rideEvent]);
	});
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

	function selectedOccurrenceCalendarLinks() {
		if (!selectedOccurrence?.starts_at) return { googleUrl: '', icsUrl: '' };
		const origin = page?.url?.origin || '';
		const slug = activity?.slug || '';
		const rideUrl = origin && slug ? `${origin}/ride/${encodeURIComponent(slug)}` : '';
		const icsUrl =
			origin && slug && selectedOccurrence?.id
				? `${origin}/api/calendar/rides/${encodeURIComponent(slug)}?occurrenceId=${encodeURIComponent(selectedOccurrence.id)}`
				: '';
		const googleUrl = buildGoogleCalendarUrl({
			title: activity?.title || 'Ride',
			start: selectedOccurrence.starts_at,
			end: selectedOccurrence.ends_at,
			description: activity?.summary || activity?.description || '',
			location: eventLocation(
				selectedOccurrence?.start_location_name || activity?.start_location_name,
				selectedOccurrence?.start_location_address || activity?.start_location_address
			),
			url: rideUrl
		});
		return { googleUrl, icsUrl };
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

	onMount(() => {
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
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				observer.disconnect();
				void (async () => {
					try {
						if (!mapLoadPromise) {
							mapLoadPromise = Promise.all([
								import('#lib/map/leaflet.css'),
								import('leaflet')
							]).then(([, mod]) => mod.default || mod);
						}
						const L = await mapLoadPromise;
						await ensureLeafletDefaultIcon(L);
						map = L.map(mapEl).setView([Number(latitude), Number(longitude)], 13);
						L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
							attribution: '&copy; OpenStreetMap contributors'
						}).addTo(map);
						marker = L.marker([Number(latitude), Number(longitude)]).addTo(map);
					} catch (error) {
						console.warn('Unable to render ride map', error);
					}
				})();
			},
			{ rootMargin: '200px' }
		);
		observer.observe(mapEl);

		return () => {
			observer.disconnect();
			map?.remove?.();
			map = null;
			marker = null;
		};
	});
</script>

<svelte:head>
	<title>{seoTitle} | 3 Feet Please</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="event" />
	<meta property="og:site_name" content="3 Feet Please" />
	<meta property="og:title" content={`${seoTitle} | 3 Feet Please`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={seoCanonical} />
	{#if seoImage}
		<meta property="og:image" content={seoImage} />
	{/if}

	<meta name="twitter:card" content={seoImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={`${seoTitle} | 3 Feet Please`} />
	<meta name="twitter:description" content={seoDescription} />
	{#if seoImage}
		<meta name="twitter:image" content={seoImage} />
	{/if}

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
		aria-labelledby="ride-title"
	>
		<div
			class="flex flex-col justify-between gap-8 px-6 pt-8 pb-12 sm:px-10 lg:px-14 lg:pt-12 lg:pb-16"
		>
			<div class="flex flex-col gap-4">
				<nav
					aria-label="Breadcrumb"
					class="flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
					<a
						class="border-surface-950 hover:border-tertiary-600 border-b-2 hover:no-underline"
						href="/ride"
					>
						Rides
					</a>
					<span aria-hidden="true">/</span>
					<span class="truncate">{seoTitle}</span>
				</nav>

				{#if (ride?.difficultyLevels ?? []).length || (ride?.ridingDisciplines ?? []).length}
					<div class="flex flex-wrap gap-2">
						{#each ride?.difficultyLevels ?? [] as level (level.name)}
							<span
								class="bg-surface-950 text-primary-500 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
							>
								{level.name}
							</span>
						{/each}
						{#each ride?.ridingDisciplines ?? [] as discipline (discipline.name)}
							<span
								class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
							>
								{discipline.name}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-5">
				<h1
					id="ride-title"
					class="text-surface-950! m-0 text-[clamp(2.5rem,6vw,5.6rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					{activity?.title}
				</h1>
				{#if activity?.summary}
					<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-xl">
						{@html renderLinkifiedText(activity.summary)}
					</p>
				{/if}
				{#if selectedOccurrence}
					<p
						class="border-surface-950 m-0 inline-flex flex-wrap items-center gap-2 border-l-[4px] pl-3 text-sm font-black tracking-wide uppercase"
					>
						{activity?.start_location_name
							? `${activity.start_location_name} · `
							: ''}{occurrenceLabel(selectedOccurrence)}
					</p>
				{/if}
			</div>

			<div class="flex flex-col gap-6">
				<div class="flex flex-wrap items-center gap-3">
					{#if currentUser}
						<button
							type="button"
							class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-black tracking-wide uppercase transition"
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
						<button
							type="button"
							class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
							onclick={(event) => {
								event.stopPropagation();
								window.dispatchEvent(new Event('open-login'));
							}}
						>
							Log in to RSVP
						</button>
					{/if}

					{#if canManage}
						<a
							class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center border-[3px] px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							href={`/ride/${activity.slug}/manage`}
						>
							Manage ride
						</a>
					{:else if canClaim}
						<button
							type="button"
							class="bg-tertiary-500 text-surface-950 hover:bg-surface-950 hover:text-tertiary-400 inline-flex items-center justify-center px-6 py-4 text-sm font-black tracking-wide uppercase transition"
							onclick={claimRide}
							disabled={claimLoading}
						>
							{claimLoading ? 'Claiming...' : claimLabel}
						</button>
					{/if}

					{#if selectedCalendarLinks.googleUrl}
						<a
							class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center border-[3px] px-5 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							href={selectedCalendarLinks.googleUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							Add to Google Calendar
						</a>
					{/if}
					{#if selectedCalendarLinks.icsUrl}
						<a
							class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center border-[3px] px-5 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							href={selectedCalendarLinks.icsUrl}
						>
							Download .ics
						</a>
					{/if}

					<ShareButton title={seoTitle} text={seoDescription} url={seoCanonical} kind="ride" />
				</div>

				{#if currentUser}
					<div class="flex max-w-xl flex-col gap-3">
						<SmsContextOptIn
							category="ride_reminders"
							source="ride-rsvp"
							title="Text me reminders for rides I RSVP for"
							description="Get concise reminders for upcoming rides you choose to attend. You can manage this preference from your Profile."
						/>
						<SmsContextOptIn
							category="admin_messages"
							source="ride-rsvp-admin-messages"
							title="Let ride organizers text me about my RSVP"
							description="Receive and reply to messages from organizers about rides you attend."
						/>
					</div>
				{/if}

				{#if rsvpError}
					<div
						class="bg-tertiary-500 text-surface-950 border-surface-950 border-[3px] p-4 text-sm font-black uppercase"
					>
						{rsvpError}
					</div>
				{/if}
				{#if claimError}
					<div
						class="bg-tertiary-500 text-surface-950 border-surface-950 border-[3px] p-4 text-sm font-black uppercase"
					>
						{claimError}
					</div>
				{/if}
			</div>
		</div>

		<div class="bg-surface-950 relative min-h-[24rem] sm:min-h-[30rem]">
			<img
				src={leadRideImage || '/images/default-ride.webp'}
				alt={activity?.title || 'Ride'}
				class="absolute inset-0 h-full w-full object-cover"
				width="1200"
				height="576"
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

			<div
				class="bg-surface-950 text-surface-50 absolute right-0 bottom-0 left-12 grid grid-cols-2 gap-3 px-5 py-4 sm:left-16 sm:grid-cols-4"
			>
				<div>
					<span class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.2em] uppercase">
						Distance
					</span>
					<span class="block text-sm font-black uppercase">
						{rideDetails?.estimated_distance_miles
							? `${rideDetails.estimated_distance_miles} mi`
							: 'TBD'}
					</span>
				</div>
				<div>
					<span class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.2em] uppercase">
						Duration
					</span>
					<span class="block text-sm font-black uppercase">
						{rideDetails?.estimated_duration_minutes
							? `${rideDetails.estimated_duration_minutes} min`
							: 'TBD'}
					</span>
				</div>
				<div>
					<span class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.2em] uppercase">
						Elevation
					</span>
					<span class="block text-sm font-black uppercase">
						{rideDetails?.elevation_gain_feet ? `${rideDetails.elevation_gain_feet} ft` : 'TBD'}
					</span>
				</div>
				<div>
					<span class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.2em] uppercase">
						Drop style
					</span>
					<span class="block text-sm font-black uppercase">
						{rideDetails?.is_no_drop ? 'No-drop' : 'Drop ride'}
					</span>
				</div>
			</div>
		</div>
	</section>

	<!-- UNCLAIMED CALLOUT -->
	{#if !activity?.host_user_id && !activity?.host_group_id}
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 border-b-[3px] px-6 py-8 sm:px-10 lg:px-14"
			aria-labelledby="unclaimed-heading"
		>
			<div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
				<div class="flex flex-col gap-2">
					<h2
						id="unclaimed-heading"
						class="text-surface-950! m-0 flex items-center gap-2.5 text-2xl font-black uppercase italic sm:text-3xl"
					>
						<IconShieldQuestion class="h-6 w-6 shrink-0" />
						This {ride?.recurrenceRule ? 'ride series is' : 'ride is'} currently unclaimed
					</h2>
					<p class="m-0 max-w-3xl text-base leading-snug font-medium">
						The listing is public, but no host or host organization is attached yet. Claim it to
						manage updates, RSVPs, reminder emails, and rider communication.
					</p>
				</div>
				{#if canClaim}
					<button
						type="button"
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 shrink-0 px-7 py-4 text-sm font-black tracking-wide uppercase transition"
						onclick={claimRide}
						disabled={claimLoading}
					>
						{claimLoading ? 'Claiming...' : claimLabel}
					</button>
				{:else if !currentUser}
					<p
						class="border-surface-950 m-0 shrink-0 border-[3px] px-4 py-2.5 text-xs font-black tracking-[0.16em] uppercase"
					>
						Log in with the header action to claim it.
					</p>
				{/if}
			</div>
		</section>
	{/if}

	<!-- DETAILS + SIDEBAR -->
	<div class="bg-surface-950 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
		<div class="flex min-w-0 flex-col gap-12 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<!-- Ride Details -->
			<section class="flex flex-col gap-6" aria-labelledby="ride-details-heading">
				<div class="flex flex-col gap-2">
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconRoute class="h-4 w-4" /> Route & Specs
					</p>
					<h2
						id="ride-details-heading"
						class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
					>
						Ride Details
					</h2>
				</div>

				<div class="border-surface-50 grid border-t-2 sm:grid-cols-2">
					<div class="border-surface-800 border-b py-5 sm:border-r sm:pr-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Meet</div>
						<div class="text-surface-50 mt-1 text-lg font-black">
							{@html renderLinkifiedText(activity?.start_location_name)}
						</div>
						{#if activity?.start_location_address}
							<div class="text-surface-300 mt-0.5 text-sm">
								{@html renderLinkifiedText(activity.start_location_address)}
							</div>
						{/if}
					</div>

					<div class="border-surface-800 border-b py-5 sm:pl-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Finish</div>
						{#if rideDetails?.end_location_name}
							<div class="text-surface-50 mt-1 text-lg font-black">
								{@html renderLinkifiedText(rideDetails.end_location_name)}
							</div>
						{:else}
							<div class="text-surface-50 mt-1 text-lg font-black">
								Same as start or route-dependent
							</div>
						{/if}
						{#if rideDetails?.end_location_address}
							<div class="text-surface-300 mt-0.5 text-sm">
								{@html renderLinkifiedText(rideDetails.end_location_address)}
							</div>
						{/if}
					</div>

					<div class="border-surface-800 border-b py-5 sm:border-r sm:pr-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Distance
						</div>
						<div class="text-surface-50 mt-1 text-2xl font-black italic tabular-nums">
							{rideDetails?.estimated_distance_miles
								? `${rideDetails.estimated_distance_miles} miles`
								: 'TBD'}
						</div>
					</div>

					<div class="border-surface-800 border-b py-5 sm:pl-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Duration
						</div>
						<div class="text-surface-50 mt-1 text-2xl font-black italic tabular-nums">
							{rideDetails?.estimated_duration_minutes
								? `${rideDetails.estimated_duration_minutes} min`
								: 'TBD'}
						</div>
					</div>

					<div class="border-surface-800 border-b py-5 sm:border-r sm:pr-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Elevation
						</div>
						<div class="text-surface-50 mt-1 text-2xl font-black italic tabular-nums">
							{rideDetails?.elevation_gain_feet ? `${rideDetails.elevation_gain_feet} ft` : 'TBD'}
						</div>
					</div>

					<div class="border-surface-800 border-b py-5 sm:pl-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Drop style
						</div>
						<div class="text-surface-50 mt-1 text-2xl font-black uppercase italic">
							{rideDetails?.is_no_drop ? 'No-drop' : 'Drop ride'}
						</div>
					</div>

					<div class="border-surface-800 border-b py-5 sm:col-span-2">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Pace</div>
						{#if rideDetails?.pace_notes}
							<div class="text-surface-50 mt-1.5 text-base leading-relaxed font-medium">
								{@html renderLinkifiedText(rideDetails.pace_notes)}
							</div>
						{:else}
							<div class="text-surface-300 mt-1.5 text-base">Not specified</div>
						{/if}
					</div>

					<div class="border-surface-800 border-b py-5 sm:col-span-2">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Surface
						</div>
						<div class="mt-2.5 flex flex-wrap gap-2">
							{#each rideDetails?.surface_types ?? [] as surface (surface)}
								<span
									class="bg-primary-500 text-surface-950 px-3 py-1 text-xs font-black uppercase"
								>
									{surface}
								</span>
							{/each}
						</div>
					</div>

					<div class="border-surface-800 border-b py-5 sm:col-span-2">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Bike suitability
						</div>
						<div class="mt-2.5 flex flex-wrap gap-2">
							{#each rideDetails?.bike_suitability ?? [] as bike (bike)}
								<span
									class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black uppercase"
								>
									{bike}
								</span>
							{/each}
						</div>
					</div>

					{#if rideDetails?.accessibility_notes}
						<div class="border-surface-800 border-b py-5 sm:col-span-2">
							<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
								Accessibility
							</div>
							<div class="text-surface-50 mt-1.5 text-base leading-relaxed">
								{@html renderLinkifiedText(rideDetails.accessibility_notes)}
							</div>
						</div>
					{/if}

					{#if activity?.description}
						<div class="border-surface-800 border-b py-5 sm:col-span-2">
							<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
								About this ride
							</div>
							<div class="text-surface-50 mt-2 text-base leading-7">
								{@html renderLinkifiedText(activity.description)}
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- Hosting -->
			<section class="flex flex-col gap-6" aria-labelledby="hosting-heading">
				<div class="flex flex-col gap-2">
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconBadgeInfo class="h-4 w-4" /> Organization
					</p>
					<h2
						id="hosting-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						Hosting
					</h2>
				</div>

				<div class="border-surface-50 grid border-t-2 sm:grid-cols-2">
					<div class="border-surface-800 border-b py-5 sm:border-r sm:pr-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Organizer
						</div>
						<div class="text-surface-50 mt-1 text-lg font-black uppercase">
							{#if activity?.host_group_id}
								Organization-hosted ride
							{:else if activity?.host_user_id}
								Hosted by a rider on 3FP
							{:else}
								No host attached yet
							{/if}
						</div>
					</div>
					<div class="border-surface-800 border-b py-5 sm:pl-6">
						<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Participant list
						</div>
						<div class="text-surface-50 mt-1 text-lg font-black uppercase">
							{rideDetails?.participant_visibility === 'private' ? 'Private to hosts' : 'Public'}
						</div>
					</div>
				</div>
			</section>

			<!-- Upcoming Occurrences -->
			<section class="flex flex-col gap-6" aria-labelledby="occurrences-heading">
				<div class="flex flex-col gap-2">
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconCalendarClock class="h-4 w-4" /> Schedule
					</p>
					<h2
						id="occurrences-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						Upcoming Occurrences
					</h2>
				</div>

				<div class="border-surface-50 border-t-2">
					{#each visibleOccurrences as occurrence, i (occurrence.id)}
						<button
							type="button"
							class={`border-surface-800 flex w-full items-center justify-between gap-4 border-b px-4 py-5 text-left transition ${
								String(selectedOccurrenceId) === String(occurrence.id)
									? 'bg-primary-500 text-surface-950'
									: 'text-surface-50 hover:bg-surface-900'
							}`}
							onclick={() => (selectedOccurrenceId = occurrence.id)}
						>
							<div class="flex min-w-0 items-center gap-4">
								<span
									class={`w-10 shrink-0 text-2xl font-black italic tabular-nums sm:text-3xl ${
										String(selectedOccurrenceId) === String(occurrence.id)
											? 'text-secondary-500'
											: 'text-tertiary-500'
									}`}
								>
									{String(i + 1).padStart(2, '0')}
								</span>
								<div class="min-w-0">
									<div class="text-base font-black uppercase sm:text-lg">
										{occurrenceLabel(occurrence)}
									</div>
									<div class="mt-0.5 text-sm opacity-80">
										{@html renderLinkifiedText(
											occurrence.start_location_name || activity?.start_location_name
										)}
									</div>
								</div>
							</div>
							{#if currentUserRsvp(occurrence)?.status === 'going'}
								<span
									class="bg-tertiary-500 text-surface-950 shrink-0 px-3 py-1 text-xs font-black uppercase"
								>
									You're in
								</span>
							{/if}
						</button>
					{/each}
					{#if scheduledOccurrences.length > 5}
						<p class="text-surface-300 m-0 pt-4 text-xs font-bold tracking-[0.16em] uppercase">
							Showing the next 5 upcoming occurrences.
						</p>
					{/if}
				</div>
			</section>
		</div>

		<!-- SIDEBAR: MAP + PARTICIPANTS -->
		<aside class="bg-secondary-500 text-surface-50 flex min-w-0 flex-col justify-between">
			<div class="flex flex-col">
				<section class="px-6 pt-12 pb-8 sm:px-10" aria-labelledby="map-heading">
					<div class="mb-4 flex flex-col gap-1">
						<p
							class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconMapPin class="h-4 w-4" /> Start line
						</p>
						<h2
							id="map-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black uppercase italic"
						>
							Map
						</h2>
					</div>
					{#if activity?.start_latitude != null && activity?.start_longitude != null}
						<div class="border-surface-950 h-72 overflow-hidden border-[3px]">
							<div bind:this={mapEl} class="h-full w-full"></div>
						</div>
					{:else}
						<p class="m-0 text-sm opacity-85">
							Map pin will appear when the start location has coordinates.
						</p>
					{/if}
				</section>

				<section
					class="border-surface-950/30 border-t-2 px-6 py-10 sm:px-10"
					aria-labelledby="participants-heading"
				>
					<div class="mb-4 flex flex-col gap-1">
						<p
							class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconUsers class="h-4 w-4" /> Roll call
						</p>
						<h2
							id="participants-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black uppercase italic"
						>
							Participants
						</h2>
					</div>
					{#if participantListVisible}
						<div class="border-surface-50 border-t-2">
							{#each selectedOccurrence?.rsvps?.filter((entry) => entry.status === 'going') ?? [] as rsvp, idx (rsvp.userId ?? idx)}
								<div class="border-surface-50/20 flex items-center gap-4 border-b py-3.5">
									<span class="text-primary-500 text-xl font-black italic tabular-nums">
										{String(idx + 1).padStart(2, '0')}
									</span>
									<div class="min-w-0">
										<div class="truncate font-black uppercase">{rsvp.participantName}</div>
										{#if canManage}
											<div class="truncate text-xs opacity-80">{rsvp.participantEmail}</div>
										{/if}
									</div>
								</div>
							{/each}
							{#if !selectedOccurrence?.rsvps?.filter((entry) => entry.status === 'going')?.length}
								<p class="m-0 pt-4 text-sm font-medium opacity-85">
									No RSVPs yet for the selected occurrence.
								</p>
							{/if}
						</div>
					{:else}
						<p class="border-surface-50 m-0 border-t-2 pt-4 text-sm font-medium opacity-85">
							The organizer has kept the participant list private.
						</p>
					{/if}
				</section>
			</div>

			<!-- Ruler band: 0 -> 3 ft -->
			<div
				class="bg-tertiary-500 text-surface-950 border-surface-950 grid grid-cols-3 border-t-[3px]"
				aria-hidden="true"
			>
				{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
					<div class="border-surface-950 relative h-14 border-l-[3px] first:border-l-0">
						<span
							class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-surface-950)_0_2px,transparent_2px_calc(100%/12))]"
						></span>
						<span class="absolute bottom-2 left-3 text-sm font-black uppercase">{mark}</span>
						{#if i === 2}
							<span class="absolute right-3 bottom-2 text-sm font-black uppercase">3 ft</span>
						{/if}
					</div>
				{/each}
			</div>
		</aside>
	</div>

	<!-- PHOTO GALLERY -->
	{#if rideImages.length > 1}
		<section
			class="bg-surface-950 text-surface-50 border-surface-800 border-t-2 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="photos-heading"
		>
			<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div class="flex flex-col gap-2">
					<div class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Photos</div>
					<h2
						id="photos-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black uppercase italic sm:text-5xl"
					>
						Route and ride vibe
					</h2>
				</div>
				<div class="text-surface-300 text-xs font-bold tracking-[0.22em] uppercase">
					{rideImages.length} images
				</div>
			</div>
			<div class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div class="bg-surface-900 border-surface-800 min-h-72 overflow-hidden border">
					<img
						src={rideImages[1]}
						alt={`${activity?.title || 'Ride'} photo 2`}
						class="h-full w-full object-cover"
						loading="lazy"
						width="768"
						height="512"
						decoding="async"
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					{#each rideImages.slice(2) as imageUrl, index (imageUrl)}
						<div class="bg-surface-900 border-surface-800 overflow-hidden border">
							<img
								src={imageUrl}
								alt={`${activity?.title || 'Ride'} photo ${index + 3}`}
								class="h-56 w-full object-cover"
								loading="lazy"
								width="768"
								height="512"
								decoding="async"
							/>
						</div>
					{/each}
				</div>
			</div>
			{#if rideImages.length === 2}
				<div class="text-surface-300 mt-4 text-sm">
					More ride photos will appear here as organizers add them.
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	:global(.linkified-url) {
		word-break: break-word;
		overflow-wrap: anywhere;
	}
</style>
