<script>
	let { data } = $props();
	import IconLink from '@lucide/svelte/icons/link';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconDumbbell from '@lucide/svelte/icons/dumbbell';
	import IconRepeat from '@lucide/svelte/icons/repeat-2';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconFlag from '@lucide/svelte/icons/flag';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import GroupHeroCard from '$lib/components/groups/GroupHeroCard.svelte';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import {
		buildContactLinks,
		selectPrimaryCta,
		CTA_ICON_MAP,
		CONTACT_ICON_MAP
	} from '$lib/groups/contactLinks';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fade, slide } from 'svelte/transition';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '$lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';

	// UI state
	let showSticky = $state(false);
	let heroSentinel = $state(null);

	// Leaflet map (loaded client-side)
	let L;
	let mapEl = $state(null);
	let map;
	let marker;

	const group = $derived(data.group ?? null);
	const selected = $derived(data.selected ?? {});
	const hasCoords = $derived(Number.isFinite(group?.latitude) && Number.isFinite(group?.longitude));
	const lat = $derived(hasCoords ? Number(group.latitude) : undefined);
	const lng = $derived(hasCoords ? Number(group.longitude) : undefined);

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

	function pickNames(all, ids) {
		const set = new Set(ids || []);
		return (all || []).filter((x) => set.has(x.id)).map((x) => x.name);
	}

	const types = $derived(pickNames(data.group_types, selected?.group_type_ids));
	const audiences = $derived(pickNames(data.audience_focuses, selected?.audience_focus_ids));
	const disciplines = $derived(pickNames(data.riding_disciplines, selected?.riding_discipline_ids));
	const skills = $derived(pickNames(data.skill_levels, selected?.skill_level_ids));

	// Claim group support
	const hasOwner = $derived((data.owners_count ?? 0) > 0);
	let claimOpen = $state(false);
	let claimEmail = $state('');
	let claimLoading = $state(false);
	let claimError = $state('');
	let claimSuccess = $state('');
	let claimHoneypot = $state('');
	let claimEmailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(claimEmail));
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);

	async function initTurnstile() {
		if (!turnstileEnabled || !turnstileEl || turnstileWidgetId) return;
		try {
			const widgetId = await renderTurnstile(turnstileEl, {
				sitekey: PUBLIC_TURNSTILE_SITE_KEY,
				size: 'invisible'
			});
			turnstileWidgetId = widgetId;
		} catch (err) {
			console.error('Failed to initialize Turnstile widget', err);
		}
	}

	$effect(() => {
		if (turnstileEnabled && turnstileEl && !turnstileWidgetId) {
			initTurnstile();
		}
	});

	async function claimGroup() {
		claimError = '';
		try {
			const res = await fetch(`/api/groups/${data.group.slug}/claim`, { method: 'POST' });
			if (res.status === 401) {
				claimOpen = true;
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
		if (claimHoneypot.trim()) {
			claimError = 'Invalid submission.';
			return;
		}
		claimLoading = true;
		try {
			let turnstileToken = '';
			if (turnstileEnabled) {
				await initTurnstile();
				if (!turnstileWidgetId) {
					claimError = 'Verification failed. Please reload and try again.';
					claimLoading = false;
					return;
				}
				turnstileToken = await executeTurnstile(turnstileWidgetId);
				if (!turnstileToken) {
					claimError = 'Verification failed. Please try again.';
					claimLoading = false;
					return;
				}
			}
			const url = new URL(window.location.href);
			url.searchParams.set('auto_claim_group', data.group.slug);
			const rt = `${url.pathname}${url.search}${url.hash}`;
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: claimEmail,
					createProfile: true,
					returnTo: rt,
					honeypot: claimHoneypot,
					turnstileToken
				})
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send magic link');
			}
			claimSuccess = `We sent a login link to ${claimEmail}. After logging in, you'll be directed to the edit page for this group.`;
			claimHoneypot = '';
		} catch (err) {
			claimError = err.message || 'Login failed.';
		} finally {
			claimLoading = false;
			if (turnstileEnabled && turnstileWidgetId) {
				resetTurnstile(turnstileWidgetId);
			}
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
	const canAcceptDonations = $derived(Boolean(data?.is_claimed && data?.donation_enabled === true));
	const shouldShowDonationSetup = $derived(
		Boolean(data?.is_owner && data?.is_claimed && !canAcceptDonations)
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

	// Deterministic chip coloring (same as /groups listing)
	const filledClasses = [
		'chip text-xs preset-filled-primary-500',
		'chip text-xs preset-filled-secondary-500',
		'chip text-xs preset-filled-tertiary-500',
		'chip text-xs preset-filled-success-500',
		'chip text-xs preset-filled-warning-500',
		'chip text-xs preset-tonal-primary',
		'chip text-xs preset-tonal-secondary',
		'chip text-xs preset-tonal-tertiary'
	];
	function hashStr(s) {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return Math.abs(h);
	}
	function chipFilled(name) {
		return filledClasses[hashStr(name || '') % filledClasses.length];
	}

	// Whether the details section has anything to show
	const hasDetails = $derived(
		!!(
			data.group?.membership_info ||
			data.group?.service_area_description ||
			data.group?.activity_frequency ||
			data.group?.typical_activity_day_time ||
			data.group?.preferred_contact_method_instructions ||
			data.group?.specific_meeting_point_address ||
			(Number.isFinite(data.group?.latitude) && Number.isFinite(data.group?.longitude)) ||
			data.group?.zip_code ||
			skills.length ||
			data.group?.how_to_join_instructions
		)
	);
</script>

<div class="group-detail mx-auto w-full max-w-4xl space-y-5 pb-10">
	<GroupHeroCard group={data.group} canEdit={data.can_edit} {contactLinks} {primaryCta} />

	<!-- Auth notice -->
	{#if authFlag === 'required' || authFlag === 'forbidden'}
		<section
			class="auth-notice rounded-2xl border p-4 {authFlag === 'required'
				? 'border-warning-400-600/40 bg-warning-500/8'
				: 'border-error-400-600/40 bg-error-500/8'}"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-start gap-3">
				<IconInfo
					class="mt-0.5 h-5 w-5 shrink-0 {authFlag === 'required'
						? 'text-warning-500'
						: 'text-error-500'}"
				/>
				<div class="text-sm">
					{#if authFlag === 'required'}
						<strong>Please log in to edit this group.</strong>
						<div class="text-surface-700-300 mt-0.5">
							Use the "Log in / Register" button in the header, then try again.
						</div>
					{:else}
						<strong>You don't have permission to edit this group.</strong>
						{#if (data.owners_count ?? 0) === 0}
							<div class="text-surface-700-300 mt-0.5">
								If you represent this group, claim it below to become an owner.
							</div>
						{:else}
							<div class="text-surface-700-300 mt-0.5">
								Ask an existing owner to add you as an owner.
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Claim banner -->
	{#if !hasOwner}
		<section
			class="claim-panel relative overflow-hidden rounded-2xl p-5"
			in:fade={{ duration: 200 }}
		>
			<div class="claim-glow" aria-hidden="true"></div>
			<div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div class="flex items-start gap-3">
					<div
						class="claim-icon-ring mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
					>
						<IconFlag class="text-warning-400 h-5 w-5" />
					</div>
					<div class="min-w-0">
						<div class="font-semibold">This group hasn't been claimed yet</div>
						<p class="text-surface-700-300 mt-0.5 text-sm">
							If you represent this group, claim it to manage details, photos, and more.
						</p>
					</div>
				</div>
				{#if data.user}
					<button
						class="btn preset-filled-warning-500 shrink-0 font-bold shadow-lg"
						onclick={claimGroup}
					>
						Claim Group
					</button>
				{:else}
					<button
						class="btn preset-filled-warning-500 shrink-0 font-bold shadow-lg"
						onclick={() => (claimOpen = true)}
					>
						Claim Group
					</button>
				{/if}
			</div>

			<!-- Email form for unauthenticated claim -->
			{#if claimOpen && !data.user}
				<div class="relative z-10 mt-4" in:slide={{ duration: 180 }}>
					<form
						class="border-surface-300-700/50 bg-surface-100-900/50 rounded-xl border p-4 backdrop-blur-sm"
						onsubmit={sendClaimLogin}
					>
						<div
							aria-hidden="true"
							style="position: absolute; width: 0; height: 0; overflow: hidden;"
						>
							<div bind:this={turnstileEl}></div>
						</div>
						<input
							type="text"
							name="website"
							bind:value={claimHoneypot}
							autocomplete="off"
							tabindex="-1"
							aria-hidden="true"
							style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
						/>
						<label
							for="claim-email"
							class="text-surface-700-300 mb-1.5 block text-xs font-medium tracking-wide uppercase"
						>
							Log in / Register to continue
						</label>
						<input
							id="claim-email"
							type="email"
							bind:value={claimEmail}
							placeholder="you@example.com"
							class="input w-full"
							required
						/>
						{#if claimError}
							<div class="text-error-600-400 mt-2 text-xs">{claimError}</div>
						{/if}
						{#if claimSuccess}
							<div class="text-success-600-400 mt-2 text-xs">{claimSuccess}</div>
						{/if}
						<button
							type="submit"
							class="btn preset-filled-primary-500 mt-3 w-full {claimLoading
								? 'animate-pulse'
								: ''} {!claimEmailValid || claimLoading ? 'cursor-not-allowed opacity-50' : ''}"
							disabled={!claimEmailValid || claimLoading}>Send Magic Link</button
						>
					</form>
				</div>
			{/if}
		</section>
	{/if}

	{#if canAcceptDonations || shouldShowDonationSetup}
		<section
			class="volunteer-panel relative overflow-hidden rounded-2xl p-5"
			in:fade={{ duration: 220 }}
		>
			<div class="volunteer-glow" aria-hidden="true"></div>
			<div class="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<div class="mb-1 flex items-center gap-2">
						<IconHandHeart class="text-primary-400 h-5 w-5" />
						<p class="label opacity-60">Support</p>
					</div>
					<h2 class="text-xl font-bold">Support {data.group?.name}</h2>
					<p class="text-surface-600-400 mt-0.5 text-sm">
						{#if canAcceptDonations}
							Donate directly to this group through their connected Stripe account.
						{:else}
							Connect Stripe in the edit page to enable donations for this claimed group.
						{/if}
					</p>
				</div>
				{#if canAcceptDonations}
					<a
						href={`/donate?group=${encodeURIComponent(data.group?.slug || '')}`}
						class="btn preset-filled-primary-500 shrink-0 font-bold"
					>
						Donate to {data.group?.name}
					</a>
				{:else if shouldShowDonationSetup}
					<a
						href={`/groups/${data.group?.slug}/edit`}
						class="btn preset-outlined-primary-500 shrink-0"
					>
						Connect Stripe
					</a>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Sticky subheader (appears after hero scrolls out) -->
	{#if showSticky}
		<div
			class="border-surface-300-700/30 bg-surface-100-900/80 sticky top-0 z-40 border-b backdrop-blur-xl"
			in:slide={{ duration: 180, axis: 'y' }}
		>
			<div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-2">
				<div class="flex min-w-0 items-center gap-3">
					{#if data.group?.logo_url}
						<img
							src={data.group.logo_url}
							alt="{data.group.name} logo"
							class="h-8 w-8 rounded-lg object-cover shadow-sm"
						/>
					{/if}
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold">{data.group?.name}</div>
						<div class="text-surface-700-300 truncate text-xs">
							{#if data.group?.city}{data.group.city},{/if}{data.group?.state_region} · {data.group
								?.country}
						</div>
					</div>
				</div>
				{#if data.is_owner}
					<a href={`/groups/${data.group.slug}/edit`} class="chip preset-filled-primary-500">
						Edit Group
					</a>
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

	<!-- ── Identity card ── -->
	<section
		class="identity-card relative overflow-hidden rounded-2xl p-5"
		in:fade={{ duration: 240, delay: 60 }}
	>
		<!-- Gradient accent top bar -->
		<div class="identity-accent-bar" aria-hidden="true"></div>

		<!-- Top row: type chips + social links -->
		<div class="flex items-start justify-between gap-3">
			{#if types.length}
				<div class="flex flex-wrap gap-2">
					{#each types as t}
						<span class={chipFilled(t)}>{t}</span>
					{/each}
				</div>
			{/if}

			<!-- Social contact icons -->
			{#if contactLinks.length}
				<div class="ml-auto flex shrink-0 items-center gap-1">
					{#each contactLinks.slice(0, 6) as c}
						{@const ContactIcon = contactIconByKey[c.key] || IconLink}
						<a
							href={c.href}
							title={c.key}
							target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
							rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
							class="contact-icon-btn rounded-lg p-2 transition-all"
						>
							<ContactIcon class="h-4 w-4" />
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<!-- About / description -->
		{#if data.group?.description}
			<div class="mt-4">
				<AutoLinkText
					text={data.group.description}
					className={'text-surface-800-200 text-sm leading-relaxed ' +
						(aboutExpanded ? '' : 'line-clamp-5')}
				/>
				{#if data.group.description?.length > 220}
					<button
						type="button"
						class="text-primary-700-300 hover:text-primary-600-400 mt-2 text-sm font-medium transition-colors"
						onclick={() => (aboutExpanded = !aboutExpanded)}
					>
						{aboutExpanded ? 'Show less' : 'Read more'}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Audience + Discipline chip rows -->
		{#if audiences.length || disciplines.length || skills.length}
			<div class="mt-4 space-y-2.5">
				{#if audiences.length}
					<div class="flex items-center gap-3">
						<div class="flex items-center gap-1.5">
							<IconUsers class="text-surface-500-400 h-3.5 w-3.5 shrink-0" />
							<span class="text-surface-600-400 min-w-20 text-xs font-medium">Audience</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each audiences as a}
								<span class="chip preset-tonal-secondary text-xs">{a}</span>
							{/each}
						</div>
					</div>
				{/if}
				{#if disciplines.length}
					<div class="flex items-center gap-3">
						<div class="flex items-center gap-1.5">
							<IconRepeat class="text-surface-500-400 h-3.5 w-3.5 shrink-0" />
							<span class="text-surface-600-400 min-w-20 text-xs font-medium">Discipline</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each disciplines as d}
								<span class={chipFilled(d)}>{d}</span>
							{/each}
						</div>
					</div>
				{/if}
				{#if skills.length}
					<div class="flex items-center gap-3">
						<div class="flex items-center gap-1.5">
							<IconDumbbell class="text-surface-500-400 h-3.5 w-3.5 shrink-0" />
							<span class="text-surface-600-400 min-w-20 text-xs font-medium">Skill</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each skills as s}
								<span class="chip preset-tonal-tertiary text-xs">{s}</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- ── Volunteer events ── -->
	{#if upcomingVolunteerEvents.length}
		<section
			class="volunteer-panel relative overflow-hidden rounded-2xl p-5"
			in:fade={{ duration: 240, delay: 100 }}
		>
			<div class="volunteer-glow" aria-hidden="true"></div>
			<div class="relative z-10">
				<!-- Header -->
				<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
					<div>
						<div class="mb-1 flex items-center gap-2">
							<IconHandHeart class="text-tertiary-400 h-5 w-5" />
							<p class="label opacity-60">Community</p>
						</div>
						<h2 class="text-xl font-bold">Upcoming Volunteer Opportunities</h2>
						<p class="text-surface-600-400 mt-0.5 text-sm">
							Support {data.group?.name} by lending a hand at an upcoming event.
						</p>
					</div>
					<a
						href={`/volunteer/groups/${data.group.slug}`}
						class="btn btn-sm preset-outlined-tertiary-500 whitespace-nowrap"
					>
						All Events <IconArrowRight class="ml-1 h-3.5 w-3.5" />
					</a>
				</div>

				<!-- Event list -->
				<ul class="space-y-3">
					{#each upcomingVolunteerEvents as event, i}
						<li class="volunteer-event-card rounded-xl p-4" style="--stagger: {i}">
							<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div class="space-y-2">
									<a
										href={`/volunteer/${event.slug}`}
										class="text-tertiary-300 hover:text-tertiary-200 text-base leading-snug font-semibold transition-colors"
									>
										{event.title}
									</a>
									{#if event.summary}
										<AutoLinkText
											text={event.summary}
											className="text-surface-600-400 line-clamp-2 text-sm"
										/>
									{/if}
									<div class="flex flex-wrap items-center gap-3 text-xs">
										<span class="text-surface-700-300 flex items-center gap-1">
											<IconCalendar class="h-3.5 w-3.5" />
											{volunteerEventDateRange(event)}
										</span>
										{#if volunteerEventTimeRange(event)}
											<span class="text-surface-700-300 flex items-center gap-1">
												<IconClock class="h-3.5 w-3.5" />
												{volunteerEventTimeRange(event)}
											</span>
										{/if}
										<span class="text-surface-700-300 flex items-center gap-1">
											<IconMapPin class="h-3.5 w-3.5" />
											<AutoLinkText text={volunteerEventLocation(event)} />
										</span>
									</div>
								</div>
								<div class="flex shrink-0 flex-wrap items-center gap-2">
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
											class="btn btn-sm preset-outlined-tertiary-500 flex items-center gap-1.5 whitespace-nowrap"
										>
											Volunteer
											<IconArrowRight class="h-3.5 w-3.5" />
										</a>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	<!-- ── Additional details ── -->
	{#if hasDetails}
		<section class="details-card rounded-2xl p-5" in:fade={{ duration: 240, delay: 140 }}>
			<!-- Accent bar -->
			<div class="details-accent-bar mb-5" aria-hidden="true"></div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				{#if data.group?.how_to_join_instructions}
					<div class="detail-item">
						<div class="detail-label">How to Join</div>
						<AutoLinkText
							text={data.group.how_to_join_instructions}
							className="text-surface-800-200 text-sm whitespace-pre-wrap"
						/>
					</div>
				{/if}
				{#if data.group?.preferred_contact_method_instructions}
					<div class="detail-item">
						<div class="detail-label">Preferred Contact Method</div>
						<AutoLinkText
							text={data.group.preferred_contact_method_instructions}
							className="text-surface-800-200 text-sm"
						/>
					</div>
				{/if}
				{#if data.group?.membership_info}
					<div class="detail-item">
						<div class="detail-label">Membership Info</div>
						<AutoLinkText
							text={data.group.membership_info}
							className="text-surface-800-200 text-sm whitespace-pre-wrap"
						/>
					</div>
				{/if}
				{#if data.group?.zip_code}
					<div class="detail-item">
						<div class="detail-label">ZIP / Postal Code</div>
						<p class="text-surface-800-200 text-sm">{data.group.zip_code}</p>
					</div>
				{/if}
			</div>

			{#if data.group?.activity_frequency || data.group?.typical_activity_day_time || data.group?.specific_meeting_point_address}
				<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
					{#if data.group?.activity_frequency}
						<div class="detail-item">
							<div class="detail-label flex items-center gap-1.5">
								<IconRepeat class="h-3.5 w-3.5" />
								Activity Frequency
							</div>
							<AutoLinkText
								text={data.group.activity_frequency}
								className="text-surface-800-200 text-sm"
							/>
						</div>
					{/if}
					{#if data.group?.typical_activity_day_time}
						<div class="detail-item">
							<div class="detail-label flex items-center gap-1.5">
								<IconClock class="h-3.5 w-3.5" />
								Typical Day / Time
							</div>
							<AutoLinkText
								text={data.group.typical_activity_day_time}
								className="text-surface-800-200 text-sm"
							/>
						</div>
					{/if}
					{#if data.group?.specific_meeting_point_address}
						<div class="detail-item">
							<div class="detail-label flex items-center gap-1.5">
								<IconMapPin class="h-3.5 w-3.5" />
								Meeting Point
							</div>
							<AutoLinkText
								text={data.group.specific_meeting_point_address}
								className="text-surface-800-200 text-sm"
							/>
						</div>
					{/if}
				</div>
			{/if}

			{#if data.group?.service_area_description || hasCoords}
				<div class="detail-item mt-4">
					<div class="detail-label flex items-center gap-1.5">
						<IconMapPin class="h-3.5 w-3.5" />
						Service Area
					</div>
					{#if data.group?.service_area_description}
						<AutoLinkText
							text={data.group.service_area_description}
							className="text-surface-800-200 text-sm whitespace-pre-wrap"
						/>
					{/if}
					{#if hasCoords}
						<div class="map-container mt-3">
							<div bind:this={mapEl} class="h-64 w-full rounded-xl"></div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	/* ── Identity card ── */
	.identity-card {
		background: color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		animation: card-in 380ms ease both;
	}

	.identity-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.7;
		border-radius: 2rem 2rem 0 0;
	}

	.contact-icon-btn {
		color: color-mix(in oklab, var(--color-surface-900) 30%, var(--color-surface-100) 70%);
	}
	.contact-icon-btn:hover {
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		color: var(--color-primary-400);
	}
	:global(.dark) .contact-icon-btn {
		color: color-mix(in oklab, var(--color-surface-200) 80%, transparent);
	}

	/* ── Claim panel ── */
	.claim-panel {
		background: color-mix(in oklab, var(--color-warning-500) 10%, var(--color-surface-900) 90%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 30%, transparent);
		animation: card-in 380ms ease both;
		animation-delay: 40ms;
	}

	.claim-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 60% at 100% 0%,
			color-mix(in oklab, var(--color-warning-500) 20%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.claim-icon-ring {
		background: color-mix(in oklab, var(--color-warning-500) 18%, var(--color-surface-800) 82%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 35%, transparent);
	}

	/* ── Volunteer panel ── */
	.volunteer-panel {
		background: color-mix(in oklab, var(--color-tertiary-500) 8%, var(--color-surface-900) 92%);
		border: 1px solid color-mix(in oklab, var(--color-tertiary-500) 22%, transparent);
		animation: card-in 380ms ease both;
		animation-delay: 80ms;
	}

	.volunteer-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 70% 50% at 0% 100%,
			color-mix(in oklab, var(--color-tertiary-500) 14%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.volunteer-event-card {
		background: color-mix(in oklab, var(--color-surface-800) 80%, var(--color-tertiary-500) 5%);
		border: 1px solid color-mix(in oklab, var(--color-tertiary-500) 12%, transparent);
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
		animation: card-in 400ms ease both;
		animation-delay: calc(var(--stagger, 0) * 60ms);
	}

	.volunteer-event-card:hover {
		transform: translateX(3px);
		box-shadow: 0 4px 20px -4px color-mix(in oklab, var(--color-tertiary-500) 20%, transparent);
	}

	/* ── Details card ── */
	.details-card {
		background: color-mix(in oklab, var(--color-surface-900) 96%, var(--color-secondary-500) 4%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 16%, transparent);
		animation: card-in 380ms ease both;
		animation-delay: 120ms;
	}

	.details-accent-bar {
		height: 2px;
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		opacity: 0.5;
		border-radius: 2px;
	}

	.detail-item {
		padding: 0.875rem;
		border-radius: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.detail-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.55;
		margin-bottom: 0.375rem;
	}

	.map-container {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.875rem;
		overflow: hidden;
	}

	/* ── Auth notice ── */
	.auth-notice {
		animation: card-in 320ms ease both;
	}

	/* ── Card entrance ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
