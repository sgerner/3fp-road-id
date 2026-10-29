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
	import BrandInstagram from '#lib/icons/BrandInstagram.svelte';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconBadgeDollarSign from '@lucide/svelte/icons/badge-dollar-sign';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import GroupAssetShowcase from '#lib/components/groups/GroupAssetShowcase.svelte';
	import AutoLinkText from '#lib/components/ui/AutoLinkText.svelte';
	import {
		buildContactLinks,
		selectPrimaryCta,
		CTA_ICON_MAP,
		CONTACT_ICON_MAP
	} from '#lib/groups/contactLinks';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fade, slide } from 'svelte/transition';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '#lib/seo';
	import { ensureLeafletDefaultIcon } from '#lib/map/leaflet';
	import { optimizedImageUrl } from '#lib/media/optimized';

	// UI state
	let showSticky = $state(false);
	let heroSentinel = $state(null);

	// Leaflet map (loaded client-side)
	let L;
	let mapEl = $state(null);
	let map;
	let marker;
	let mapInitialized = $state(false);
	let mapLoadPromise;

	const group = $derived(data.group ?? null);
	const selected = $derived(data.selected ?? {});
	const hasCoords = $derived(Number.isFinite(group?.latitude) && Number.isFinite(group?.longitude));
	const lat = $derived(hasCoords ? Number(group.latitude) : undefined);
	const lng = $derived(hasCoords ? Number(group.longitude) : undefined);

	const coverImage = $derived(
		group?.cover_photo_url
			? optimizedImageUrl(group.cover_photo_url, { width: 1200, height: 736, quality: 68 })
			: ''
	);
	const logoImage = $derived(
		group?.logo_url
			? optimizedImageUrl(group.logo_url, { width: 128, height: 128, quality: 68 })
			: ''
	);

	async function initMap() {
		if (!mapEl || map || mapInitialized) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
		try {
			if (!mapLoadPromise) {
				mapLoadPromise = Promise.all([import('#lib/map/leaflet.css'), import('leaflet')]).then(
					([, mod]) => {
						L = mod.default || mod;
						return L;
					}
				);
			}
			await mapLoadPromise;
			await ensureLeafletDefaultIcon(L);
		} catch (error) {
			console.error('Failed to load Leaflet', error);
			return;
		}
		const z = 12;
		map = L.map(mapEl).setView([lat, lng], z);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		marker = L.marker([lat, lng]).addTo(map);
		mapInitialized = true;
	}

	onMount(() => {
		if (!hasCoords || !mapEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				observer.disconnect();
				void initMap();
			},
			{ rootMargin: '1500px' }
		);
		observer.observe(mapEl);
	});

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
	const hasOwner = $derived(Boolean(data?.is_claimed));
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
	const followFlag = $derived((page.url.searchParams.get('follow') || '').trim());
	const followMessage = $derived((page.url.searchParams.get('follow_msg') || '').trim());

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
	const authFlag = $derived((page && page.url && page.url.searchParams.get('auth')) || '');

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
		buildCanonicalUrl(page.url, ['auth', 'follow', 'follow_msg', 'auto_follow', 'auto_follow_tier'])
	);
	const seoImage = $derived.by(() => {
		const image = data.group?.cover_photo_url || data.group?.logo_url || '';
		if (!image) return '';
		try {
			return new URL(image, page.url.origin).toString();
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
					item: buildAbsoluteUrl(page.url.origin, '/groups')
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
		const numericCents = Number(cents);
		if (!Number.isFinite(numericCents)) return '—';
		const amount = numericCents / 100;
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

	function nonZeroSnapshotAccounts(accounts, centsField) {
		return (Array.isArray(accounts) ? accounts : []).filter(
			(account) => Number(account?.[centsField]) !== 0
		);
	}

	function topSnapshotSpending(accounts) {
		return nonZeroSnapshotAccounts(accounts, 'period_balance_cents')
			.slice()
			.sort((left, right) => Number(right.period_balance_cents) - Number(left.period_balance_cents))
			.slice(0, 6);
	}

	const HeroCtaIcon = $derived(primaryCta ? ctaIcons[primaryCta.key] || IconLink : IconLink);
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

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		bind:this={heroSentinel}
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
		aria-labelledby="group-hero-heading"
	>
		<div
			class="flex flex-col justify-between gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p
					class="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
					<IconMapPin class="h-3.5 w-3.5 shrink-0" />
					<span>
						{#if data.group?.city}{data.group.city},{/if}
						{data.group?.state_region}
						{#if data.group?.state_region && data.group?.country}·{/if}
						{data.group?.country}
					</span>
				</p>

				{#if types.length}
					<div class="flex flex-wrap gap-1.5">
						{#each types.slice(0, 3) as t (t)}
							<span
								class="bg-surface-950 text-primary-500 px-3 py-1 text-[0.65rem] font-black tracking-[0.18em] uppercase"
							>
								{t}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-5">
				<div class="flex items-start gap-5">
					{#if logoImage}
						<div
							class="bg-surface-50 border-surface-950 flex h-16 w-16 shrink-0 items-center justify-center border-[3px] p-1.5 sm:h-20 sm:w-20"
						>
							<img
								src={logoImage}
								alt="{data.group?.name} logo"
								loading="eager"
								class="h-full w-full object-contain"
								width="96"
								height="96"
								decoding="async"
							/>
						</div>
					{/if}
					<h1
						id="group-hero-heading"
						class="text-surface-950! m-0 text-[clamp(2.4rem,6vw,5.4rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
					>
						{data.group?.name}
					</h1>
				</div>

				{#if data.group?.tagline}
					<p class="m-0 max-w-2xl text-lg leading-snug font-medium text-balance sm:text-2xl">
						{data.group.tagline}
					</p>
				{/if}
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				{#if data.can_edit}
					<a
						href={`/groups/${data.group?.slug ?? ''}/manage`}
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
					>
						Manage Group
						<IconArrowRight class="h-5 w-5" />
					</a>
				{:else if primaryCta}
					<a
						href={primaryCta.href}
						target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
						rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
							? undefined
							: 'noopener noreferrer'}
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
					>
						{#if primaryCta.key !== 'custom'}
							<HeroCtaIcon class="h-5 w-5" />
						{/if}
						<span>{primaryCta.label}</span>
					</a>
				{/if}

				{#if headerMembershipCta}
					<a
						href={headerMembershipCta.href}
						onclick={headerMembershipCta.onClick}
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
					>
						{headerMembershipCta.label}
					</a>
				{/if}
			</div>
		</div>

		<div class="bg-surface-950 relative min-h-[20rem] sm:min-h-[26rem]">
			{#if coverImage}
				<img
					src={coverImage}
					alt="{data.group?.name} cover"
					loading="eager"
					fetchpriority="high"
					width="1200"
					height="576"
					decoding="async"
					class="absolute inset-0 h-full w-full object-cover"
				/>
			{:else}
				<div class="bg-secondary-500 absolute inset-0 flex items-center justify-center">
					<span
						class="text-primary-500/25 text-[clamp(6rem,18vw,13rem)] leading-none font-black italic select-none"
						aria-hidden="true"
					>
						3FT
					</span>
				</div>
			{/if}

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

			{#if contactLinks.length}
				<div
					class="bg-surface-950 text-surface-50 absolute right-0 bottom-0 left-12 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:left-16"
				>
					<span class="text-primary-500 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
						Connect
					</span>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each contactLinks.slice(0, 6) as c (c.key)}
							{@const ContactIcon = contactIconByKey[c.key] || IconLink}
							<a
								href={c.href}
								title={c.key}
								target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
								rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
								class="border-surface-700 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 flex h-9 w-9 items-center justify-center border transition hover:no-underline"
							>
								<ContactIcon class="h-4 w-4" />
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Auth notice -->
	{#if authFlag === 'required' || authFlag === 'forbidden'}
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 border-t-[3px] px-6 py-5 sm:px-10 lg:px-14"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-start gap-3">
				<IconInfo class="mt-0.5 h-5 w-5 shrink-0" />
				<div class="text-sm font-medium">
					{#if authFlag === 'required'}
						<strong class="font-black uppercase">Please log in to edit this group.</strong>
						<div class="mt-0.5">
							Use the "Log in / Register" button in the header, then try again.
						</div>
					{:else}
						<strong class="font-black uppercase"
							>You don't have permission to edit this group.</strong
						>
						{#if !data?.is_claimed}
							<div class="mt-0.5">
								If you represent this group, claim it below to become an owner.
							</div>
						{:else}
							<div class="mt-0.5">Ask an existing owner to add you as an owner.</div>
						{/if}
					{/if}
				</div>
			</div>
		</section>
	{/if}

	{#if followFlag === 'success'}
		<section
			class="bg-secondary-500 text-surface-50 border-surface-950 border-t-[3px] px-6 py-5 sm:px-10 lg:px-14"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-center gap-3">
				<IconInfo class="text-primary-500 h-5 w-5 shrink-0" />
				<strong class="text-sm font-black uppercase">You're now following this group.</strong>
			</div>
		</section>
	{:else if followFlag === 'error'}
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 border-t-[3px] px-6 py-5 sm:px-10 lg:px-14"
			in:fade={{ duration: 180 }}
		>
			<div class="flex items-center gap-3">
				<IconInfo class="h-5 w-5 shrink-0" />
				<strong class="text-sm font-black uppercase"
					>{followMessage || 'Unable to complete follow.'}</strong
				>
			</div>
		</section>
	{/if}

	<!-- Claim banner -->
	{#if !hasOwner}
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
			in:fade={{ duration: 200 }}
			aria-labelledby="claim-heading"
		>
			<div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<div class="flex items-start gap-4">
					<div
						class="bg-surface-950 text-tertiary-400 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconFlag class="h-6 w-6" />
					</div>
					<div>
						<h3 id="claim-heading" class="text-surface-950! m-0 text-2xl font-black uppercase">
							This group hasn't been claimed yet
						</h3>
						<p class="m-0 mt-1 text-base font-medium">
							If you represent this group, claim it to manage details, photos, and more.
						</p>
					</div>
				</div>
				<div class="flex shrink-0">
					{#if data.user}
						<button
							type="button"
							class="bg-surface-950 text-tertiary-400 hover:bg-secondary-500 hover:text-surface-50 cursor-pointer px-7 py-4 text-sm font-black tracking-wide uppercase transition"
							onclick={claimGroup}
						>
							Claim Group
						</button>
					{:else}
						<button
							type="button"
							class="bg-surface-950 text-tertiary-400 hover:bg-secondary-500 hover:text-surface-50 cursor-pointer px-7 py-4 text-sm font-black tracking-wide uppercase transition"
							onclick={() => (claimOpen = !claimOpen)}
						>
							Claim Group
						</button>
					{/if}
				</div>
			</div>

			<!-- Email form for unauthenticated claim -->
			{#if claimOpen && !data.user}
				<div class="mt-6" in:slide={{ duration: 180 }}>
					<form
						class="bg-surface-950 text-surface-50 flex max-w-xl flex-col gap-4 p-6"
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
								class="text-primary-500 mb-2 block text-xs font-bold tracking-[0.2em] uppercase"
							>
								Log in / Register to continue
							</label>
							<input
								id="claim-email"
								type="email"
								bind:value={claimEmail}
								placeholder="you@example.com"
								class="bg-surface-900 text-surface-50 border-surface-50 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
								required
							/>
						</div>
						{#if claimError}
							<div class="text-tertiary-400 text-xs font-bold">{claimError}</div>
						{/if}
						{#if claimSuccess}
							<div class="text-primary-500 text-xs font-bold">{claimSuccess}</div>
						{/if}
						<button
							type="submit"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 cursor-pointer px-6 py-3 text-sm font-black tracking-wide uppercase transition {!claimEmailValid ||
							claimLoading
								? 'cursor-not-allowed opacity-50'
								: ''}"
							disabled={!claimEmailValid || claimLoading}
						>
							{claimLoading ? 'Sending…' : 'Send Magic Link'}
						</button>
					</form>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Sticky subheader (appears after hero scrolls out) -->
	{#if showSticky}
		<div
			class="bg-primary-500 text-surface-950 border-surface-950 sticky top-0 z-40 border-b-[3px]"
			in:slide={{ duration: 180, axis: 'y' }}
		>
			<div class="flex items-center justify-between gap-3 px-6 py-3 sm:px-10 lg:px-14">
				<div class="flex min-w-0 items-center gap-3">
					{#if data.group?.logo_url}
						<img
							src={data.group.logo_url}
							alt="{data.group.name} logo"
							class="bg-surface-50 h-8 w-8 object-contain p-0.5"
						/>
					{/if}
					<div class="min-w-0">
						<div class="truncate text-sm font-black uppercase">{data.group?.name}</div>
						<div class="truncate text-xs font-bold uppercase opacity-75">
							{#if data.group?.city}{data.group.city},{/if}{data.group?.state_region} · {data.group
								?.country}
						</div>
					</div>
				</div>
				{#if data.is_owner}
					<a
						href={`/groups/${data.group.slug}/manage`}
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase hover:no-underline"
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
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 flex items-center gap-1.5 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase hover:no-underline"
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

	<!-- ABOUT + DETAILS SPLIT -->
	<section
		class="bg-surface-950 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
		aria-labelledby="about-heading"
	>
		<!-- Left: About & Taxonomy & Support -->
		<div class="flex min-w-0 flex-col gap-10 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Community profile
					</p>
					{#if contactLinks.length}
						<div class="flex flex-wrap items-center gap-1.5">
							{#each contactLinks.slice(0, 6) as c (c.key)}
								{@const ContactIcon = contactIconByKey[c.key] || IconLink}
								<a
									href={c.href}
									title={c.key}
									target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
									rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
									class="border-surface-700 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 flex h-9 w-9 items-center justify-center border-2 transition hover:no-underline"
								>
									<ContactIcon class="h-4 w-4" />
								</a>
							{/each}
						</div>
					{/if}
				</div>
				<h2
					id="about-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					About {data.group?.name}
				</h2>
			</div>

			{#if data.group?.description}
				<div class="border-surface-50 border-t-2 pt-6">
					<AutoLinkText
						text={data.group.description}
						className={'text-surface-200 text-base leading-relaxed ' +
							(aboutExpanded ? '' : 'line-clamp-6')}
					/>
					{#if data.group.description?.length > 220}
						<button
							type="button"
							class="text-primary-500 hover:text-surface-50 mt-3 cursor-pointer text-xs font-black tracking-[0.18em] uppercase"
							onclick={() => (aboutExpanded = !aboutExpanded)}
						>
							{aboutExpanded ? 'Show less' : 'Read more'}
						</button>
					{/if}
				</div>
			{/if}

			{#if types.length || audiences.length || disciplines.length || skills.length}
				<div class="border-surface-800 flex flex-col border-t-2">
					{#if types.length}
						<div
							class="border-surface-800 flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between"
						>
							<span class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
								Community Types
							</span>
							<div class="flex flex-wrap gap-1.5">
								{#each types as t (t)}
									<span
										class="bg-primary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
									>
										{t}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if audiences.length}
						<div
							class="border-surface-800 flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between"
						>
							<span
								class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase"
							>
								<IconUsers class="text-primary-500 h-4 w-4 shrink-0" />
								Audience
							</span>
							<div class="flex flex-wrap gap-1.5">
								{#each audiences as a (a)}
									<span
										class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
									>
										{a}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if disciplines.length}
						<div
							class="border-surface-800 flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between"
						>
							<span
								class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase"
							>
								<IconRepeat class="text-tertiary-500 h-4 w-4 shrink-0" />
								Discipline
							</span>
							<div class="flex flex-wrap gap-1.5">
								{#each disciplines as d (d)}
									<span
										class="bg-tertiary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
									>
										{d}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if skills.length}
						<div
							class="border-surface-800 flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between"
						>
							<span
								class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase"
							>
								<IconDumbbell class="text-primary-500 h-4 w-4 shrink-0" />
								Skill Levels
							</span>
							<div class="flex flex-wrap gap-1.5">
								{#each skills as s (s)}
									<span
										class="border-surface-50 text-surface-50 border px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
									>
										{s}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if canAcceptDonations || shouldShowDonationSetup}
				<div class="bg-primary-500 text-surface-950 flex flex-col gap-5 p-6 sm:p-8">
					<div class="flex items-center gap-3">
						<span
							class="bg-surface-950 text-primary-500 flex h-11 w-11 shrink-0 items-center justify-center"
						>
							<IconHandHeart class="h-5 w-5" />
						</span>
						<div>
							<h3 class="text-surface-950! m-0 text-2xl font-black uppercase">
								Support {data.group?.name}
							</h3>
							<p class="m-0 text-xs font-bold tracking-[0.16em] uppercase">
								Lend a hand or make a contribution
							</p>
						</div>
					</div>

					{#if shouldShowDonationSetup}
						<div class="flex flex-col gap-3">
							<p class="m-0 text-sm leading-relaxed font-medium">
								Connect Stripe in the edit page to enable donations for this claimed group.
							</p>
							<a
								href={`/groups/${data.group?.slug}/manage/edit`}
								class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 self-start px-6 py-3 text-sm font-black uppercase transition hover:no-underline"
							>
								Connect Stripe
							</a>
						</div>
					{/if}

					{#if canAcceptDonations}
						<form method="GET" action="/donate" class="flex flex-col gap-4">
							<input type="hidden" name="group" value={data.group?.slug || ''} />

							<div class="grid grid-cols-4 gap-2">
								{#each [10, 25, 50, 100] as preset (preset)}
									<button
										type="button"
										class="cursor-pointer py-3 text-sm font-black uppercase transition {Number(
											donationStartAmount
										) === preset
											? 'bg-surface-950 text-primary-500'
											: 'border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 border-2'}"
										onclick={() => (donationStartAmount = preset)}
									>
										${preset}
									</button>
								{/each}
							</div>

							<div class="flex items-stretch gap-2">
								<div class="border-surface-950 bg-surface-50 relative flex-1 border-[3px]">
									<span
										class="text-surface-950 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-black"
										>$</span
									>
									<input
										type="number"
										min="1"
										max="25000"
										step="1"
										name="amount"
										class="text-surface-950 h-full w-full border-0 bg-transparent py-3 pr-3 pl-7 text-center text-base font-black focus:outline-none"
										bind:value={donationStartAmount}
										required
									/>
								</div>
								<button
									type="submit"
									class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex cursor-pointer items-center gap-2 px-7 py-3 text-sm font-black uppercase transition"
								>
									Donate
									<IconArrowRight class="h-4 w-4" />
								</button>
							</div>
						</form>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: Details & Location -->
		<aside
			class="bg-secondary-500 text-surface-50 flex min-w-0 flex-col justify-between gap-8 px-6 py-12 sm:px-10 lg:px-12 lg:py-16"
			aria-label="Details and location"
		>
			<div class="flex flex-col gap-6">
				<div>
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						When, where & how to meet
					</p>
					<h2 class="text-surface-50! m-0 mt-2 text-3xl font-black uppercase italic sm:text-4xl">
						Details & Location
					</h2>
				</div>

				{#if hasDetails}
					<div class="border-surface-50 flex flex-col border-t-2">
						{#if data.group?.typical_activity_day_time}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Ride Schedule
								</span>
								<div class="flex items-start gap-2 text-base font-bold">
									<IconClock class="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
									<span>{data.group.typical_activity_day_time}</span>
								</div>
							</div>
						{/if}

						{#if data.group?.activity_frequency}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Frequency
								</span>
								<div class="flex items-start gap-2 text-base font-bold">
									<IconRepeat class="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
									<span>{data.group.activity_frequency}</span>
								</div>
							</div>
						{/if}

						{#if data.group?.specific_meeting_point_address}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Meeting Point
								</span>
								<div class="flex items-start gap-2 text-sm">
									<IconMapPin class="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
									<AutoLinkText
										text={data.group.specific_meeting_point_address}
										className="font-bold"
									/>
								</div>
							</div>
						{/if}

						{#if data.group?.how_to_join_instructions}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1.5 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									How to Join
								</span>
								<AutoLinkText
									text={data.group.how_to_join_instructions}
									className="text-sm whitespace-pre-wrap leading-relaxed block"
								/>
							</div>
						{/if}

						{#if data.group?.preferred_contact_method_instructions}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Preferred Contact
								</span>
								<AutoLinkText
									text={data.group.preferred_contact_method_instructions}
									className="text-sm block"
								/>
							</div>
						{/if}

						{#if data.group?.membership_info}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1.5 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Membership Details
								</span>
								<AutoLinkText
									text={data.group.membership_info}
									className="text-sm whitespace-pre-wrap leading-relaxed block"
								/>
							</div>
						{/if}

						{#if data.group?.zip_code}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									ZIP / Postal Code
								</span>
								<p class="m-0 font-mono text-sm font-black">{data.group.zip_code}</p>
							</div>
						{/if}

						{#if data.group?.service_area_description}
							<div class="border-surface-50/25 border-b py-4">
								<span
									class="text-primary-500 mb-1.5 block text-[0.68rem] font-bold tracking-[0.2em] uppercase"
								>
									Service Area
								</span>
								<AutoLinkText
									text={data.group.service_area_description}
									className="text-sm whitespace-pre-wrap leading-relaxed block"
								/>
							</div>
						{/if}
					</div>
				{:else}
					<p class="m-0 text-sm opacity-85">
						Check the group's links or reach out directly for meeting times and routes.
					</p>
				{/if}
			</div>

			{#if hasCoords}
				<div class="border-surface-950 border-[3px]">
					<div bind:this={mapEl} class="z-10 h-60 w-full"></div>
				</div>
			{/if}
		</aside>
	</section>

	<!-- UPCOMING RIDES -->
	{#await data.rides then rides}
		{#if Array.isArray(rides) && rides.length > 0}
			<section
				class="bg-primary-500 text-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				aria-labelledby="group-rides-heading"
				in:fade={{ duration: 240 }}
			>
				<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
							<IconCalendar class="h-4 w-4" /> Roll out together
						</p>
						<h2
							id="group-rides-heading"
							class="text-surface-950! m-0 mt-2 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
						>
							Upcoming Rides
						</h2>
					</div>
				</div>

				<ol class="border-surface-950 m-0 list-none border-t-[3px] p-0">
					{#each rides as event, i (event.slug ?? i)}
						<li class="border-surface-950/25 border-b-2 py-6">
							<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
								<div class="flex items-start gap-5">
									<span
										class="text-secondary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-4xl"
									>
										{String(i + 1).padStart(2, '0')}
									</span>
									<div class="flex flex-col gap-2">
										<a
											href={`/ride/${event.slug}`}
											class="text-surface-950 hover:text-secondary-500 text-xl leading-tight font-black uppercase sm:text-2xl"
										>
											{event.title}
										</a>
										{#if event.summary}
											<AutoLinkText
												text={event.summary}
												className="line-clamp-2 text-sm font-medium leading-relaxed"
											/>
										{/if}
										<div
											class="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs font-bold uppercase"
										>
											<span class="flex items-center gap-1.5">
												<IconCalendar class="h-4 w-4" />
												{new Intl.DateTimeFormat(undefined, {
													dateStyle: 'medium',
													timeStyle: 'short'
												}).format(new Date(event.nextOccurrenceStart))}
											</span>
											<span class="flex items-center gap-1.5">
												<IconMapPin class="h-4 w-4" />
												<AutoLinkText
													text={event.startLocationName || event.startLocationAddress}
												/>
											</span>
										</div>
									</div>
								</div>
								<div class="shrink-0 pl-15 md:pl-0">
									<a
										href={`/ride/${event.slug}`}
										class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-6 py-3 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
									>
										View Details
										<IconArrowRight class="h-4 w-4" />
									</a>
								</div>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	{/await}

	<!-- VOLUNTEER OPPORTUNITIES -->
	{#await data.volunteer_events then volunteer_events}
		{#if Array.isArray(volunteer_events) && volunteer_events.length > 0}
			<section
				class="bg-tertiary-500 text-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				aria-labelledby="group-volunteer-heading"
				in:fade={{ duration: 240 }}
			>
				<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
							<IconHandHeart class="h-4 w-4" /> Pitch in
						</p>
						<h2
							id="group-volunteer-heading"
							class="text-surface-950! m-0 mt-2 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
						>
							Volunteer Opportunities
						</h2>
					</div>
					<a
						href={`/volunteer/groups/${data.group.slug}`}
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-tertiary-400 inline-flex items-center gap-2 border-[3px] px-6 py-3 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
					>
						All Events <IconArrowRight class="h-4 w-4" />
					</a>
				</div>

				<ol class="border-surface-950 m-0 list-none border-t-[3px] p-0">
					{#each volunteer_events as event, i (event.slug ?? i)}
						<li class="border-surface-950/25 border-b-2 py-6">
							<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
								<div class="flex items-start gap-5">
									<span
										class="text-surface-950 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-4xl"
									>
										{String(i + 1).padStart(2, '0')}
									</span>
									<div class="flex flex-col gap-2">
										<a
											href={`/volunteer/${event.slug}`}
											class="text-surface-950 hover:text-secondary-500 text-xl leading-tight font-black uppercase sm:text-2xl"
										>
											{event.title}
										</a>
										{#if event.summary}
											<AutoLinkText
												text={event.summary}
												className="line-clamp-2 text-sm font-medium leading-relaxed"
											/>
										{/if}
										<div
											class="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs font-bold uppercase"
										>
											<span class="flex items-center gap-1.5">
												<IconCalendar class="h-4 w-4" />
												{volunteerEventDateRange(event)}
											</span>
											{#if volunteerEventTimeRange(event)}
												<span class="flex items-center gap-1.5">
													<IconClock class="h-4 w-4" />
													{volunteerEventTimeRange(event)}
												</span>
											{/if}
											<span class="flex items-center gap-1.5">
												<IconMapPin class="h-4 w-4" />
												<AutoLinkText text={volunteerEventLocation(event)} />
											</span>
										</div>
									</div>
								</div>
								<div class="flex shrink-0 flex-wrap items-center gap-2 pl-15 md:pl-0">
									{#if event.can_manage}
										<a
											href={`/volunteer/${event.slug}/edit`}
											class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-tertiary-400 border-2 px-5 py-2.5 text-xs font-black uppercase hover:no-underline"
										>
											Edit
										</a>
										<a
											href={`/volunteer/${event.slug}/manage`}
											class="bg-surface-950 text-tertiary-400 hover:bg-secondary-500 hover:text-surface-50 px-5 py-2.5 text-xs font-black uppercase hover:no-underline"
										>
											Manage
										</a>
									{:else}
										<a
											href={`/volunteer/${event.slug}`}
											class="bg-surface-950 text-tertiary-400 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-6 py-3 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
										>
											Volunteer
											<IconArrowRight class="h-4 w-4" />
										</a>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	{/await}

	<!-- FINANCIAL SNAPSHOT -->
	{#if latestAccountingReport}
		{@const snapshot = latestAccountingReport.snapshot ?? {}}
		{@const financialReport = snapshot.report ?? {}}
		{@const snapshotCurrency =
			snapshot.currency ?? financialReport.currency ?? data.accounting_currency ?? 'usd'}
		{@const retainedActivityCents =
			Number(financialReport.totals?.equity_cents || 0) -
			(financialReport.equity ?? []).reduce(
				(sum, account) => sum + Number(account.balance_cents || 0),
				0
			)}
		{@const visibility = latestAccountingReport.visibility ?? {}}
		<section
			class="bg-surface-950 text-surface-50 border-surface-800 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="financial-heading"
			in:fade={{ duration: 220 }}
		>
			<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div class="flex items-center gap-4">
					<span
						class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconWalletCards class="h-6 w-6" />
					</span>
					<div>
						<h2
							id="financial-heading"
							class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl"
						>
							Financial Snapshot
						</h2>
						<p class="text-surface-300 m-0 mt-1 text-xs font-bold tracking-[0.16em] uppercase">
							{latestAccountingReport.title} · {accountingSnapshotDate(
								latestAccountingReport.report_period_start
							)} to {accountingSnapshotDate(latestAccountingReport.report_period_end)}
						</p>
					</div>
				</div>
				{#if latestAccountingReport.slug}
					<a
						class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase transition hover:no-underline"
						href="/groups/{data.group?.slug}/reports/{latestAccountingReport.slug}"
					>
						Published {accountingSnapshotDate(latestAccountingReport.published_at)}
						<IconExternalLink class="h-3.5 w-3.5" />
						<span class="sr-only">Open published financial snapshot</span>
					</a>
				{:else}
					<div class="border-surface-700 border px-4 py-2 text-xs font-bold uppercase">
						Published {accountingSnapshotDate(latestAccountingReport.published_at)}
					</div>
				{/if}
			</div>

			<div
				class="mb-8 grid gap-4 {visibility.cash !== false && visibility.activity !== false
					? 'md:grid-cols-3'
					: visibility.cash !== false
						? 'max-w-xl'
						: 'max-w-2xl md:grid-cols-2'}"
			>
				{#if visibility.cash !== false}
					<div class="bg-primary-500 text-surface-950 p-6">
						<p class="m-0 text-xs font-bold tracking-[0.2em] uppercase">Net position</p>
						<p class="m-0 mt-2 text-3xl font-black italic tabular-nums">
							{formatAccountingCents(
								(financialReport.totals?.assets_cents || 0) -
									(financialReport.totals?.liabilities_cents || 0),
								snapshotCurrency
							)}
						</p>
					</div>
				{/if}
				{#if visibility.activity !== false}
					<div class="bg-secondary-500 text-surface-50 p-6">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.2em] uppercase">
							Money in
						</p>
						<p class="m-0 mt-2 text-3xl font-black italic tabular-nums">
							{formatAccountingCents(financialReport.totals?.income_cents, snapshotCurrency)}
						</p>
					</div>
					<div class="bg-tertiary-500 text-surface-950 p-6">
						<p class="m-0 text-xs font-bold tracking-[0.2em] uppercase">Money out</p>
						<p class="m-0 mt-2 text-3xl font-black italic tabular-nums">
							{formatAccountingCents(financialReport.totals?.expense_cents, snapshotCurrency)}
						</p>
					</div>
				{/if}
			</div>

			{#if visibility.position !== false}
				<div
					class="mb-8 grid gap-8 {visibility.activity !== false
						? 'md:grid-cols-2'
						: 'md:grid-cols-3'}"
				>
					<div class="border-surface-800 border-t-2 pt-4">
						<h3 class="text-primary-500! m-0 mb-3 text-base font-black uppercase">What we have</h3>
						<div class="flex flex-col">
							{#each nonZeroSnapshotAccounts(financialReport.assets, 'balance_cents').slice(0, 6) as account (account.name)}
								<div class="border-surface-800 flex justify-between gap-3 border-b py-2.5 text-sm">
									<span class="font-medium">{account.name}</span>
									<span class="font-black tabular-nums"
										>{formatAccountingCents(account.balance_cents, snapshotCurrency)}</span
									>
								</div>
							{:else}
								<p class="text-surface-300 m-0 py-3 text-sm">No asset balances in this snapshot.</p>
							{/each}
						</div>
					</div>

					<div class="border-surface-800 border-t-2 pt-4">
						<h3 class="text-tertiary-500! m-0 mb-3 text-base font-black uppercase">What we owe</h3>
						<div class="flex flex-col">
							{#each nonZeroSnapshotAccounts(financialReport.liabilities, 'balance_cents').slice(0, 6) as account (account.name)}
								<div class="border-surface-800 flex justify-between gap-3 border-b py-2.5 text-sm">
									<span class="font-medium">{account.name}</span>
									<span class="font-black tabular-nums"
										>{formatAccountingCents(account.balance_cents, snapshotCurrency)}</span
									>
								</div>
							{:else}
								<p class="text-surface-300 m-0 py-3 text-sm">No liabilities in this snapshot.</p>
							{/each}
						</div>
						<div class="mt-3 flex items-center justify-between pt-2 text-sm font-black uppercase">
							<span>Total liabilities</span>
							<span
								>{formatAccountingCents(
									financialReport.totals?.liabilities_cents,
									snapshotCurrency
								)}</span
							>
						</div>
					</div>

					<div class="border-surface-800 border-t-2 pt-4">
						<h3 class="text-primary-500! m-0 mb-3 text-base font-black uppercase">Equity</h3>
						<div class="flex flex-col">
							{#each nonZeroSnapshotAccounts(financialReport.equity, 'balance_cents').slice(0, 6) as account (account.name)}
								<div class="border-surface-800 flex justify-between gap-3 border-b py-2.5 text-sm">
									<span class="font-medium">{account.name}</span>
									<span class="font-black tabular-nums"
										>{formatAccountingCents(account.balance_cents, snapshotCurrency)}</span
									>
								</div>
							{:else}
								<p class="text-surface-300 m-0 py-3 text-sm">
									No equity accounts in this snapshot.
								</p>
							{/each}
							{#if retainedActivityCents !== 0}
								<div class="border-surface-800 flex justify-between gap-3 border-b py-2.5 text-sm">
									<span class="font-medium">Retained activity</span>
									<span class="font-black tabular-nums"
										>{formatAccountingCents(retainedActivityCents, snapshotCurrency)}</span
									>
								</div>
							{/if}
						</div>
						<div class="mt-3 flex items-center justify-between pt-2 text-sm font-black uppercase">
							<span>Total equity</span>
							<span
								>{formatAccountingCents(
									financialReport.totals?.equity_cents,
									snapshotCurrency
								)}</span
							>
						</div>
					</div>
				</div>
			{/if}

			{#if visibility.activity !== false}
				<div class="border-surface-800 mb-8 border-t-2 pt-4">
					<h3 class="text-tertiary-500! m-0 mb-3 text-base font-black uppercase">
						Top spending categories
					</h3>
					<div class="flex flex-col">
						{#each topSnapshotSpending(financialReport.expenses) as account (account.name)}
							<div class="border-surface-800 flex justify-between gap-3 border-b py-2.5 text-sm">
								<span class="font-medium">{account.name}</span>
								<span class="font-black tabular-nums"
									>{formatAccountingCents(account.period_balance_cents, snapshotCurrency)}</span
								>
							</div>
						{:else}
							<p class="text-surface-300 m-0 py-3 text-sm">
								No spending or refunds shown in this snapshot.
							</p>
						{/each}
					</div>
				</div>
			{/if}

			{#if visibility.notes !== false && latestAccountingReport.notes}
				<div class="border-primary-500 bg-surface-900 mb-8 border-l-4 p-5 text-sm leading-relaxed">
					<div class="text-primary-500 mb-1 text-xs font-bold tracking-[0.2em] uppercase">
						Publisher's Notes
					</div>
					{latestAccountingReport.notes}
				</div>
			{/if}

			{#if accountingReports.length > 1}
				<div class="border-surface-800 border-t pt-4">
					<span class="text-surface-300 mb-3 block text-xs font-bold tracking-[0.2em] uppercase">
						Past Reports
					</span>
					<div class="flex flex-wrap gap-2">
						{#each accountingReports.slice(1) as report (report.slug ?? report.title)}
							{#if report.slug}
								<a
									class="border-surface-700 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-4 py-2 text-xs font-black uppercase transition hover:no-underline"
									href="/groups/{data.group?.slug}/reports/{report.slug}"
									aria-label="Open financial snapshot: {report.title}"
								>
									<IconBadgeDollarSign class="h-4 w-4" />
									{report.title}
								</a>
							{:else}
								<span
									class="border-surface-700 inline-flex items-center gap-2 border px-4 py-2 text-xs font-bold uppercase"
								>
									<IconBadgeDollarSign class="h-4 w-4" />
									{report.title}
								</span>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- LATEST UPDATES (NEWS) -->
	{#if groupNewsPosts.length}
		<section
			class="bg-secondary-500 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="news-heading"
			in:fade={{ duration: 240 }}
		>
			<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div>
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconNewspaper class="h-4 w-4" /> News & announcements
					</p>
					<h2
						id="news-heading"
						class="text-surface-50! m-0 mt-2 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
					>
						Latest Updates
					</h2>
				</div>
				<a
					href={`/groups/${data.group.slug}/news`}
					class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex items-center gap-2 border-[3px] px-6 py-3 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
				>
					View All <IconArrowRight class="h-4 w-4" />
				</a>
			</div>

			<div class="grid gap-6 md:grid-cols-3">
				{#each groupNewsPosts as post, i (post.slug ?? i)}
					<a
						class="group bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex flex-col justify-between gap-6 p-6 transition hover:no-underline"
						href={`/groups/${data.group.slug}/news?open=${post.slug}`}
					>
						<div class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<span
									class="text-tertiary-500 group-hover:text-secondary-500 text-2xl font-black italic tabular-nums"
								>
									{String(i + 1).padStart(2, '0')}
								</span>
								<span class="text-xs font-bold tracking-[0.18em] uppercase opacity-75">
									{newsPostDate(post)}
								</span>
							</div>
							<h3
								class="text-surface-50! group-hover:text-surface-950! m-0 text-xl leading-snug font-black uppercase"
							>
								{post.title}
							</h3>
							{#if post.preview_text}
								<p class="m-0 line-clamp-3 text-sm leading-relaxed opacity-85">
									{post.preview_text}
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-2 text-xs font-black tracking-[0.18em] uppercase">
							Read update
							<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- INSTAGRAM POSTS -->
	{#if hasPosts}
		<section
			class="bg-surface-950 text-surface-50 border-surface-800 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="instagram-heading"
			in:fade={{ duration: 240 }}
		>
			<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div class="flex items-center gap-4">
					<span
						class="bg-tertiary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<BrandInstagram class="h-6 w-6" />
					</span>
					<div>
						<h2
							id="instagram-heading"
							class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl"
						>
							Latest Posts
						</h2>
						{#if connectedInstagramLabel}
							<p class="text-primary-500 m-0 mt-1 text-xs font-bold tracking-[0.2em] uppercase">
								{connectedInstagramLabel}
							</p>
						{:else}
							<p class="text-surface-300 m-0 mt-1 text-xs font-bold tracking-[0.2em] uppercase">
								Instagram posts
							</p>
						{/if}
					</div>
				</div>
				{#if instagramPostsSource === 'public_profile'}
					<span
						class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
					>
						Public profile
					</span>
				{:else if instagramPostsSource === 'manual'}
					<span
						class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
					>
						Manual embeds
					</span>
				{/if}
			</div>

			{#if instagramPosts.length > 0}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
					{#each instagramPosts as post (post.id)}
						<article
							class="border-surface-800 bg-surface-900 group flex flex-col justify-between border-2"
						>
							<a
								href={post.permalink}
								target="_blank"
								rel="noopener noreferrer"
								class="border-surface-800 relative block aspect-square w-full overflow-hidden border-b-2 bg-black"
							>
								{#if instagramHasInlineMedia(post)}
									<img
										src={post.media_url}
										alt="Instagram post"
										loading="lazy"
										class="h-full w-full object-cover"
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
								<div
									class="bg-surface-950/80 absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100"
								>
									<span
										class="bg-primary-500 text-surface-950 inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase"
									>
										<BrandInstagram class="h-4 w-4" />
										View on Instagram
									</span>
								</div>
							</a>

							<div class="flex flex-1 flex-col justify-between gap-4 p-4">
								<p class="text-surface-200 m-0 line-clamp-2 text-xs leading-relaxed">
									{instagramPostCaption(post)}
								</p>
								<div
									class="border-surface-800 flex items-center justify-between border-t pt-3 text-xs font-bold uppercase"
								>
									<time class="text-surface-300">
										{instagramPostDate(post)}
									</time>
									<a
										href={post.permalink}
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary-500 hover:text-surface-50 flex items-center gap-1 font-black"
									>
										Open <IconArrowRight class="h-3.5 w-3.5" />
									</a>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="border-surface-800 border-2 p-8 text-center text-sm font-bold uppercase">
					No recent posts available yet
				</div>
			{/if}

			{#if instagramProfileUrl}
				<div class="mt-8 flex justify-start">
					<a
						href={instagramProfileUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-7 py-4 text-sm font-black uppercase transition hover:no-underline"
					>
						<BrandInstagram class="h-4 w-4" />
						View Profile
					</a>
				</div>
			{/if}
		</section>
	{/if}

	<!-- RESOURCES BUCKET SECTION -->
	{#if (data.asset_buckets ?? []).length > 0}
		<section
			class="bg-surface-950 text-surface-50 border-surface-800 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="resources-heading"
			in:fade={{ duration: 240 }}
		>
			<div class="mb-8 flex items-center gap-4">
				<span
					class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
				>
					<IconFolderOpen class="h-6 w-6" />
				</span>
				<div>
					<h2
						id="resources-heading"
						class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl"
					>
						Resources
					</h2>
					<p class="text-surface-300 m-0 mt-1 text-xs font-bold tracking-[0.2em] uppercase">
						Photos, documents, and useful links
					</p>
				</div>
			</div>
			<GroupAssetShowcase slug={data.group?.slug} buckets={data.asset_buckets ?? []} />
		</section>
	{/if}
</div>

{#if followModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
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
			class="bg-surface-950 text-surface-50 border-primary-500 flex w-full max-w-md flex-col gap-5 border-[3px] p-6"
			onsubmit={sendFollowMagicLink}
		>
			<div>
				<h3 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
					Follow {data.group?.name}
				</h3>
				<p class="text-surface-300 m-0 mt-2 text-xs leading-relaxed">
					Enter your email to log in or create an account. We'll add you as a follower right after
					you open the magic link.
				</p>
			</div>
			<label class="flex flex-col gap-2">
				<span class="text-primary-500 text-xs font-bold tracking-[0.2em] uppercase"
					>Email address</span
				>
				<input
					type="email"
					class="bg-surface-900 text-surface-50 border-surface-50 border-2 px-4 py-3 text-sm font-medium focus:outline-none"
					bind:value={followEmail}
					placeholder="you@example.com"
					required
				/>
			</label>
			{#if followError}
				<p class="text-tertiary-400 m-0 text-xs font-bold">{followError}</p>
			{/if}
			{#if followSuccess}
				<p class="text-primary-500 m-0 text-xs font-bold">{followSuccess}</p>
			{/if}
			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 cursor-pointer border-2 px-5 py-2.5 text-xs font-black uppercase transition"
					onclick={() => (followModalOpen = false)}
					disabled={followLoading}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 cursor-pointer px-5 py-2.5 text-xs font-black uppercase transition disabled:opacity-50"
					disabled={followLoading || !followEmailValid}
				>
					{followLoading ? 'Sending…' : 'Email Me A Login Link'}
				</button>
			</div>
		</form>
	</div>
{/if}
