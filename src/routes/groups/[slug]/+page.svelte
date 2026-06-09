<script>
	let { data } = $props();
	import IconLink from '@lucide/svelte/icons/link';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconDumbbell from '@lucide/svelte/icons/dumbbell';
	import IconRepeat from '@lucide/svelte/icons/repeat-2';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconFlag from '@lucide/svelte/icons/flag';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import BrandInstagram from '$lib/icons/BrandInstagram.svelte';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconBadgeDollarSign from '@lucide/svelte/icons/badge-dollar-sign';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';
	import GroupHeroCard from '$lib/components/groups/GroupHeroCard.svelte';
	import GroupAssetShowcase from '$lib/components/groups/GroupAssetShowcase.svelte';
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
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '$lib/seo';

	// UI state
	let showSticky = $state(false);
	let heroSentinel = $state(null);

	// Leaflet map (loaded client-side)
	let L;
	let mapEl = $state(null);
	let map;
	let marker;
	let mapInitialized = $state(false);

	const group = $derived(data.group ?? null);
	const selected = $derived(data.selected ?? {});
	const hasCoords = $derived(Number.isFinite(group?.latitude) && Number.isFinite(group?.longitude));
	const lat = $derived(hasCoords ? Number(group.latitude) : undefined);
	const lng = $derived(hasCoords ? Number(group.longitude) : undefined);

	async function initMap() {
		if (!L || !mapEl || map || mapInitialized) return;
		// Small delay to ensure container is properly rendered
		await new Promise((resolve) => setTimeout(resolve, 100));
		const z = 12;
		map = L.map(mapEl).setView([lat, lng], z);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		marker = L.marker([lat, lng]).addTo(map);
		mapInitialized = true;
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
		// Try to init map immediately and also after a delay (for when details section is collapsed initially)
		requestAnimationFrame(() => initMap());
		setTimeout(() => initMap(), 500);
	});

	// Re-init map when map element is ready
	$effect(() => {
		if (mapEl && !map && L) {
			requestAnimationFrame(() => initMap());
		}
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
			window.location.href = `/groups/${data.group.slug}/manage/edit`;
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
	const connectedInstagram = $derived(data.connected_instagram ?? null);
	const instagramPosts = $derived(
		Array.isArray(data.instagram_posts) ? data.instagram_posts.slice(0, 3) : []
	);
	const groupNewsPosts = $derived(
		Array.isArray(data.group_news_posts) ? data.group_news_posts.slice(0, 3) : []
	);
	const accountingReports = $derived(
		Array.isArray(data.accounting_public_reports) ? data.accounting_public_reports.slice(0, 3) : []
	);
	const latestAccountingReport = $derived(accountingReports[0] ?? null);
	const instagramPostsSource = $derived(data.instagram_posts_source || 'none');
	const connectedInstagramLabel = $derived(
		connectedInstagram?.username
			? `@${connectedInstagram.username}`
			: connectedInstagram?.account_name || ''
	);
	const instagramProfileUrl = $derived(
		connectedInstagram?.profile_url || data.group?.social_links?.instagram || null
	);

	let aboutExpanded = $state(false);

	const primaryCta = $derived(selectPrimaryCta(data.group, contactLinks));
	const ctaIcons = CTA_ICON_MAP;
	const contactIconByKey = CONTACT_ICON_MAP;

	const canAcceptDonations = $derived(Boolean(data?.is_claimed && data?.donation_enabled === true));
	const shouldShowDonationSetup = $derived(
		Boolean(data?.is_owner && data?.is_claimed && !canAcceptDonations)
	);
	const membershipProgram = $derived(data?.membership_program ?? null);
	const membershipTiers = $derived(
		Array.isArray(data?.membership_tiers) ? data.membership_tiers : []
	);
	const myMemberships = $derived(Array.isArray(data?.my_memberships) ? data.my_memberships : []);
	const membershipEnabled = $derived(Boolean(membershipProgram?.enabled === true));
	const hasCurrentMembership = $derived(
		myMemberships.some((membership) =>
			['active', 'past_due', 'paused'].includes(membership?.status)
		)
	);
	const membershipCtaLabel = $derived(
		hasCurrentMembership
			? 'Membership'
			: membershipProgram?.cta_label ||
					(membershipProgram?.access_mode === 'private_request'
						? 'Request Membership'
						: 'Join Membership')
	);
	const headerMembershipCta = $derived(
		membershipEnabled
			? {
					href: `/groups/${data.group?.slug}/membership`,
					label: followLoading && canInstantFollow ? 'Following...' : membershipCtaLabel,
					onClick: handleMembershipCtaClick
				}
			: null
	);
	function resolveSingleFreeFollowTier() {
		if (!membershipEnabled) return null;
		if (membershipProgram?.access_mode === 'private_request') return null;
		const normalizedContributionMode =
			membershipProgram?.contribution_mode === 'required_fee'
				? 'paid'
				: membershipProgram?.contribution_mode || 'donation';
		if (normalizedContributionMode === 'paid') return null;
		if (!Array.isArray(membershipTiers) || membershipTiers.length !== 1) return null;
		const tier = membershipTiers[0];
		const monthlyAmount = Number(tier?.monthly_amount_cents ?? tier?.amount_cents ?? 0);
		const annualAmount = Number(tier?.annual_amount_cents ?? 0);
		const isFree = monthlyAmount <= 0 && annualAmount <= 0 && tier?.allow_custom_amount !== true;
		return isFree ? tier : null;
	}
	const singleFreeFollowTier = $derived(resolveSingleFreeFollowTier());
	const canInstantFollow = $derived(Boolean(singleFreeFollowTier));
	const followFlag = $derived(($page.url.searchParams.get('follow') || '').trim());
	const followMessage = $derived(($page.url.searchParams.get('follow_msg') || '').trim());

	let followModalOpen = $state(false);
	let followEmail = $state('');
	let followLoading = $state(false);
	let followError = $state('');
	let followSuccess = $state('');
	const followEmailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(followEmail));
	let donationStartAmount = $state(25);

	async function joinSingleFreeTierNow() {
		if (!singleFreeFollowTier) return;
		followLoading = true;
		followError = '';
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/membership/join`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						tier_id: singleFreeFollowTier.id,
						billing_interval: 'month'
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				if (response.status === 401) {
					followModalOpen = true;
					return;
				}
				throw new Error(payload?.error || 'Unable to follow right now.');
			}
			window.location.href = `/groups/${encodeURIComponent(data.group.slug)}?follow=success`;
		} catch (err) {
			followError = err?.message || 'Unable to follow right now.';
		} finally {
			followLoading = false;
		}
	}

	async function handleMembershipCtaClick(event) {
		if (hasCurrentMembership) return;
		if (!canInstantFollow) return;
		event.preventDefault();
		if (data.session_user_id) {
			await joinSingleFreeTierNow();
			return;
		}
		followModalOpen = true;
		followError = '';
		followSuccess = '';
	}

	async function sendFollowMagicLink(event) {
		event?.preventDefault?.();
		if (!followEmailValid || !singleFreeFollowTier) return;
		followLoading = true;
		followError = '';
		followSuccess = '';
		try {
			const returnTo = `/groups/${encodeURIComponent(data.group.slug)}?auto_follow=1&auto_follow_tier=${encodeURIComponent(singleFreeFollowTier.id)}`;
			const response = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: followEmail,
					createProfile: true,
					returnTo
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to send magic link.');
			}
			followSuccess = `Check ${followEmail} for your login link. We’ll complete follow automatically after login.`;
		} catch (err) {
			followError = err?.message || 'Unable to send magic link.';
		} finally {
			followLoading = false;
		}
	}

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

	function instagramPostCaption(post) {
		const text = String(post?.caption || '').trim();
		if (!text) return 'Instagram post';
		return text.length > 140 ? `${text.slice(0, 139)}…` : text;
	}

	function instagramPostDate(post) {
		const raw = post?.timestamp;
		if (!raw) return '';
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function instagramHasInlineMedia(post) {
		return Boolean(post?.media_url);
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

	const hasPosts = $derived(instagramPosts.length > 0 || !!connectedInstagramLabel);
	const seoTitle = $derived.by(() => cleanSeoText(data.group?.name || 'Group'));
	const seoDescription = $derived.by(() => {
		const city = cleanSeoText(data.group?.city);
		const state = cleanSeoText(data.group?.state_region);
		const locality = [city, state].filter(Boolean).join(', ');
		const base =
			cleanSeoText(
				data.group?.description ||
					data.group?.membership_info ||
					data.group?.service_area_description
			) || `${seoTitle} is a cycling community on 3 Feet Please.`;
		const tail = locality
			? ` Explore rides, updates, and volunteer opportunities in ${locality}.`
			: ' Explore rides, updates, and volunteer opportunities.';
		return limitSeoText(`${base}${tail}`, 165);
	});
	const seoCanonical = $derived(
		buildCanonicalUrl($page.url, [
			'auth',
			'follow',
			'follow_msg',
			'auto_follow',
			'auto_follow_tier'
		])
	);
	const seoImage = $derived.by(() => {
		const image = data.group?.cover_photo_url || data.group?.logo_url || '';
		if (!image) return '';
		try {
			return new URL(image, $page.url.origin).toString();
		} catch {
			return image;
		}
	});
	const seoStructuredData = $derived.by(() => {
		const sameAs = (contactLinks || [])
			.map((link) => String(link?.href || '').trim())
			.filter((href) => /^https?:\/\//i.test(href))
			.slice(0, 12);
		const breadcrumbs = {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Groups',
					item: buildAbsoluteUrl($page.url.origin, '/groups')
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: seoTitle,
					item: seoCanonical
				}
			]
		};
		const organization = {
			'@context': 'https://schema.org',
			'@type': 'SportsOrganization',
			name: seoTitle,
			description: seoDescription,
			url: seoCanonical,
			logo: data.group?.logo_url || undefined,
			image: seoImage || undefined,
			areaServed:
				[data.group?.city, data.group?.state_region].filter(Boolean).join(', ') || undefined,
			sameAs: sameAs.length ? sameAs : undefined
		};
		return toJsonLd([breadcrumbs, organization]);
	});

	function newsPostDate(post) {
		const raw = post?.published_at || post?.created_at;
		if (!raw) return 'Recently';
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) return 'Recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function formatAccountingCents(cents, currency = 'usd') {
		const amount = Number(cents || 0) / 100;
		try {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: String(currency || 'usd').toUpperCase()
			}).format(amount);
		} catch {
			return `$${amount.toFixed(2)}`;
		}
	}

	function accountingSnapshotDate(value) {
		if (!value) return '';
		const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}
</script>

<svelte:head>
	<title>{seoTitle} | 3 Feet Please</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="website" />
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

<div class="mx-auto w-full max-w-6xl space-y-6 px-4 pb-12">
	<GroupHeroCard
		group={data.group}
		canEdit={data.can_edit}
		{contactLinks}
		{primaryCta}
		membershipCta={headerMembershipCta}
	/>

	<!-- Auth notice -->
	{#if authFlag === 'required' || authFlag === 'forbidden'}
		<section
			class="card border-surface-200-800/40 border p-4 {authFlag === 'required'
				? 'preset-tonal-warning'
				: 'preset-tonal-error'}"
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
						<strong class="font-bold">Please log in to edit this group.</strong>
						<div class="mt-0.5 opacity-80">
							Use the "Log in / Register" button in the header, then try again.
						</div>
					{:else}
						<strong class="font-bold">You don't have permission to edit this group.</strong>
						{#if (data.owners_count ?? 0) === 0}
							<div class="mt-0.5 opacity-80">
								If you represent this group, claim it below to become an owner.
							</div>
						{:else}
							<div class="mt-0.5 opacity-80">Ask an existing owner to add you as an owner.</div>
						{/if}
					{/if}
				</div>
			</div>
		</section>
	{/if}

	{#if followFlag === 'success'}
		<section
			class="card preset-tonal-success border-surface-200-800/40 border p-4"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-start gap-3">
				<IconInfo class="text-success-500 mt-0.5 h-5 w-5 shrink-0" />
				<div class="text-sm">
					<strong class="font-bold">You're now following this group.</strong>
				</div>
			</div>
		</section>
	{:else if followFlag === 'error'}
		<section
			class="card preset-tonal-error border-surface-200-800/40 border p-4"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-start gap-3">
				<IconInfo class="text-error-500 mt-0.5 h-5 w-5 shrink-0" />
				<div class="text-sm">
					<strong class="font-bold">{followMessage || 'Unable to complete follow.'}</strong>
				</div>
			</div>
		</section>
	{/if}

	<!-- Claim banner -->
	{#if !hasOwner}
		<section
			class="card preset-tonal-warning border-surface-200-800/40 flex flex-col gap-4 border p-6 md:flex-row md:items-center md:justify-between"
			in:fade={{ duration: 200 }}
		>
			<div class="flex items-start gap-4">
				<div class="preset-filled-warning-500 rounded-xl p-3 text-white">
					<IconFlag class="h-6 w-6" />
				</div>
				<div>
					<h3 class="text-lg font-bold">This group hasn't been claimed yet</h3>
					<p class="mt-1 text-sm opacity-80">
						If you represent this group, claim it to manage details, photos, and more.
					</p>
				</div>
			</div>
			<div class="flex w-full shrink-0 flex-col gap-2 md:w-auto">
				{#if data.user}
					<button
						class="btn preset-filled-warning-500 w-full font-bold shadow-md md:w-auto"
						onclick={claimGroup}
					>
						Claim Group
					</button>
				{:else}
					<button
						class="btn preset-filled-warning-500 w-full font-bold shadow-md md:w-auto"
						onclick={() => (claimOpen = true)}
					>
						Claim Group
					</button>
				{/if}
			</div>

			<!-- Email form for unauthenticated claim -->
			{#if claimOpen && !data.user}
				<div class="mt-4 w-full" in:slide={{ duration: 180 }}>
					<form
						class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-4 border p-5"
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
						<div>
							<label
								for="claim-email"
								class="mb-1.5 block text-xs font-semibold tracking-wider uppercase opacity-75"
							>
								Log in / Register to continue
							</label>
							<input
								id="claim-email"
								type="email"
								bind:value={claimEmail}
								placeholder="you@example.com"
								class="input"
								required
							/>
						</div>
						{#if claimError}
							<div class="text-error-500 text-xs font-medium">{claimError}</div>
						{/if}
						{#if claimSuccess}
							<div class="text-success-500 text-xs font-medium">{claimSuccess}</div>
						{/if}
						<button
							type="submit"
							class="btn preset-filled-primary-500 w-full font-bold {claimLoading
								? 'animate-pulse'
								: ''} {!claimEmailValid || claimLoading ? 'cursor-not-allowed opacity-50' : ''}"
							disabled={!claimEmailValid || claimLoading}>Send Magic Link</button
						>
					</form>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Sticky subheader (appears after hero scrolls out) -->
	{#if showSticky}
		<div
			class="border-surface-200-800 bg-surface-100-900/90 animate-fade-in sticky top-0 z-40 border-b backdrop-blur-xl"
			in:slide={{ duration: 180, axis: 'y' }}
		>
			<div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
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
						<div class="truncate text-xs opacity-75">
							{#if data.group?.city}{data.group.city},{/if}{data.group?.state_region} · {data.group
								?.country}
						</div>
					</div>
				</div>
				{#if data.is_owner}
					<a
						href={`/groups/${data.group.slug}/manage`}
						class="btn btn-sm preset-filled-primary-500 font-bold"
					>
						Manage Group
					</a>
				{:else if primaryCta}
					<a
						href={primaryCta.href}
						target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
						rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
							? undefined
							: 'noopener noreferrer'}
						class="btn btn-sm preset-filled-primary-500 flex items-center gap-1.5 font-bold"
					>
						{#if primaryCta.key !== 'custom'}
							{@const IconComp3 = ctaIcons[primaryCta.key] || IconLink}
							<IconComp3 class="h-3.5 w-3.5" />
						{/if}
						<span>{primaryCta.label}</span>
					</a>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Sentinel for sticky observer -->
	<div bind:this={heroSentinel}></div>

	<!-- Layout Grid -->
	<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
		<!-- Left / Main Column (spans 2 columns on desktop) -->
		<div class="space-y-6 lg:col-span-2">
			<!-- About Card -->
			<section
				class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
				in:fade={{ duration: 240, delay: 60 }}
			>
				<div
					class="border-surface-200-800/40 flex flex-wrap items-center justify-between gap-3 border-b pb-3"
				>
					<h2 class="flex items-center gap-2 text-xl font-bold">
						About {data.group?.name}
					</h2>
					<!-- Social contact icons -->
					{#if contactLinks.length}
						<div class="flex flex-wrap items-center gap-1">
							{#each contactLinks.slice(0, 6) as c}
								{@const ContactIcon = contactIconByKey[c.key] || IconLink}
								<a
									href={c.href}
									title={c.key}
									target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
									rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
									class="btn btn-sm btn-icon preset-tonal-surface hover:preset-tonal-primary transition-colors"
								>
									<ContactIcon class="h-4 w-4" />
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<!-- About / description -->
				{#if data.group?.description}
					<div>
						<AutoLinkText
							text={data.group.description}
							className={'text-surface-800-200 text-sm leading-relaxed ' +
								(aboutExpanded ? '' : 'line-clamp-5')}
						/>
						{#if data.group.description?.length > 220}
							<button
								type="button"
								class="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 mt-2 text-sm font-semibold transition-colors"
								onclick={() => (aboutExpanded = !aboutExpanded)}
							>
								{aboutExpanded ? 'Show less' : 'Read more'}
							</button>
						{/if}
					</div>
				{/if}

				<!-- Tags list -->
				{#if types.length || audiences.length || disciplines.length || skills.length}
					<div class="border-surface-200-800/40 space-y-4 border-t pt-4">
						{#if types.length}
							<div class="flex flex-wrap gap-1.5">
								{#each types as t}
									<span class={chipFilled(t)}>{t}</span>
								{/each}
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{#if audiences.length}
								<div class="flex items-start gap-2.5">
									<IconUsers class="text-surface-500 mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<span class="text-surface-600 mb-1 block text-xs font-semibold">Audience</span>
										<div class="flex flex-wrap gap-1.5">
											{#each audiences as a}
												<span class="chip preset-tonal-secondary text-xs">{a}</span>
											{/each}
										</div>
									</div>
								</div>
							{/if}

							{#if disciplines.length}
								<div class="flex items-start gap-2.5">
									<IconRepeat class="text-surface-500 mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<span class="text-surface-600 mb-1 block text-xs font-semibold">Discipline</span
										>
										<div class="flex flex-wrap gap-1.5">
											{#each disciplines as d}
												<span class={chipFilled(d)}>{d}</span>
											{/each}
										</div>
									</div>
								</div>
							{/if}

							{#if skills.length}
								<div class="flex items-start gap-2.5">
									<IconDumbbell class="text-surface-500 mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<span class="text-surface-600 mb-1 block text-xs font-semibold"
											>Skill Levels</span
										>
										<div class="flex flex-wrap gap-1.5">
											{#each skills as s}
												<span class="chip preset-tonal-tertiary text-xs">{s}</span>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</section>

			<!-- Financial Snapshot Card (Fixed public accounting snapshot section) -->
			{#if latestAccountingReport}
				{@const snapshot = latestAccountingReport.snapshot ?? {}}
				{@const financialReport = snapshot.report ?? {}}
				{@const visibility = latestAccountingReport.visibility ?? {}}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
					in:fade={{ duration: 220 }}
				>
					<div
						class="border-surface-200-800/40 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-center gap-3">
							<div class="preset-filled-primary-500 rounded-xl p-2.5 text-white">
								<IconWalletCards class="h-5 w-5" />
							</div>
							<div>
								<h2 class="text-xl font-bold">Financial Snapshot</h2>
								<p class="mt-0.5 text-xs opacity-75">
									{latestAccountingReport.title} · {accountingSnapshotDate(
										latestAccountingReport.report_period_start
									)} to {accountingSnapshotDate(latestAccountingReport.report_period_end)}
								</p>
							</div>
						</div>
						<div class="badge preset-tonal-surface px-3 py-1 text-xs font-medium">
							Published {accountingSnapshotDate(latestAccountingReport.published_at)}
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						{#if visibility.cash !== false}
							<div class="card preset-tonal-surface border-surface-200-800/40 border p-4">
								<p class="text-[10px] font-bold tracking-wider uppercase opacity-60">
									Cash position
								</p>
								<p class="mt-1 text-2xl font-black">
									{formatAccountingCents(
										(financialReport.totals?.assets_cents || 0) -
											(financialReport.totals?.liabilities_cents || 0)
									)}
								</p>
							</div>
						{/if}
						{#if visibility.activity !== false}
							<div class="card preset-tonal-success border-surface-200-800/40 border p-4">
								<p class="text-[10px] font-bold tracking-wider uppercase opacity-60">Money in</p>
								<p class="mt-1 text-2xl font-black">
									{formatAccountingCents(financialReport.totals?.income_cents)}
								</p>
							</div>
							<div class="card preset-tonal-error border-surface-200-800/40 border p-4">
								<p class="text-[10px] font-bold tracking-wider uppercase opacity-60">Money out</p>
								<p class="mt-1 text-2xl font-black">
									{formatAccountingCents(financialReport.totals?.expense_cents)}
								</p>
							</div>
						{/if}
					</div>

					{#if visibility.position !== false}
						<div class="grid gap-4 md:grid-cols-2">
							<div class="card preset-tonal-surface border-surface-200-800/40 border p-4">
								<h3
									class="border-surface-200-800/20 text-primary-500 mb-2.5 flex items-center gap-1.5 border-b pb-1.5 text-sm font-bold"
								>
									<span>What we have</span>
								</h3>
								<div class="divide-surface-200-800/10 space-y-1.5 divide-y">
									{#each (financialReport.assets ?? [])
										.filter((account) => account.balance_cents !== 0)
										.slice(0, 6) as account}
										<div class="flex justify-between gap-3 pt-1.5 text-sm">
											<span class="font-medium">{account.name}</span>
											<span class="font-semibold"
												>{formatAccountingCents(account.balance_cents)}</span
											>
										</div>
									{/each}
								</div>
							</div>
							<div class="card preset-tonal-surface border-surface-200-800/40 border p-4">
								<h3
									class="border-surface-200-800/20 text-error-500 mb-2.5 flex items-center gap-1.5 border-b pb-1.5 text-sm font-bold"
								>
									<span>Top spending categories</span>
								</h3>
								<div class="divide-surface-200-800/10 space-y-1.5 divide-y">
									{#each (financialReport.expenses ?? [])
										.filter((account) => account.period_balance_cents > 0)
										.slice(0, 6) as account}
										<div class="flex justify-between gap-3 pt-1.5 text-sm">
											<span class="font-medium">{account.name}</span>
											<span class="font-semibold"
												>{formatAccountingCents(account.period_balance_cents)}</span
											>
										</div>
									{:else}
										<p class="text-sm opacity-60 py-3 text-center">
											No spending shown in this snapshot.
										</p>
									{/each}
								</div>
							</div>
						</div>
					{/if}

					{#if visibility.notes !== false && latestAccountingReport.notes}
						<div
							class="card preset-tonal-surface border-surface-200-800/40 border p-4 text-sm leading-relaxed opacity-90"
						>
							<div class="mb-1 text-xs font-bold tracking-wider uppercase opacity-65">
								Publisher's Notes
							</div>
							{latestAccountingReport.notes}
						</div>
					{/if}

					{#if accountingReports.length > 1}
						<div class="border-surface-200-800/40 border-t pt-3">
							<span class="mb-2 block text-xs font-bold tracking-wider uppercase opacity-60"
								>Past Reports</span
							>
							<div class="flex flex-wrap gap-2">
								{#each accountingReports.slice(1) as report}
									<span
										class="badge preset-tonal-surface border-surface-200-800/30 flex items-center gap-1.5 border px-3 py-1"
									>
										<IconBadgeDollarSign class="h-3.5 w-3.5" />
										{report.title}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Upcoming Rides Section -->
			{#await data.rides then rides}
				{#if Array.isArray(rides) && rides.length > 0}
					<section
						class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
						in:fade={{ duration: 240, delay: 100 }}
					>
						<div class="border-surface-200-800/40 flex items-center justify-between border-b pb-3">
							<div class="flex items-center gap-3">
								<div class="preset-filled-secondary-500 rounded-xl p-2.5 text-white">
									<IconCalendar class="h-5 w-5" />
								</div>
								<div>
									<h2 class="text-xl font-bold">Upcoming Rides</h2>
									<p class="mt-0.5 text-xs opacity-75">Join the group for their next rides</p>
								</div>
							</div>
						</div>

						<ul class="space-y-4">
							{#each rides as event, i}
								<li
									class="card preset-tonal-surface hover:preset-tonal-secondary border-surface-200-800/30 border p-4 transition-all duration-200"
								>
									<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
										<div class="space-y-2">
											<a
												href={`/ride/${event.slug}`}
												class="text-secondary-650 hover:text-secondary-550 dark:text-secondary-400 dark:hover:text-secondary-300 block text-base leading-snug font-bold transition-colors"
											>
												{event.title}
											</a>
											{#if event.summary}
												<AutoLinkText
													text={event.summary}
													className="text-surface-800-200 line-clamp-2 text-sm leading-relaxed"
												/>
											{/if}
											<div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
												<span class="flex items-center gap-1.5 opacity-80">
													<IconCalendar class="h-4 w-4" />
													{new Intl.DateTimeFormat(undefined, {
														dateStyle: 'medium',
														timeStyle: 'short'
													}).format(new Date(event.nextOccurrenceStart))}
												</span>
												<span class="flex items-center gap-1.5 opacity-80">
													<IconMapPin class="h-4 w-4" />
													<AutoLinkText
														text={event.startLocationName || event.startLocationAddress}
													/>
												</span>
											</div>
										</div>
										<div class="mt-2 flex shrink-0 flex-wrap items-center gap-2 md:mt-0">
											<a
												href={`/ride/${event.slug}`}
												class="btn btn-sm preset-outlined-secondary-500 flex items-center gap-1.5 font-semibold"
											>
												View Details
												<IconArrowRight class="h-3.5 w-3.5" />
											</a>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/await}

			<!-- Volunteer Opportunities Section -->
			{#await data.volunteer_events then volunteer_events}
				{#if Array.isArray(volunteer_events) && volunteer_events.length > 0}
					<section
						class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
						in:fade={{ duration: 240, delay: 120 }}
					>
						<div
							class="border-surface-200-800/40 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex items-center gap-3">
								<div class="preset-filled-tertiary-500 rounded-xl p-2.5 text-white">
									<IconHandHeart class="h-5 w-5" />
								</div>
								<div>
									<h2 class="text-xl font-bold">Volunteer Opportunities</h2>
									<p class="mt-0.5 text-xs opacity-75">Support the group by lending a hand</p>
								</div>
							</div>
							<a
								href={`/volunteer/groups/${data.group.slug}`}
								class="btn btn-sm preset-outlined-tertiary-500 self-start font-semibold sm:self-auto"
							>
								All Events <IconArrowRight class="ml-1 h-3.5 w-3.5" />
							</a>
						</div>

						<ul class="space-y-4">
							{#each volunteer_events as event, i}
								<li
									class="card preset-tonal-surface hover:preset-tonal-tertiary border-surface-200-800/30 border p-4 transition-all duration-200"
								>
									<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
										<div class="space-y-2">
											<a
												href={`/volunteer/${event.slug}`}
												class="text-tertiary-650 hover:text-tertiary-550 dark:text-tertiary-400 dark:hover:text-tertiary-300 block text-base leading-snug font-bold transition-colors"
											>
												{event.title}
											</a>
											{#if event.summary}
												<AutoLinkText
													text={event.summary}
													className="text-surface-800-200 line-clamp-2 text-sm leading-relaxed"
												/>
											{/if}
											<div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
												<span class="flex items-center gap-1.5 opacity-80">
													<IconCalendar class="h-4 w-4" />
													{volunteerEventDateRange(event)}
												</span>
												{#if volunteerEventTimeRange(event)}
													<span class="flex items-center gap-1.5 opacity-80">
														<IconClock class="h-4 w-4" />
														{volunteerEventTimeRange(event)}
													</span>
												{/if}
												<span class="flex items-center gap-1.5 opacity-80">
													<IconMapPin class="h-4 w-4" />
													<AutoLinkText text={volunteerEventLocation(event)} />
												</span>
											</div>
										</div>
										<div class="mt-2 flex shrink-0 flex-wrap items-center gap-2 md:mt-0">
											{#if event.can_manage}
												<a
													href={`/volunteer/${event.slug}/edit`}
													class="btn btn-sm preset-outlined-secondary-500 font-semibold"
												>
													Edit
												</a>
												<a
													href={`/volunteer/${event.slug}/manage`}
													class="btn btn-sm preset-tonal-tertiary font-semibold"
												>
													Manage
												</a>
											{:else}
												<a
													href={`/volunteer/${event.slug}`}
													class="btn btn-sm preset-filled-tertiary-500 flex items-center gap-1.5 font-bold shadow"
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
					</section>
				{/if}
			{/await}

			<!-- Latest Updates (News) Section -->
			{#if groupNewsPosts.length}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
					in:fade={{ duration: 240, delay: 70 }}
				>
					<div
						class="border-surface-200-800/40 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-center gap-3">
							<div class="preset-filled-primary-500 rounded-xl p-2.5 text-white">
								<IconNewspaper class="h-5 w-5" />
							</div>
							<div>
								<h2 class="text-xl font-bold">Latest Updates</h2>
								<p class="mt-0.5 text-xs opacity-75">News and announcements</p>
							</div>
						</div>
						<a
							href={`/groups/${data.group.slug}/news`}
							class="btn btn-sm preset-tonal-surface self-start font-semibold sm:self-auto"
						>
							View All <IconArrowRight class="ml-1 h-3.5 w-3.5" />
						</a>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						{#each groupNewsPosts as post}
							<a
								class="card preset-tonal-surface hover:preset-tonal-secondary border-surface-200-800/30 flex flex-col justify-between border p-4 transition-all duration-200"
								href={`/groups/${data.group.slug}/news?open=${post.slug}`}
							>
								<div>
									<div class="text-[10px] font-bold tracking-wider uppercase opacity-60">
										{newsPostDate(post)}
									</div>
									<h3 class="mt-2 text-sm leading-snug font-bold">{post.title}</h3>
									{#if post.preview_text}
										<p class="text-surface-800-200 mt-2 line-clamp-2 text-xs leading-relaxed">
											{post.preview_text}
										</p>
									{/if}
								</div>
								<div
									class="text-secondary-600 dark:text-secondary-400 mt-3.5 flex items-center gap-1 text-xs font-bold"
								>
									Read update
									<IconArrowRight class="h-3.5 w-3.5" />
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Instagram Posts Section -->
			{#if hasPosts}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
					in:fade={{ duration: 240, delay: 80 }}
				>
					<div
						class="border-surface-200-800/40 flex flex-wrap items-center justify-between gap-3 border-b pb-3"
					>
						<div class="flex items-center gap-3">
							<div class="preset-filled-secondary-500 rounded-xl p-2.5 text-white">
								<BrandInstagram class="h-5 w-5 text-white" />
							</div>
							<div>
								<h2 class="text-xl font-bold">Latest Posts</h2>
								{#if connectedInstagramLabel}
									<p class="mt-0.5 text-xs opacity-75">{connectedInstagramLabel}</p>
								{:else}
									<p class="mt-0.5 text-xs opacity-75">Instagram posts</p>
								{/if}
							</div>
						</div>
						{#if instagramPostsSource === 'public_profile'}
							<span class="badge preset-tonal-secondary text-xs">Public profile</span>
						{:else if instagramPostsSource === 'manual'}
							<span class="badge preset-tonal-secondary text-xs">Manual embeds</span>
						{/if}
					</div>

					{#if instagramPosts.length > 0}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
							{#each instagramPosts as post, i (post.id)}
								<article
									class="card preset-tonal-surface hover:preset-tonal-primary border-surface-200-800/30 group flex flex-col overflow-hidden border transition-all duration-200"
								>
									<!-- Media Container -->
									<a
										href={post.permalink}
										target="_blank"
										rel="noopener noreferrer"
										class="Scrim relative block aspect-square w-full overflow-hidden bg-black"
									>
										{#if instagramHasInlineMedia(post)}
											<img
												src={post.media_url}
												alt="Instagram post"
												loading="lazy"
												class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											/>
										{:else}
											<iframe
												src={post.embed_url}
												title="Instagram post"
												loading="lazy"
												referrerpolicy="strict-origin-when-cross-origin"
												allowtransparency="true"
												class="h-full w-full border-0"
											></iframe>
										{/if}
										<!-- Hover overlay -->
										<div
											class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
										>
											<span
												class="bg-secondary-500 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow"
											>
												<BrandInstagram class="h-3.5 w-3.5" />
												View on Instagram
											</span>
										</div>
									</a>

									<!-- Caption & Meta -->
									<div class="flex flex-1 flex-col justify-between p-3.5">
										<p class="text-surface-800-200 line-clamp-2 text-xs leading-relaxed">
											{instagramPostCaption(post)}
										</p>
										<div
											class="border-surface-200-800/10 mt-3 flex items-center justify-between border-t pt-2 text-[10px]"
										>
											<time class="font-semibold opacity-75">
												{instagramPostDate(post)}
											</time>
											<a
												href={post.permalink}
												target="_blank"
												rel="noopener noreferrer"
												class="text-secondary-655 dark:text-secondary-400 flex items-center gap-0.5 font-bold hover:underline"
											>
												Open <IconArrowRight class="h-3 w-3" />
											</a>
										</div>
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="card preset-tonal-surface p-8 text-center text-sm opacity-60">
							No recent posts available yet
						</div>
					{/if}

					{#if instagramProfileUrl}
						<div class="flex justify-center pt-2">
							<a
								href={instagramProfileUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="btn preset-filled-secondary-500 gap-1.5 font-bold"
							>
							<BrandInstagram class="h-4 w-4" />
								View Profile
							</a>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Resources Bucket Section -->
			{#if (data.asset_buckets ?? []).length > 0}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-5 border p-6"
					in:fade={{ duration: 240, delay: 160 }}
				>
					<div class="border-surface-200-800/40 flex items-center gap-3 border-b pb-3">
						<div class="preset-filled-primary-500 rounded-xl p-2.5 text-white">
							<IconFolderOpen class="h-5 w-5" />
						</div>
						<div>
							<h2 class="text-xl font-bold">Resources</h2>
							<p class="mt-0.5 text-xs opacity-75">Photos, documents, and useful links</p>
						</div>
					</div>
					<GroupAssetShowcase slug={data.group?.slug} buckets={data.asset_buckets ?? []} />
				</section>
			{/if}
		</div>

		<!-- Right / Sidebar Column -->
		<div class="space-y-6">
			<!-- Support / Donation Setup Card -->
			{#if canAcceptDonations || shouldShowDonationSetup}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-4 border p-6"
					in:fade={{ duration: 220 }}
				>
					<div class="border-surface-200-800/40 flex items-center gap-3 border-b pb-3">
						<div class="preset-filled-warning-500 rounded-xl p-2.5 text-white">
							<IconHandHeart class="h-5 w-5" />
						</div>
						<div>
							<h2 class="text-xl font-bold">Support {data.group?.name}</h2>
							<p class="mt-0.5 text-xs opacity-75">Lend a hand or make a contribution</p>
						</div>
					</div>

					{#if shouldShowDonationSetup}
						<div class="space-y-3">
							<p class="text-sm leading-relaxed opacity-80">
								Connect Stripe in the edit page to enable donations for this claimed group.
							</p>
							<a
								href={`/groups/${data.group?.slug}/manage/edit`}
								class="btn preset-outlined-primary-500 w-full font-bold"
							>
								Connect Stripe
							</a>
						</div>
					{/if}

					{#if canAcceptDonations}
						<form method="GET" action="/donate" class="space-y-4">
							<input type="hidden" name="group" value={data.group?.slug || ''} />

							<!-- Preset Amount Buttons -->
							<div class="grid grid-cols-4 gap-1.5">
								{#each [10, 25, 50, 100] as preset}
									<button
										type="button"
										class="btn btn-sm font-bold {Number(donationStartAmount) === preset
											? 'preset-filled-primary-500'
											: 'preset-tonal-surface'}"
										onclick={() => (donationStartAmount = preset)}
									>
										${preset}
									</button>
								{/each}
							</div>

							<!-- Custom input + submit -->
							<div class="flex items-center gap-2">
								<div class="relative flex-1">
									<span
										class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-bold opacity-50"
										>$</span
									>
									<input
										type="number"
										min="1"
										max="25000"
										step="1"
										name="amount"
										class="input w-full pl-7 text-center font-bold"
										bind:value={donationStartAmount}
										required
									/>
								</div>
								<button
									type="submit"
									class="btn preset-filled-primary-500 gap-1.5 font-bold shadow-md"
								>
									Donate
									<IconArrowRight class="h-4 w-4" />
								</button>
							</div>
						</form>
					{/if}
				</section>
			{/if}

			<!-- Details & Location Card -->
			{#if hasDetails}
				<section
					class="card preset-filled-surface-100-900 border-surface-200-800/40 space-y-4 border p-6"
					in:fade={{ duration: 240, delay: 140 }}
				>
					<div class="border-surface-200-800/40 flex items-center gap-3 border-b pb-3">
						<div class="preset-filled-primary-500 rounded-xl p-2.5 text-white">
							<IconMapPin class="h-5 w-5" />
						</div>
						<div>
							<h2 class="text-xl font-bold">Details & Location</h2>
							<p class="mt-0.5 text-xs opacity-75">When, where, and how to meet</p>
						</div>
					</div>

					<div class="space-y-4 leading-relaxed">
						{#if data.group?.typical_activity_day_time}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Ride Schedule</span
								>
								<div class="flex items-start gap-2 text-sm font-semibold">
									<IconClock class="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
									<span>{data.group.typical_activity_day_time}</span>
								</div>
							</div>
						{/if}

						{#if data.group?.activity_frequency}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Frequency</span
								>
								<div class="flex items-start gap-2 text-sm font-semibold">
									<IconRepeat class="text-secondary-500 mt-0.5 h-4 w-4 shrink-0" />
									<span>{data.group.activity_frequency}</span>
								</div>
							</div>
						{/if}

						{#if data.group?.specific_meeting_point_address}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Meeting Point</span
								>
								<div class="flex items-start gap-2 text-sm">
									<IconMapPin class="text-secondary-500 mt-0.5 h-4 w-4 shrink-0" />
									<AutoLinkText
										text={data.group.specific_meeting_point_address}
										className="font-semibold"
									/>
								</div>
							</div>
						{/if}

						{#if data.group?.how_to_join_instructions}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1.5 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>How to Join</span
								>
								<AutoLinkText
									text={data.group.how_to_join_instructions}
									className="text-sm whitespace-pre-wrap leading-relaxed block text-surface-800-200"
								/>
							</div>
						{/if}

						{#if data.group?.preferred_contact_method_instructions}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Preferred Contact</span
								>
								<AutoLinkText
									text={data.group.preferred_contact_method_instructions}
									className="text-sm text-surface-800-200 block"
								/>
							</div>
						{/if}

						{#if data.group?.membership_info}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1.5 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Membership Details</span
								>
								<AutoLinkText
									text={data.group.membership_info}
									className="text-sm whitespace-pre-wrap leading-relaxed block text-surface-800-200"
								/>
							</div>
						{/if}

						{#if data.group?.zip_code}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>ZIP / Postal Code</span
								>
								<p class="text-surface-800-200 font-mono text-sm font-bold">
									{data.group.zip_code}
								</p>
							</div>
						{/if}

						{#if data.group?.service_area_description}
							<div class="card preset-tonal-surface border-surface-200-800/30 border p-3.5">
								<span class="mb-1.5 block text-[10px] font-bold tracking-wider uppercase opacity-60"
									>Service Area</span
								>
								<AutoLinkText
									text={data.group.service_area_description}
									className="text-sm whitespace-pre-wrap leading-relaxed block text-surface-800-200"
								/>
							</div>
						{/if}

						{#if hasCoords}
							<div class="border-surface-200-800/40 overflow-hidden rounded-xl border shadow-inner">
								<div bind:this={mapEl} class="z-10 h-56 w-full"></div>
							</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>

{#if followModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		role="button"
		tabindex="0"
		onclick={(event) => {
			if (event.target === event.currentTarget) followModalOpen = false;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') followModalOpen = false;
		}}
	>
		<form
			class="card preset-filled-surface-100-900 border-surface-300-700 w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-2xl"
			onsubmit={sendFollowMagicLink}
		>
			<div>
				<h3 class="text-lg font-bold">Follow {data.group?.name}</h3>
				<p class="mt-1 text-xs leading-relaxed opacity-75">
					Enter your email to log in or create an account. We'll add you as a follower right after
					you open the magic link.
				</p>
			</div>
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase opacity-75">Email address</span>
				<input
					type="email"
					class="input"
					bind:value={followEmail}
					placeholder="you@example.com"
					required
				/>
			</label>
			{#if followError}
				<p class="text-error-500 text-xs font-medium">{followError}</p>
			{/if}
			{#if followSuccess}
				<p class="text-success-500 text-xs font-medium">{followSuccess}</p>
			{/if}
			<div class="flex items-center justify-end gap-2 pt-2">
				<button
					type="button"
					class="btn preset-tonal-surface font-semibold"
					onclick={() => (followModalOpen = false)}
					disabled={followLoading}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="btn preset-filled-primary-500 font-bold"
					disabled={followLoading || !followEmailValid}
				>
					{followLoading ? 'Sending…' : 'Email Me A Login Link'}
				</button>
			</div>
		</form>
	</div>
{/if}

<style>
</style>
