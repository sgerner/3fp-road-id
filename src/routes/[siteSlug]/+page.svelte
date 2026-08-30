<script>
	import { onMount } from 'svelte';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import BrandInstagram from '$lib/icons/BrandInstagram.svelte';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconImage from '@lucide/svelte/icons/image';
	import IconHelpCircle from '@lucide/svelte/icons/circle-help';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { CONTACT_ICON_MAP } from '$lib/groups/contactLinks';
	import { optimizedImageUrl } from '$lib/media/optimized';
	import { LAZY_IMAGE_PLACEHOLDER, lazyImage } from '$lib/media/lazyImage';
	import { getGroupSiteBlockTone } from '$lib/microsites/blocks';
	import {
		THREE_FEET_LAWS,
		THREE_FEET_LAWS_LAST_REVIEWED,
		THREE_FEET_LAWS_SOURCE_FILE,
		THREE_FEET_LAW_STATUS_LABELS
	} from '$lib/microsites/laws';
	import { fade, scale } from 'svelte/transition';
	import { slide } from 'svelte/transition';
	let { data } = $props();
	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const heroImageHref = $derived(
		optimizedImageUrl(group?.cover_photo_url, { width: 1600, quality: 58 })
	);
	const heroImageSrcSet = $derived(
		group?.cover_photo_url
			? `${optimizedImageUrl(group.cover_photo_url, { width: 480, quality: 46 })} 480w, ${optimizedImageUrl(group.cover_photo_url, { width: 800, quality: 50 })} 800w, ${heroImageHref} 1600w`
			: ''
	);
	const heroImageMobileSrcSet = $derived(
		group?.cover_photo_url
			? `${optimizedImageUrl(group.cover_photo_url, { width: 480, quality: 46 })} 480w, ${optimizedImageUrl(group.cover_photo_url, { width: 640, quality: 50 })} 640w`
			: ''
	);
	const heroImageSmallSrcSet = $derived(
		group?.cover_photo_url
			? `${optimizedImageUrl(group.cover_photo_url, { width: 480, quality: 46 })} 480w`
			: ''
	);
	const logoImageHref = $derived(optimizedImageUrl(group?.logo_url, { width: 128, quality: 58 }));
	const currentPage = $derived(
		data.currentPage || config?.site_pages?.find((page) => page.is_home) || config?.site_pages?.[0]
	);
	const pageBlocks = $derived(currentPage?.blocks || config?.page_blocks || []);
	const heroBlock = $derived(pageBlocks.find((block) => block.type === 'hero') || null);
	const isAdvocacySite = $derived(group?.slug === '3-feet-please');
	const heroTitle = $derived(
		currentPage?.is_home && isAdvocacySite && heroBlock?.title
			? heroBlock.title
			: currentPage?.is_home
				? config?.site_title
				: currentPage?.title || config?.site_title
	);
	const heroTagline = $derived(
		currentPage?.is_home ? config?.site_tagline : currentPage?.description || config?.site_tagline
	);
	const heroStyle = $derived(config?.hero_style || 'immersive');
	const panelStyle = $derived(config?.panel_style || 'glass');
	const panelTone = $derived(config?.panel_tone || 'surface');
	const pageStyleClass = $derived(`hero-mode-${heroStyle} panel-${panelStyle} tone-${panelTone}`);
	const taxonomy = $derived(site.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const basePath = $derived(site.basePath || '');
	const groupPageHref = $derived(`/groups/${group.slug}`);
	const galleryHref = $derived(basePath ? `${basePath}/gallery` : '/gallery');
	const showNotice = $derived(Boolean(site.announcementIsActive && config.microsite_notice));
	const hasNewRiderNote = $derived(Boolean((config?.new_rider_note || '').trim()));
	const location = $derived([group?.city, group?.state_region].filter(Boolean).join(', ') || null);
	const mapsHref = $derived.by(() => {
		const lat = Number(group?.latitude);
		const lng = Number(group?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
	});
	const donateAmountPresets = [10, 25, 50, 100];
	let donateAmount = $state(25);
	let signupFirstName = $state('');
	let signupEmail = $state('');
	let signupConsent = $state(false);
	let signupState = $state('idle');
	let signupMessage = $state('');
	let signupCompany = $state('');
	async function subscribeToGroupEmails(event) {
		event.preventDefault();
		if (signupState === 'submitting') return;
		signupState = 'submitting';
		signupMessage = '';
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(group.slug)}/email/subscribe`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						first_name: signupFirstName,
						email: signupEmail,
						consent: signupConsent,
						company: signupCompany
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'Unable to sign up.');
			signupState = 'success';
			signupMessage = payload.message || "You're signed up.";
			signupEmail = '';
			signupConsent = false;
		} catch (error) {
			signupState = 'error';
			signupMessage = error?.message || 'Unable to sign up. Please try again.';
		}
	}
	// Lightbox state
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let lightboxItems = $state([]);
	// Gallery images (first 4 only)
	const galleryImages = $derived(site.photoBucket?.image_assets?.slice(0, 3) || []);
	// Instagram posts
	let deferredInstagramPosts = $state([]);
	const instagramPosts = $derived(
		(site.instagramPosts?.length ? site.instagramPosts : deferredInstagramPosts).slice(0, 3)
	);
	const hasInstagramPosts = $derived(instagramPosts.length > 0);

	onMount(() => {
		if (site.instagramPosts?.length || !pageBlocks.some((block) => block.type === 'gallery')) {
			return;
		}

		let cancelled = false;
		let started = false;
		let observer;
		let idleHandle;
		let timeoutHandle;
		const loadDeferredInstagram = async () => {
			if (started) return;
			started = true;
			try {
				const response = await fetch(
					`/api/groups/${encodeURIComponent(group.slug)}/site/instagram`
				);
				const payload = await response.json().catch(() => ({}));
				if (!cancelled && response.ok) {
					deferredInstagramPosts = payload.data?.instagramPosts || [];
				}
			} catch {
				// Social content is optional; the page remains complete without it.
			}
		};

		const startWhenGalleryIsNear = () => {
			if ('requestIdleCallback' in window) {
				idleHandle = window.requestIdleCallback(loadDeferredInstagram, { timeout: 1200 });
			} else {
				timeoutHandle = window.setTimeout(loadDeferredInstagram, 0);
			}
		};
		const galleryTarget = document.querySelector('[data-site-block-type="gallery"]');
		if ('IntersectionObserver' in window && galleryTarget) {
			observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					observer?.disconnect();
					startWhenGalleryIsNear();
				},
				{ rootMargin: '600px 0px' }
			);
			observer.observe(galleryTarget);
		} else {
			timeoutHandle = window.setTimeout(loadDeferredInstagram, 4000);
		}

		return () => {
			cancelled = true;
			observer?.disconnect();
			if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
			if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
		};
	});
	// Sponsor items
	const sponsorItems = $derived.by(() => {
		if (Array.isArray(config?.sponsor_items) && config.sponsor_items.length) {
			return config.sponsor_items
				.map((item) => ({
					name: String(item?.name || '').trim(),
					text: String(item?.text || '').trim(),
					logo: String(item?.logo || '').trim(),
					url: String(item?.url || '').trim()
				}))
				.filter((item) => item.name || item.text || item.logo || item.url);
		}
		if (Array.isArray(config?.sponsor_links) && config.sponsor_links.length) {
			return config.sponsor_links
				.map((url) => String(url || '').trim())
				.filter(Boolean)
				.map((url) => ({ name: '', text: '', logo: '', url }));
		}
		return [];
	});
	// Ride widget
	const rideWidgetFramePath = $derived.by(() => {
		if (!config?.ride_widget_enabled) return '';
		const baseConfig = { ...(config?.ride_widget_config || {}) };
		if ((config?.ride_widget_host_scope || 'group_only') === 'group_only') {
			baseConfig.organizationSlug = group?.slug || '';
		}
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(baseConfig)) {
			if (value !== null && value !== undefined && value !== '') {
				params.set(key, String(value));
			}
		}
		params.set('host_scope', config?.ride_widget_host_scope || 'group_only');
		if (
			config?.ride_widget_host_scope === 'selected_groups' &&
			Array.isArray(config?.ride_widget_group_ids)
		) {
			params.set('group_ids', config.ride_widget_group_ids.join(','));
		}
		const query = params.toString();
		return query ? `/ride/widget/frame?${query}` : '/ride/widget/frame';
	});
	// FAQ state
	let faqOpen = $state(0);
	function toggleFaq(id) {
		faqOpen = faqOpen === id ? 0 : id;
	}
	// Sponsor logo tone detection
	let sponsorLogoFrameMode = $state({});
	function detectSponsorLogoTone(event, index) {
		const img = event.target;
		if (!img?.naturalWidth) return;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		canvas.width = 1;
		canvas.height = 1;
		try {
			ctx.drawImage(img, 0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
			sponsorLogoFrameMode = {
				...sponsorLogoFrameMode,
				[index]: brightness > 0.5 ? 'light' : 'dark'
			};
		} catch {
			sponsorLogoFrameMode = { ...sponsorLogoFrameMode, [index]: 'auto' };
		}
	}
	// Combined events (rides + volunteer + news)
	const upcomingEvents = $derived.by(() => {
		const events = [];
		if (site.rides?.length) {
			events.push(...site.rides.slice(0, 3).map((r) => ({ ...r, type: 'ride' })));
		}
		if (site.volunteerEvents?.length) {
			events.push(...site.volunteerEvents.slice(0, 2).map((v) => ({ ...v, type: 'volunteer' })));
		}
		if (site.newsPosts?.length) {
			events.push(...site.newsPosts.slice(0, 2).map((n) => ({ ...n, type: 'news' })));
		}
		return events.slice(0, 5);
	});
	const hasEvents = $derived(upcomingEvents.length > 0);
	const hasRides = $derived(site.rides?.length > 0);
	const hasVolunteer = $derived(site.volunteerEvents?.length > 0);
	const hasNews = $derived(site.newsPosts?.length > 0);
	let lawsQuery = $state('');
	let lawsFilter = $state('all');
	const filteredLaws = $derived.by(() => {
		const query = lawsQuery.trim().toLowerCase();
		return THREE_FEET_LAWS.filter((law) => {
			const matchesFilter =
				lawsFilter === 'all' ||
				(lawsFilter === 'rule' && law.status !== 'no-specific-law') ||
				(lawsFilter === 'no-specific-law' && law.status === 'no-specific-law');
			if (!matchesFilter) return false;
			if (!query) return true;
			return [law.state, law.distance, law.statute, law.summary]
				.join(' ')
				.toLowerCase()
				.includes(query);
		});
	});
	const lawCounts = $derived.by(() => ({
		all: THREE_FEET_LAWS.length,
		rule: THREE_FEET_LAWS.filter((law) => law.status !== 'no-specific-law').length,
		'no-specific-law': THREE_FEET_LAWS.filter((law) => law.status === 'no-specific-law').length
	}));
	function lawStatusLabel(status) {
		return THREE_FEET_LAW_STATUS_LABELS[status] || 'Reference entry';
	}
	const actionBlockTypes = [
		'call_to_action',
		'email_signup',
		'membership',
		'volunteer',
		'updates',
		'resources'
	];
	function siteChildHref(path) {
		return basePath ? `${basePath}${path}` : path;
	}
	function blockActionHref(block) {
		const configured = String(block?.button_url || '').trim();
		if (['/join', '/updates', '/assets'].includes(configured)) return siteChildHref(configured);
		if (
			configured.startsWith('/') &&
			config?.site_pages?.some((page) => page.slug && configured === `/${page.slug}`)
		)
			return siteChildHref(configured);
		if (configured) return configured;
		if (block?.type === 'volunteer') return `/volunteer/groups/${group.slug}`;
		if (block?.type === 'updates') return siteChildHref('/updates');
		if (block?.type === 'resources') return siteChildHref('/assets');
		if (block?.type === 'membership' || block?.type === 'email_signup')
			return siteChildHref('/join');
		return '';
	}
	const heroActions = $derived.by(() => {
		if (heroBlock?.button_label && heroBlock?.button_url) {
			const href = blockActionHref(heroBlock);
			if (!href) return [];
			const actions = [
				{
					label: heroBlock.button_label,
					href,
					external: /^https?:\/\//i.test(href)
				}
			];
			if (isAdvocacySite && currentPage?.is_home) {
				actions.push({
					label: 'Find your community',
					href: 'https://3fp.org',
					external: true
				});
			}
			return actions;
		}
		if (isAdvocacySite && currentPage?.is_home) {
			return [
				{ label: 'Explore safety resources', href: siteChildHref('/safety-tips'), external: false },
				{ label: 'Find your community', href: 'https://3fp.org', external: true }
			];
		}
		return currentPage?.is_home ? site.actions : [];
	});
	function formatDate(value) {
		if (!value) return 'Soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Soon';
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}
	function formatTime(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
	}
	function contactLabel(link) {
		if (!link?.key) return 'Link';
		if (link.key === 'website') return 'Website';
		if (link.key === 'email') return link.label || 'Email';
		if (link.key === 'phone') return link.label || 'Phone';
		return link.key.charAt(0).toUpperCase() + link.key.slice(1);
	}
	function rideLeadImage(ride) {
		return (
			(ride?.imageUrls || ride?.rideDetails?.image_urls)?.[0] ||
			group?.cover_photo_url ||
			site?.photoBucket?.image_assets?.[0]?.href ||
			''
		);
	}
	function openLightbox(index) {
		lightboxItems = galleryImages;
		lightboxIndex = index;
		lightboxOpen = true;
	}
	function closeLightbox() {
		lightboxOpen = false;
		lightboxItems = [];
		lightboxIndex = 0;
	}
	function previousImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex <= 0 ? lightboxItems.length - 1 : lightboxIndex - 1;
	}
	function nextImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex >= lightboxItems.length - 1 ? 0 : lightboxIndex + 1;
	}
	function handleKeydown(event) {
		if (!lightboxOpen) return;
		if (event.key === 'Escape') closeLightbox();
		if (event.key === 'ArrowLeft') previousImage();
		if (event.key === 'ArrowRight') nextImage();
	}
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head>
	<title
		>{currentPage?.is_home
			? config.site_title
			: `${currentPage?.title} — ${config.site_title}`}</title
	>
</svelte:head>
<div
	class="microsite-page max-w-7xl {pageStyleClass} {isAdvocacySite
		? 'site-advocacy'
		: ''} {isAdvocacySite && currentPage?.is_home ? 'site-advocacy-home' : ''}"
>
	<!-- ═══════════════════════════════════════════════════════════
	     HERO SECTION — Clean, focused, single-purpose
     ═══════════════════════════════════════════════════════════ -->
	{#if showNotice}
		<section class="notice-banner">
			<div class="notice-content">
				<AutoLinkText
					text={config.microsite_notice}
					className="notice-text"
					linkClass="notice-link"
				/>
				{#if config.microsite_notice_href}
					<a
						href={config.microsite_notice_href}
						target="_blank"
						rel="noopener noreferrer"
						class="notice-btn"
					>
						Details
						<IconArrowRight class="h-4 w-4" />
					</a>
				{/if}
			</div>
		</section>
	{/if}
	{#each pageBlocks as block, blockIndex (block.id)}
		{#if block.type === 'hero'}
			<!-- ═══════════════════════════════════
HERO — cinematic cover with integrated CTAs
═══════════════════════════════════ -->
			<section class="relative" data-site-block-id={block.id} data-site-block-type="hero">
				{#if heroStyle === 'bold'}
					<!-- ════════════════════════════════════════════════════════
	HERO BOLD — Magazine-style diagonal split with oversized typography
	════════════════════════════════════════════════════════ -->
					<div
						class="bg-surface-950 relative aspect-[21/9] overflow-hidden rounded-3xl max-md:aspect-auto"
					>
						<!-- Left diagonal panel with solid theme color -->
						<div
							class="absolute inset-0 [background:linear-gradient(105deg,color-mix(in_oklab,var(--color-primary-500)_8%,var(--color-surface-950))_0%,color-mix(in_oklab,var(--color-surface-950)_95%,transparent)_55%)] [clip-path:polygon(0_0,60%_0,45%_100%,0_100%)] max-md:[clip-path:polygon(0_0,70%_0,55%_100%,0_100%)]"
						></div>
						<div
							class="absolute inset-0 [background:linear-gradient(105deg,color-mix(in_oklab,var(--color-secondary-500)_15%,transparent)_0%,transparent_50%)] [clip-path:polygon(0_0,62%_0,47%_100%,0_100%)] max-md:[clip-path:polygon(0_0,72%_0,57%_100%,0_100%)]"
						></div>
						<!-- Image on right side -->
						<div
							class="absolute inset-0 [clip-path:polygon(55%_0,100%_0,100%_100%,40%_100%)] max-md:[clip-path:polygon(65%_0,100%_0,100%_100%,50%_100%)]"
						>
							{#if group.cover_photo_url}
								<picture class="absolute inset-0 block">
									<source media="(max-width: 480px)" srcset={heroImageSmallSrcSet} sizes="100vw" />
									<source
										media="(min-width: 481px) and (max-width: 767px)"
										srcset={heroImageMobileSrcSet}
										sizes="100vw"
									/>
									<img
										src={heroImageHref}
										alt={`${group.name}`}
										fetchpriority="high"
										decoding="async"
										srcset={heroImageSrcSet}
										sizes="100vw"
										class="h-full w-full object-cover"
									/>
								</picture>
							{:else}
								<div
									class="from-secondary-500/30 via-tertiary-500/25 to-primary-500/30 h-full w-full bg-gradient-to-br"
								></div>
							{/if}
						</div>
						<!-- Content overlay -->
						<div
							class="relative z-10 flex h-full items-end p-6 pb-[clamp(1.5rem,5vw,3rem)] pl-[clamp(1.5rem,5vw,3rem)] md:p-10 md:pb-[clamp(1.5rem,5vw,3rem)] md:pl-[clamp(1.5rem,5vw,3rem)]"
						>
							<div
								class="site-advocacy-hero-copy max-w-[600px] rounded-2xl border [border-color:color-mix(in_oklab,var(--color-surface-50)_8%,transparent)] p-[clamp(1.25rem,3vw,2rem)] [backdrop-filter:blur(12px)] [background:color-mix(in_oklab,var(--color-surface-950)_85%,transparent)] [webkit-backdrop-filter:blur(12px)] max-md:max-w-full"
							>
								<!-- Location badge -->
								{#if location && !isAdvocacySite}
									<div
										class="text-primary-200 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase [background:color-mix(in_oklab,var(--color-primary-500)_20%,transparent)]"
									>
										<IconMapPin class="h-3.5 w-3.5" />
										<span>{location}</span>
									</div>
								{:else if !isAdvocacySite}
									<div class="skeleton mb-3 h-4 w-32 rounded-full"></div>
								{/if}
								<!-- Logo + Title row -->
								<div class="mt-4 flex items-start gap-4 md:gap-6">
									{#if group.logo_url}
										<img
											src={logoImageHref}
											alt={`${group.name} logo`}
											class="h-14 w-14 rounded-xl object-cover shadow-xl ring-2 ring-[color-mix(in_oklab,var(--color-surface-50)_20%,transparent)] md:h-20 md:w-20"
											decoding="async"
										/>
									{:else}
										<div class="skeleton h-14 w-14 rounded-xl md:h-20 md:w-20"></div>
									{/if}
									<div class="min-w-0 flex-1">
										{#if heroTitle}
											<h1
												class="text-primary-500 text-4xl leading-[0.92] font-black tracking-tight break-words [text-shadow:0_2px_20px_color-mix(in_oklab,black_40%,transparent)] max-md:text-[2rem] max-md:leading-[0.95] md:text-6xl lg:text-7xl"
											>
												{heroTitle}
											</h1>
										{:else}
											<div class="skeleton mb-2 h-10 w-full rounded md:h-14"></div>
											<div class="skeleton h-10 w-2/3 rounded md:h-14"></div>
										{/if}
									</div>
								</div>
								{#if isAdvocacySite && currentPage?.is_home && heroBlock?.eyebrow}
									<div class="site-advocacy-hero-kicker">{heroBlock.eyebrow}</div>
								{/if}
								<!-- Tagline -->
								{#if heroTagline}
									<AutoLinkText
										text={heroTagline}
										className="!text-white block mt-4 max-w-xl text-base [text-shadow:0_1px_12px_color-mix(in_oklab,black_30%,transparent)] md:text-lg"
										linkClass="!text-white underline underline-offset-2"
									/>
								{:else}
									<div class="skeleton mt-4 h-4 w-full max-w-xl rounded"></div>
								{/if}
								<!-- CTAs -->
								{#if heroActions.length}
									<div class="mt-6 flex flex-wrap items-center gap-3">
										{#each heroActions as action, i}
											<a
												href={action.href}
												target={action.external ? '_blank' : undefined}
												rel={action.external ? 'noopener noreferrer' : undefined}
												class="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition-all duration-150 max-md:px-4 max-md:py-2.5 {i ===
												0
													? 'bg-primary-500 text-primary-contrast-500 shadow-lg [box-shadow:0_4px_20px_-4px_color-mix(in_oklab,var(--color-primary-500)_50%,transparent)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_28px_-4px_color-mix(in_oklab,var(--color-primary-500)_60%,transparent)]'
													: 'text-surface-100 border [border-color:color-mix(in_oklab,var(--color-surface-50)_15%,transparent)] [background:color-mix(in_oklab,var(--color-surface-50)_10%,transparent)] hover:[background:color-mix(in_oklab,var(--color-surface-50)_18%,transparent)]'}"
											>
												<span>{action.label}</span>
												<IconArrowRight class="h-4 w-4" />
											</a>
										{/each}
									</div>
								{:else}
									<div class="mt-6 flex gap-3">
										<div class="skeleton h-12 w-32 rounded-full"></div>
										<div class="skeleton h-12 w-32 rounded-full"></div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{:else if heroStyle === 'orbit'}
					<!-- ════════════════════════════════════════════════════════
	HERO ORBIT — Modern floating glass card with ambient glow
	════════════════════════════════════════════════════════ -->
					<div
						class="bg-surface-950 relative aspect-[21/9] overflow-hidden rounded-3xl max-md:aspect-auto"
					>
						{#if group.cover_photo_url}
							<picture class="absolute inset-0 block">
								<source media="(max-width: 480px)" srcset={heroImageSmallSrcSet} sizes="100vw" />
								<source
									media="(min-width: 481px) and (max-width: 767px)"
									srcset={heroImageMobileSrcSet}
									sizes="100vw"
								/>
								<img
									src={heroImageHref}
									alt={`${group.name}`}
									fetchpriority="high"
									decoding="async"
									srcset={heroImageSrcSet}
									sizes="100vw"
									class="h-full w-full object-cover"
								/>
							</picture>
						{:else}
							<div
								class="from-primary-500/25 via-surface-500/10 to-secondary-500/25 absolute inset-0 bg-gradient-to-br"
							></div>
						{/if}
						<!-- Vignette overlay -->
						<div
							class="from-surface-950/80 via-surface-950/50 to-surface-950/70 absolute inset-0 bg-gradient-to-b"
						></div>
						<!-- Subtle dot pattern -->
						<div
							class="absolute inset-0 opacity-30"
							style="background-image: radial-gradient(circle at center, color-mix(in oklab, var(--color-surface-50) 6%, transparent) 0%, transparent 1px); background-size: 32px 32px;"
						></div>
						<!-- Content -->
						<div class="relative z-10 flex h-full items-center justify-center p-5 md:p-8">
							<div class="relative w-full max-w-xl">
								<!-- Ambient glow behind card -->
								<div
									class="from-primary-500/40 via-secondary-500/30 to-tertiary-500/40 absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br opacity-60 blur-xl"
								></div>
								<!-- Glass card -->
								<div
									class="border-surface-50/10 bg-surface-950/70 relative rounded-3xl border px-6 py-8 shadow-2xl shadow-black/50 backdrop-blur-xl max-md:px-4 max-md:py-6"
								>
									<div class="flex flex-col items-center text-center">
										{#if group.logo_url}
											<img
												src={logoImageHref}
												alt={`${group.name} logo`}
												class="ring-surface-50/30 h-16 w-16 rounded-2xl object-cover shadow-2xl ring-2 md:h-20 md:w-20"
												decoding="async"
											/>
										{:else}
											<div class="skeleton h-16 w-16 rounded-2xl md:h-20 md:w-20"></div>
										{/if}
										{#if location && !isAdvocacySite}
											<p
												class="text-surface-50/60 mt-4 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3em] uppercase"
											>
												<IconMapPin class="h-3 w-3" />{location}
											</p>
										{:else}
											<div class="skeleton mt-4 h-3 w-24 rounded"></div>
										{/if}
										{#if heroTitle}
											<h1
												class="text-primary-500 mt-3 text-3xl leading-[0.95] font-black tracking-tight break-words [text-shadow:0_4px_20px_color-mix(in_oklab,black_40%,transparent)] md:text-5xl"
											>
												{heroTitle}
											</h1>
										{:else}
											<div class="skeleton mt-3 h-10 w-48 rounded"></div>
										{/if}
										{#if heroTagline}
											<AutoLinkText
												text={heroTagline}
												className="mt-3 block max-w-md text-base leading-relaxed text-surface-50/80"
												linkClass="text-surface-50 underline underline-offset-2"
											/>
										{:else}
											<div class="skeleton mt-3 h-4 w-64 rounded"></div>
										{/if}
									</div>
									{#if heroActions.length}
										<div class="mt-6 flex flex-wrap items-center justify-center gap-3 md:mt-8">
											{#each heroActions as action, i}
												<a
													href={action.href}
													target={action.external ? '_blank' : undefined}
													rel={action.external ? 'noopener noreferrer' : undefined}
													class="btn {i === 0
														? 'preset-filled-primary-500 shadow-primary-500/25 shadow-lg'
														: 'preset-tonal-secondary border-surface-50/20 border'} gap-2 px-5 py-2.5 text-sm font-bold"
												>
													{action.label}
													<IconArrowRight class="h-4 w-4" />
												</a>
											{/each}
										</div>
									{:else}
										<div class="mt-8 flex justify-center gap-3">
											<div class="skeleton h-10 w-24 rounded-full"></div>
											<div class="skeleton h-10 w-24 rounded-full"></div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div
						class="card relative aspect-[21/9] overflow-hidden rounded-3xl border-0 max-md:aspect-auto"
					>
						{#if group.cover_photo_url}
							<picture class="site-advocacy-hero-image absolute inset-0 block">
								<source media="(max-width: 480px)" srcset={heroImageSmallSrcSet} sizes="100vw" />
								<source
									media="(min-width: 481px) and (max-width: 767px)"
									srcset={heroImageMobileSrcSet}
									sizes="100vw"
								/>
								<img
									src={heroImageHref}
									alt={`${group.name}`}
									fetchpriority="high"
									decoding="async"
									srcset={heroImageSrcSet}
									sizes="100vw"
									class="absolute inset-0 h-full w-full object-cover"
								/>
							</picture>
						{:else}
							<div
								class="from-primary-500/30 via-secondary-500/20 to-tertiary-500/30 absolute inset-0 bg-gradient-to-br"
							></div>
						{/if}
						<div
							class="site-advocacy-hero-vignette absolute inset-0 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]/60 to-transparent opacity-90"
						></div>
						<div
							class="site-advocacy-hero-wash absolute inset-0 bg-gradient-to-br from-[#0b0f14]/40 via-transparent to-[#0b0f14]/20 opacity-55"
						></div>
						<div
							class="site-advocacy-hero-content absolute inset-0 z-10 flex flex-col justify-end p-5 md:p-8"
						>
							<div class="flex flex-col gap-6">
								{#if isAdvocacySite && currentPage?.is_home && heroBlock?.eyebrow}
									<div class="site-advocacy-hero-kicker">{heroBlock.eyebrow}</div>
								{/if}
								<div class="flex items-start gap-4 md:items-end">
									{#if group.logo_url}
										<img
											src={logoImageHref}
											alt={`${group.name} logo`}
											class="ring-surface-50/20 h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-2xl ring-2 md:h-20 md:w-20"
											decoding="async"
										/>
									{:else}
										<div
											class="from-primary-500 to-secondary-500 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl md:h-20 md:w-20"
										>
											<IconUsers class="h-7 w-7 text-white/80" />
										</div>
									{/if}
									<div class="min-w-0 pb-0.5">
										{#if location && !isAdvocacySite}
											<p
												class="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.3em] text-white/70 uppercase"
											>
												<IconMapPin class="h-3 w-3" />{location}
											</p>
										{/if}
										<h1
											class="text-primary-500 text-3xl leading-tight font-black tracking-tight break-words md:text-4xl lg:text-5xl"
										>
											{heroTitle}
										</h1>
									</div>
								</div>
								<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
									{#if heroTagline}
										<AutoLinkText
											text={heroTagline}
											className="block max-w-xl text-lg leading-relaxed font-medium text-white/90 md:text-xl"
											linkClass="text-white underline underline-offset-2"
										/>
									{/if}
									{#if heroActions.length}
										<div class="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
											{#each heroActions as action, i}
												<a
													href={action.href}
													target={action.external ? '_blank' : undefined}
													rel={action.external ? 'noopener noreferrer' : undefined}
													class="btn btn-sm whitespace-nowrap md:btn-base {i === 0
														? 'preset-filled-primary-500'
														: 'preset-tonal-tertiary'} gap-2"
												>
													{action.label}
													<IconArrowRight class="h-4 w-4" />
												</a>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</section>
		{:else if block.type === 'law_directory'}
			<section
				class="laws-directory-section"
				id="state-laws"
				data-site-block-id={block.id}
				data-site-block-type="law_directory"
			>
				<div class="laws-directory-card">
					<div class="laws-directory-heading">
						<div class="laws-directory-heading-copy">
							<div class="laws-directory-kicker">
								<span class="laws-directory-icon"><IconSearch class="h-4 w-4" /></span>
								<span>{block.eyebrow || 'State-by-state guide'}</span>
							</div>
							<h2 class="laws-directory-title">{block.title || 'Find the law where you ride'}</h2>
							{#if block.body}
								<p class="laws-directory-intro">{block.body}</p>
							{/if}
						</div>
						<div class="laws-directory-trust">
							<IconShieldCheck class="h-5 w-5" />
							<div>
								<strong>{THREE_FEET_LAWS_LAST_REVIEWED} reference</strong>
								<span>Verify before relying on a rule</span>
							</div>
						</div>
					</div>

					<div class="laws-directory-controls">
						<label class="laws-directory-search">
							<span class="sr-only">Search state laws</span>
							<IconSearch class="h-4 w-4" />
							<input
								type="search"
								placeholder="Search a state, statute, or keyword"
								aria-label="Search a state, statute, or keyword"
								bind:value={lawsQuery}
							/>
							{#if lawsQuery}
								<button type="button" aria-label="Clear law search" onclick={() => (lawsQuery = '')}
									>×</button
								>
							{/if}
						</label>
						<div class="laws-directory-filters" aria-label="Filter state laws">
							<button
								type="button"
								class:active={lawsFilter === 'all'}
								onclick={() => (lawsFilter = 'all')}
							>
								All <span>{lawCounts.all}</span>
							</button>
							<button
								type="button"
								class:active={lawsFilter === 'rule'}
								onclick={() => (lawsFilter = 'rule')}
							>
								Passing rule <span>{lawCounts.rule}</span>
							</button>
							<button
								type="button"
								class:active={lawsFilter === 'no-specific-law'}
								onclick={() => (lawsFilter = 'no-specific-law')}
							>
								No specific distance <span>{lawCounts['no-specific-law']}</span>
							</button>
						</div>
					</div>

					<div class="laws-directory-summary" aria-live="polite">
						<span
							>{filteredLaws.length}
							{filteredLaws.length === 1 ? 'jurisdiction' : 'jurisdictions'}</span
						>
						<span>Source: {THREE_FEET_LAWS_SOURCE_FILE}</span>
					</div>

					{#if filteredLaws.length}
						<div class="laws-directory-list">
							{#each filteredLaws as law, index (law.state)}
								<details class="law-entry" open={index === 0}>
									<summary class="law-entry-summary">
										<span class="law-entry-state">{law.state}</span>
										<span class="law-entry-distance">{law.distance}</span>
										<span class="law-entry-status">{lawStatusLabel(law.status)}</span>
										<span class="law-entry-chevron" aria-hidden="true">⌄</span>
									</summary>
									<div class="law-entry-detail">
										<p class="law-entry-summary-copy">{law.summary}</p>
										<div class="law-entry-meta">
											<div>
												<span>Statute or search term</span>
												<strong>{law.statute}</strong>
											</div>
											{#if law.passed}
												<div>
													<span>Listed as passed</span>
													<strong>{law.passed}</strong>
												</div>
											{/if}
											{#if law.ranking}
												<div>
													<span>Workbook ranking</span>
													<strong>#{law.ranking}</strong>
												</div>
											{/if}
										</div>
										<a
											href={law.sourceUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="law-entry-source"
										>
											<span>{law.sourceLabel}</span>
											<IconExternalLink class="h-4 w-4" />
										</a>
									</div>
								</details>
							{/each}
						</div>
					{:else}
						<div class="laws-directory-empty">
							<IconSearch class="h-5 w-5" />
							<p>No states match “{lawsQuery}”.</p>
							<button
								type="button"
								class="btn preset-tonal-surface"
								onclick={() => {
									lawsQuery = '';
									lawsFilter = 'all';
								}}
							>
								Show all states
							</button>
						</div>
					{/if}

					<p class="laws-directory-disclaimer">
						Reference compiled from {THREE_FEET_LAWS_SOURCE_FILE}. Traffic laws change and may be
						interpreted differently by jurisdiction. Confirm the current statute with an official
						source; this page is educational information, not legal advice.
					</p>
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
		     DONATE — Quick donation widget (optional)
     ═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'donation' && site.donationEnabled}
			<section class="donate-section" data-site-block-id={block.id} data-site-block-type="donation">
				<div class="donate-card">
					<form method="GET" action="/donate">
						<input type="hidden" name="group" value={group.slug} />
						<div class="donate-header">
							<div class="flex items-center gap-3">
								<div class="donate-icon">
									<IconHeart class="h-5 w-5 text-white" />
								</div>
								<h2 class="donate-title">{block.title || 'Support our work'}</h2>
							</div>
							<div class="donate-presets">
								{#each donateAmountPresets as preset}
									<button
										type="button"
										class="donate-preset {donateAmount === preset ? 'active' : ''}"
										onclick={() => (donateAmount = preset)}
									>
										${preset}
									</button>
								{/each}
							</div>
						</div>
						<div class="donate-input-row">
							<div class="donate-input-wrap">
								<span class="donate-currency">$</span>
								<input
									type="number"
									min="1"
									max="25000"
									step="1"
									name="amount"
									bind:value={donateAmount}
									class="donate-input"
									placeholder="Other"
								/>
							</div>
							<button type="submit" class="donate-btn">
								Donate
								<IconArrowRight class="h-3.5 w-3.5" />
							</button>
						</div>
					</form>
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
ABOUT — Comprehensive group profile
═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'story' && site.storyParagraphs.length}
			<section
				class="about-section"
				id="about"
				data-site-block-id={block.id}
				data-site-block-type="story"
			>
				<div class="about-card">
					<div class="about-header">
						<div class="about-icon"><IconUsers class="h-5 w-5" /></div>
						<div>
							<p class="about-label">{block.eyebrow || 'About us'}</p>
							<h2 class="about-title">{block.title || 'Who we are'}</h2>
						</div>
					</div>
					<div class="about-content">
						{#each site.storyParagraphs.slice(0, 2) as paragraph}
							<AutoLinkText text={paragraph} className="about-paragraph" linkClass="about-link" />
						{/each}

						<!-- New rider note -->
						{#if hasNewRiderNote}
							<div class="new-rider-note about-new-rider-note">
								<p class="note-label">New Riders</p>
								<AutoLinkText
									text={config.new_rider_note}
									className="note-text"
									linkClass="note-link"
								/>
							</div>
						{/if}
					</div>

					<!-- Quick facts grid -->
					<div class="about-facts-grid">
						{#if group?.activity_frequency}
							<div class="about-fact">
								<p class="about-fact-label">When we ride</p>
								<p class="about-fact-value">{group.activity_frequency}</p>
							</div>
						{/if}

						{#if location || group?.specific_meeting_point_address}
							<div class="about-fact">
								<p class="about-fact-label">Where we meet</p>
								{#if mapsHref && (group?.specific_meeting_point_address || location)}
									<a
										href={mapsHref}
										target="_blank"
										rel="noopener noreferrer"
										class="about-fact-link"
									>
										{group?.specific_meeting_point_address || location}
										<IconArrowRight class="h-3.5 w-3.5" />
									</a>
								{:else}
									<p class="about-fact-value">{location || 'Shared in ride details'}</p>
								{/if}
							</div>
						{/if}

						{#if taxonomy?.audiences?.length || group?.audience_focus}
							<div class="about-fact">
								<p class="about-fact-label">Who can join</p>
								<p class="about-fact-value">
									{taxonomy?.audiences?.[0] || group?.audience_focus || 'Anyone on two wheels'}
								</p>
							</div>
						{/if}

						{#if group?.how_to_join_instructions || group?.membership_info}
							<div class="about-fact">
								<p class="about-fact-label">How to join</p>
								<p class="about-fact-value">
									{group?.how_to_join_instructions || group?.membership_info}
								</p>
							</div>
						{/if}

						{#if group?.typical_activity_day_time}
							<div class="about-fact">
								<p class="about-fact-label">Typical schedule</p>
								<p class="about-fact-value">{group.typical_activity_day_time}</p>
							</div>
						{/if}

						{#if group?.primary_discipline}
							<div class="about-fact">
								<p class="about-fact-label">Primary discipline</p>
								<p class="about-fact-value">{group.primary_discipline}</p>
							</div>
						{/if}

						{#if group?.typical_skill_level}
							<div class="about-fact">
								<p class="about-fact-label">Typical skill level</p>
								<p class="about-fact-value">{group.typical_skill_level}</p>
							</div>
						{/if}

						{#if group?.zip_code}
							<div class="about-fact">
								<p class="about-fact-label">ZIP code</p>
								<p class="about-fact-value">{group.zip_code}</p>
							</div>
						{/if}

						{#if group?.website_url}
							<div class="about-fact">
								<p class="about-fact-label">Website</p>
								<a
									href={group.website_url}
									target="_blank"
									rel="noopener noreferrer"
									class="about-fact-link"
								>
									{group.website_url.replace(/^https?:\/\//, '')}
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							</div>
						{/if}

						{#if group?.public_contact_email}
							<div class="about-fact">
								<p class="about-fact-label">Email</p>
								<a href="mailto:{group.public_contact_email}" class="about-fact-link">
									{group.public_contact_email}
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							</div>
						{/if}

						{#if group?.public_phone_number}
							<div class="about-fact">
								<p class="about-fact-label">Phone</p>
								<a href="tel:{group.public_phone_number}" class="about-fact-link">
									{group.public_phone_number}
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							</div>
						{/if}

						{#if group?.preferred_contact_method_instructions}
							<div class="about-fact">
								<p class="about-fact-label">Best way to reach us</p>
								<p class="about-fact-value">{group.preferred_contact_method_instructions}</p>
							</div>
						{/if}
					</div>

					<!-- FAQ within About -->
					{#if config.faq_1_q || config.faq_1_a || config.faq_2_q || config.faq_2_a}
						<div class="about-faq">
							<p class="about-faq-label">FAQ</p>
							<div class="faq-list">
								{#if config.faq_1_q}
									<div class="faq-item">
										<button
											type="button"
											class="faq-question"
											onclick={() => toggleFaq(1)}
											aria-expanded={faqOpen === 1}
										>
											<span>{config.faq_1_q}</span>
											<IconChevronDown class="faq-chevron {faqOpen === 1 ? 'open' : ''}" />
										</button>
										{#if faqOpen === 1}
											<div class="faq-answer" transition:slide={{ duration: 200 }}>
												<p>{config.faq_1_a}</p>
											</div>
										{/if}
									</div>
								{/if}
								{#if config.faq_2_q}
									<div class="faq-item">
										<button
											type="button"
											class="faq-question"
											onclick={() => toggleFaq(2)}
											aria-expanded={faqOpen === 2}
										>
											<span>{config.faq_2_q}</span>
											<IconChevronDown class="faq-chevron {faqOpen === 2 ? 'open' : ''}" />
										</button>
										{#if faqOpen === 2}
											<div class="faq-answer" transition:slide={{ duration: 200 }}>
												<p>{config.faq_2_a}</p>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{/if}

					{#if group.group_type || group.audience_focus || taxonomy.audiences?.length}
						<div class="about-tags">
							{#if group.group_type}
								<span class="tag tag-primary">{group.group_type}</span>
							{/if}
							{#if group.audience_focus}
								<span class="tag tag-secondary">{group.audience_focus}</span>
							{/if}
							{#each taxonomy.audiences.slice(0, 3) as item}
								<span class="tag tag-tonal">{item}</span>
							{/each}
						</div>
					{/if}
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
	     UPCOMING EVENTS — Unified section for rides/volunteer/news
     ═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'events' && hasEvents}
			<section
				class="events-section"
				id="events"
				data-site-block-id={block.id}
				data-site-block-type="events"
			>
				<div class="events-card">
					<div class="events-header">
						<div class="events-header-main">
							<div class="events-icon"><IconNewspaper class="h-5 w-5" /></div>
							<div>
								<p class="events-label">{block.eyebrow || 'Coming up'}</p>
								<h2 class="events-title">{block.title || "What's happening"}</h2>
							</div>
						</div>
						{#if hasNews}
							<a
								href="/groups/{group.slug}/news"
								class="btn btn-sm preset-tonal-secondary events-header-cta gap-1"
							>
								All updates
								<IconArrowRight class="h-4 w-4" />
							</a>
						{/if}
					</div>
					<div class="events-grid">
						{#each upcomingEvents as event}
							{@const eventDate =
								event.nextOccurrenceStart ||
								event.event_start ||
								event.published_at ||
								event.created_at}
							{@const eventHref =
								event.type === 'ride'
									? `/ride/${event.slug}`
									: event.type === 'volunteer'
										? `/volunteer/${event.slug}`
										: `/groups/${group.slug}/news?open=${event.slug}`}
							{@const eventColor =
								event.type === 'ride'
									? 'primary'
									: event.type === 'volunteer'
										? 'tertiary'
										: 'secondary'}
							{@const eventLabel =
								event.type === 'ride'
									? 'Ride'
									: event.type === 'volunteer'
										? 'Volunteer'
										: 'Update'}
							<a href={eventHref} class="event-card event-{event.type}">
								<div class="event-date">
									<span class="event-month"
										>{eventDate
											? new Date(eventDate).toLocaleDateString('en-US', { month: 'short' })
											: 'TBD'}</span
									>
									<span class="event-day">{eventDate ? new Date(eventDate).getDate() : '--'}</span>
								</div>
								<div class="event-content">
									<span class="event-type-badge badge-{eventColor}">{eventLabel}</span>
									<h3 class="event-title">{event.title}</h3>
									{#if event.summary || event.preview_text}
										<p class="event-summary">{event.summary || event.preview_text}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
					{#if hasRides || hasVolunteer}
						<div class="border-surface-500/20 mt-5 flex flex-wrap gap-4 border-t pt-5">
							{#if hasRides}
								<a
									href={groupPageHref}
									class="text-surface-700-300 hover:text-primary-500 text-sm font-semibold transition-colors"
									>View all rides →</a
								>
							{/if}
							{#if hasVolunteer}
								<a
									href="/volunteer/groups/{group.slug}"
									class="text-surface-700-300 hover:text-primary-500 text-sm font-semibold transition-colors"
									>Volunteer opportunities →</a
								>
							{/if}
						</div>
					{/if}
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
GALLERY PREVIEW — Link to full gallery page with Instagram
═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'gallery' && (galleryImages.length || hasInstagramPosts)}
			<section
				class="gallery-section"
				id="gallery"
				data-site-block-id={block.id}
				data-site-block-type="gallery"
			>
				<div class="gallery-card">
					<div class="gallery-header">
						<div class="gallery-header-main">
							<div class="gallery-icon"><IconImage class="h-5 w-5" /></div>
							<div>
								<p class="gallery-label">{block.eyebrow || 'Gallery'}</p>
								<h2 class="gallery-title">{block.title || 'Scenes from our rides'}</h2>
							</div>
						</div>
						{#if galleryImages.length}
							<a
								href={galleryHref}
								class="btn btn-sm preset-tonal-secondary gallery-header-cta gap-1"
							>
								View full gallery
								<IconArrowRight class="h-4 w-4" />
							</a>
						{/if}
					</div>

					<!-- Gallery Images -->
					{#if galleryImages.length}
						<div class="gallery-grid">
							{#each galleryImages as image}
								<a href={galleryHref} class="gallery-item" data-scroll-reveal="stagger">
									<img
										src={LAZY_IMAGE_PLACEHOLDER}
										data-src={optimizedImageUrl(image.href, { width: 960, quality: 70 })}
										alt={image.title}
										loading="lazy"
										decoding="async"
										use:lazyImage
									/>
									<noscript>
										<img
											src={optimizedImageUrl(image.href, { width: 960, quality: 70 })}
											alt={image.title}
										/>
									</noscript>
									<div class="gallery-overlay">
										<span class="gallery-view">View</span>
									</div>
								</a>
							{/each}
						</div>
					{/if}

					<!-- Instagram Posts -->
					{#if hasInstagramPosts}
						<div class="instagram-preview-section">
							<p class="instagram-preview-label">Recent on Instagram</p>
							<div class="instagram-grid">
								{#each instagramPosts as post}
									<a
										href={post.permalink}
										target="_blank"
										rel="noopener noreferrer"
										class="instagram-preview-item"
									>
										{#if post.media_url}
											<img
												src={LAZY_IMAGE_PLACEHOLDER}
												data-src={optimizedImageUrl(post.media_url, { width: 640, quality: 60 })}
												alt="Instagram post"
												loading="lazy"
												decoding="async"
												use:lazyImage
											/>
											<noscript>
												<img
													src={optimizedImageUrl(post.media_url, { width: 640, quality: 60 })}
													alt="Instagram post"
												/>
											</noscript>
											<div class="instagram-preview-overlay">
												<BrandInstagram class="h-4 w-4 text-white" />
											</div>
										{/if}
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
DONATE — Quick donation widget (optional)
═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'ride_calendar' && config.ride_widget_enabled}
			<section
				class="rides-widget-section"
				id="rides-widget"
				data-site-block-id={block.id}
				data-site-block-type="ride_calendar"
			>
				<iframe
					src={rideWidgetFramePath}
					title={config.ride_widget_title || 'Upcoming rides'}
					class="rides-widget-iframe"
					loading="lazy"
				></iframe>
			</section>

			<!-- ═══════════════════════════════════════════════════════════
NEW RIDER NOTE — Helpful for newcomers (optional)
═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'contact' && site.contactLinks.length}
			<section
				class="contact-section"
				id="contact"
				data-site-block-id={block.id}
				data-site-block-type="contact"
			>
				<div class="contact-card">
					<div class="contact-header">
						<div class="contact-icon"><IconHeartHandshake class="h-5 w-5" /></div>
						<div>
							<p class="contact-label-section">{block.eyebrow || 'Get in touch'}</p>
							<h2 class="contact-title">{block.title || 'Connect with us'}</h2>
						</div>
					</div>
					<div class="contact-links">
						{#each site.contactLinks as link}
							{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
							<a
								href={link.href}
								target={/^https?:\/\//i.test(link.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(link.href) ? 'noopener noreferrer' : undefined}
								class="contact-link"
							>
								<div class="contact-link-icon"><ContactIcon class="h-4 w-4" /></div>
								<div class="contact-link-text">
									<span class="contact-link-label">{contactLabel(link)}</span>
									<span class="contact-link-value"
										>{link.href.replace(/^mailto:/, '').replace(/^tel:/, '')}</span
									>
								</div>
								<IconArrowRight class="contact-link-arrow" />
							</a>
						{/each}
					</div>
				</div>
			</section>
			<!-- ═══════════════════════════════════════════════════════════
SPONSORS — Community partners showcase
═══════════════════════════════════════════════════════════ -->
		{:else if block.type === 'sponsors' && sponsorItems.length}
			<section
				class="sponsor-section"
				id="sponsors"
				data-site-block-id={block.id}
				data-site-block-type="sponsors"
			>
				<div class="sponsor-card">
					<div class="sponsor-header">
						<div class="sponsor-header-text">
							<p class="sponsor-label">{block.eyebrow || 'Community partners'}</p>
							<h2 class="sponsor-title">{block.title || 'Thanks to our partners'}</h2>
						</div>
					</div>
					<div class="sponsor-grid">
						{#each sponsorItems as sponsor, sponsorIndex}
							{#if sponsor.url}
								<a
									href={sponsor.url}
									target="_blank"
									rel="noopener noreferrer"
									class="sponsor-item-link"
								>
									{#if sponsor.logo}
										<div
											class="sponsor-logo-frame {sponsorLogoFrameMode[sponsorIndex] === 'dark'
												? 'logo-bg-dark'
												: sponsorLogoFrameMode[sponsorIndex] === 'light'
													? 'logo-bg-light'
													: 'logo-bg-auto'}"
										>
											<img
												src={sponsor.logo}
												alt={(sponsor.name || 'Sponsor') + ' logo'}
												crossorigin="anonymous"
												onload={(event) => detectSponsorLogoTone(event, sponsorIndex)}
											/>
										</div>
									{/if}
									<div class="sponsor-content">
										<h3 class="sponsor-name">{sponsor.name || sponsor.url || 'Sponsor'}</h3>
										{#if sponsor.text}
											<p class="sponsor-text">{sponsor.text}</p>
										{/if}
									</div>
									<IconArrowRight class="sponsor-arrow" />
								</a>
							{:else}
								<div class="sponsor-item">
									{#if sponsor.logo}
										<div
											class="sponsor-logo-frame {sponsorLogoFrameMode[sponsorIndex] === 'dark'
												? 'logo-bg-dark'
												: sponsorLogoFrameMode[sponsorIndex] === 'light'
													? 'logo-bg-light'
													: 'logo-bg-auto'}"
										>
											<img
												src={sponsor.logo}
												alt={(sponsor.name || 'Sponsor') + ' logo'}
												crossorigin="anonymous"
												onload={(event) => detectSponsorLogoTone(event, sponsorIndex)}
											/>
										</div>
									{/if}
									<div class="sponsor-content">
										<h3 class="sponsor-name">{sponsor.name || 'Sponsor'}</h3>
										{#if sponsor.text}
											<p class="sponsor-text">{sponsor.text}</p>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			</section>
		{:else if block.type === 'text' || actionBlockTypes.includes(block.type)}
			<section
				class="custom-content-section {actionBlockTypes.includes(block.type)
					? `custom-callout-section callout-tone-${getGroupSiteBlockTone(block.type, blockIndex)}`
					: ''}"
				data-site-block-id={block.id}
				data-site-block-type={block.type}
			>
				<div class="custom-content-card">
					{#if block.eyebrow}<p class="custom-content-label">{block.eyebrow}</p>{/if}
					<h2 class="custom-content-title">{block.title}</h2>
					{#if block.body}
						<AutoLinkText
							text={block.body}
							className="custom-content-body"
							linkClass="custom-content-link"
						/>
					{/if}
					{#if block.type === 'email_signup'}
						<form
							class="mt-6 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2"
							onsubmit={subscribeToGroupEmails}
						>
							<label class="grid gap-1 text-sm"
								><span>First name <span class="opacity-60">optional</span></span><input
									class="input"
									autocomplete="given-name"
									maxlength="120"
									bind:value={signupFirstName}
								/></label
							>
							<label class="grid gap-1 text-sm"
								><span>Email address</span><input
									class="input"
									type="email"
									autocomplete="email"
									required
									maxlength="320"
									bind:value={signupEmail}
								/></label
							>
							<label class="sr-only" aria-hidden="true"
								>Company<input tabindex="-1" autocomplete="off" bind:value={signupCompany} /></label
							>
							<label class="flex items-start gap-2 text-sm sm:col-span-2"
								><input
									class="checkbox mt-0.5"
									type="checkbox"
									required
									bind:checked={signupConsent}
								/><span
									>I agree to receive emails from {group.name}. I can unsubscribe at any time.</span
								></label
							>
							<button
								class="btn preset-filled-primary-500 w-fit sm:col-span-2"
								type="submit"
								disabled={signupState === 'submitting'}
								>{signupState === 'submitting'
									? 'Signing you up…'
									: block.button_label || 'Sign up for updates'}<IconArrowRight
									class="h-4 w-4"
								/></button
							>
							{#if signupMessage}<p
									class="sm:col-span-2 {signupState === 'error' ? 'text-error-500' : ''}"
									role={signupState === 'error' ? 'alert' : 'status'}
								>
									{signupMessage}
								</p>{/if}
						</form>
					{:else if actionBlockTypes.includes(block.type) && block.button_label && blockActionHref(block)}
						{@const actionHref = blockActionHref(block)}
						<a
							href={actionHref}
							target={/^https?:\/\//i.test(actionHref) ? '_blank' : undefined}
							rel={/^https?:\/\//i.test(actionHref) ? 'noopener noreferrer' : undefined}
							class="btn preset-filled-primary-500 custom-content-button"
						>
							{block.button_label}
							<IconArrowRight class="h-4 w-4" />
						</a>
					{/if}
				</div>
			</section>
		{/if}
	{/each}
	<!-- ═══════════════════════════════════════════════════════════
FOOTER — Simple, clean
═══════════════════════════════════════════════════════════ -->
	<footer class="site-footer">
		{#if isAdvocacySite}
			<div class="footer-community-bridge">
				<div class="footer-community-copy">
					<p class="footer-community-label">The community hub</p>
					<h2>Find your people, rides, and practical support on 3fp.org.</h2>
					<p>
						The day-to-day community lives there: discover groups, browse rides, learn safer-road
						habits, and find ways to help.
					</p>
				</div>
				<a
					href="https://3fp.org"
					target="_blank"
					rel="noopener noreferrer"
					class="footer-community-button"
				>
					Visit 3fp.org
					<IconExternalLink class="h-4 w-4" />
				</a>
			</div>
		{/if}
		{#if config.footer_blurb}
			<AutoLinkText text={config.footer_blurb} className="footer-blurb" linkClass="footer-link" />
		{/if}
		<p class="footer-powered">
			3 Feet Please is part of the 3fp.org community. <a
				href="https://3fp.org"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-brand">Explore the community</a
			>
		</p>
	</footer>
</div>
<!-- ═══════════════════════════════════════════════════════════
     LIGHTBOX — For gallery images
			═══════════════════════════════════════════════════════════ -->
{#if lightboxOpen && lightboxItems.length}
	<div
		class="lightbox-backdrop"
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label={lightboxItems[lightboxIndex]?.title}
		onclick={(e) => {
			if (e.target === e.currentTarget) closeLightbox();
		}}
		onkeydown={handleKeydown}
		transition:fade={{ duration: 140 }}
	>
		<div class="lightbox-panel" transition:scale={{ start: 0.98, duration: 160 }}>
			<div class="lightbox-toolbar">
				<div class="lightbox-counter">
					{lightboxIndex + 1} <span>/</span>
					{lightboxItems.length}
				</div>
				<button
					type="button"
					class="lightbox-close"
					onclick={closeLightbox}
					aria-label="Close lightbox"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>
			<div class="lightbox-stage">
				<img
					src={lightboxItems[lightboxIndex]?.href}
					alt={lightboxItems[lightboxIndex]?.title}
					class="lightbox-image"
				/>
				{#if lightboxItems.length > 1}
					<button
						type="button"
						class="lightbox-nav lightbox-prev"
						onclick={previousImage}
						aria-label="Previous image"><IconChevronLeft class="h-5 w-5" /></button
					>
					<button
						type="button"
						class="lightbox-nav lightbox-next"
						onclick={nextImage}
						aria-label="Next image"><IconChevronRight class="h-5 w-5" /></button
					>
				{/if}
			</div>
			{#if lightboxItems.length > 1}
				<div class="lightbox-thumbnails">
					{#each lightboxItems as asset, index}
						<button
							type="button"
							class="thumbnail {index === lightboxIndex ? 'active' : ''}"
							onclick={() => (lightboxIndex = index)}
							aria-label="View image {index + 1}"
						>
							<img src={asset.href} alt={asset.title} />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ═══════════════════════════════════════════════════════════
   BASE STYLES & CSS VARIABLES
   ═══════════════════════════════════════════════════════════ */
	.microsite-page {
		--ms-gap: 1.25rem;
		--ms-padding-x: 1rem;
		--panel-bg: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		--panel-bg-dark: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		--panel-border: color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		--panel-blur: 20px;

		margin: 0 auto;
		padding: var(--ms-gap) var(--ms-padding-x) 3rem;
		display: flex;
		flex-direction: column;
		gap: var(--ms-gap);
	}
	@media (min-width: 768px) {
		.microsite-page {
			--ms-padding-x: 1.5rem;
			--ms-gap: 1.5rem;
		}
	}
	/* Dark mode adjustments */
	:global([data-color-mode='dark']) .microsite-page {
		/* Variables are automatically swapped via CSS custom properties */
	}
	/* ═══════════════════════════════════════════════════════════
   NOTICE BANNER
   ═══════════════════════════════════════════════════════════ */
	.notice-banner {
		background: color-mix(in oklab, var(--color-warning-500) 15%, var(--color-surface-50));
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.notice-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	@media (min-width: 640px) {
		.notice-content {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}
	.notice-text {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.5;
	}
	.notice-link {
		color: var(--color-warning-700);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.notice-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-warning-500);
		color: var(--color-warning-contrast-500);
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
	}
	.notice-btn:hover {
		opacity: 0.9;
	}

	/* Dark mode adjustments for notice banner */
	:global([data-color-mode='dark']) .notice-banner {
		background: color-mix(in oklab, var(--color-warning-500) 15%, var(--color-surface-900));
		border-color: color-mix(in oklab, var(--color-warning-500) 40%, transparent);
	}
	:global([data-color-mode='dark']) .notice-text {
		color: var(--color-surface-50);
	}
	:global([data-color-mode='dark']) .notice-link {
		color: var(--color-warning-300);
	}

	/* ═══════════════════════════════════════════════════════════
HERO SECTION — All variants
═══════════════════════════════════════════════════════════ */
	.hero-section {
		border-radius: 1.25rem;
		overflow: hidden;
	}
	.hero-image,
	.hero-image-full {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.hero-gradient-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 30%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 25%, transparent)
		);
	}
	.hero-gradient-fallback-full {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 30%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 25%, transparent)
		);
	}
	/* ─────────────────────────────────────────────────────────
   HERO: BOLD (Diagonal split)
   ───────────────────────────────────────────────────────── */
	.hero-bold {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		background: var(--color-surface-950);
	}
	@media (max-width: 768px) {
		.hero-bold {
			aspect-ratio: 16/10;
			min-height: 400px;
		}
	}
	.hero-bold-bg {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			105deg,
			color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950)) 0%,
			color-mix(in oklab, var(--color-surface-950) 95%, transparent) 55%
		);
		clip-path: polygon(0 0, 60% 0, 45% 100%, 0 100%);
	}
	@media (max-width: 768px) {
		.hero-bold-bg {
			clip-path: polygon(0 0, 70% 0, 55% 100%, 0 100%);
		}
	}
	.hero-bold-image-wrap {
		position: absolute;
		inset: 0;
		clip-path: polygon(55% 0, 100% 0, 100% 100%, 40% 100%);
	}
	@media (max-width: 768px) {
		.hero-bold-image-wrap {
			clip-path: polygon(65% 0, 100% 0, 100% 100%, 50% 100%);
		}
	}
	.hero-content {
		position: relative;
		z-index: 10;
		height: 100%;
		display: flex;
		align-items: flex-end;
		padding: 1.5rem;
	}
	@media (min-width: 768px) {
		.hero-content {
			padding: 2rem;
		}
	}
	.hero-card {
		background: color-mix(in oklab, var(--color-surface-950) 85%, transparent);
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		border-radius: 1rem;
		padding: 1.25rem;
		max-width: 500px;
	}
	@media (min-width: 768px) {
		.hero-card {
			padding: 1.5rem;
		}
	}
	.location-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-200);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.5rem 0.75rem;
		border-radius: 9999px;
		margin-bottom: 0.75rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.hero-logo {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 20%, transparent);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.hero-title {
		font-size: 1.75rem;
		font-weight: 900;
		line-height: 1.1;
		color: #ffffff;
		text-shadow: 0 2px 20px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title {
			font-size: 2.25rem;
		}
	}
	.hero-tagline {
		font-size: 0.9375rem;
		color: rgba(255, 255, 255, 0.9);
		margin-top: 0.75rem;
		line-height: 1.5;
		display: block;
	}
	.hero-tagline-link {
		color: #ffffff;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.hero-ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.hero-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 700;
		padding: 0.625rem 1.25rem;
		border-radius: 9999px;
		transition: all 0.15s ease;
	}
	.cta-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		box-shadow: 0 4px 14px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}
	.cta-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px color-mix(in oklab, var(--color-primary-500) 50%, transparent);
	}
	.cta-secondary {
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		color: var(--color-surface-100);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
	}
	.cta-secondary:hover {
		background: color-mix(in oklab, var(--color-surface-50) 18%, transparent);
	}
	/* ─────────────────────────────────────────────────────────
   HERO: ORBIT (Centered floating card)
   ───────────────────────────────────────────────────────── */
	.hero-orbit {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		background: var(--color-surface-950);
		overflow: hidden;
	}
	@media (max-width: 768px) {
		.hero-orbit {
			aspect-ratio: 16/11;
		}
	}
	.hero-orbit-vignette {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			color-mix(in oklab, var(--color-surface-950) 80%, transparent),
			color-mix(in oklab, var(--color-surface-950) 50%, transparent),
			color-mix(in oklab, var(--color-surface-950) 70%, transparent)
		);
	}
	.hero-orbit-content {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
	}
	.hero-orbit-card {
		position: relative;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		backdrop-filter: blur(20px);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border-radius: 1.25rem;
		padding: 1.5rem;
		text-align: center;
		max-width: 400px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	.hero-orbit-card::before {
		content: '';
		position: absolute;
		inset: -2px;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 40%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 30%, transparent)
		);
		border-radius: 1.35rem;
		z-index: -1;
		opacity: 0.6;
		filter: blur(16px);
	}
	.hero-logo-center {
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		object-fit: cover;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		margin: 0 auto;
	}
	@media (min-width: 768px) {
		.hero-logo-center {
			width: 5rem;
			height: 5rem;
		}
	}
	.hero-location {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-300);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-top: 1rem;
	}
	.hero-title-center {
		font-size: 1.75rem;
		font-weight: 900;
		color: var(--color-surface-50);
		margin-top: 0.5rem;
		text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title-center {
			font-size: 2.5rem;
		}
	}
	.hero-tagline-center {
		font-size: 0.9375rem;
		color: var(--color-surface-300);
		margin-top: 0.5rem;
		line-height: 1.5;
		display: block;
	}
	.hero-ctas-center {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	/* ─────────────────────────────────────────────────────────
   HERO: IMMERSIVE (Classic gradient overlay)
   ───────────────────────────────────────────────────────── */
	.hero-immersive {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		overflow: hidden;
		border-radius: 1.25rem;
	}
	@media (max-width: 768px) {
		.hero-immersive {
			aspect-ratio: 16/10;
		}
	}
	.hero-immersive-gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			var(--color-surface-950) 0%,
			color-mix(in oklab, var(--color-surface-950) 60%, transparent) 50%,
			color-mix(in oklab, var(--color-surface-950) 40%, transparent) 100%
		);
	}
	.hero-immersive-content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1.25rem;
	}
	@media (min-width: 768px) {
		.hero-immersive-content {
			padding: 1.5rem;
		}
	}
	.hero-immersive-header {
		display: flex;
		align-items: flex-start;
	}
	.title-block {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
	}
	.hero-logo-immersive {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 20%, transparent);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo-immersive {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.hero-logo-fallback {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo-fallback {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.title-text {
		padding-bottom: 0.25rem;
	}
	.hero-location-immersive {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-400);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: 0.25rem;
	}
	.hero-title-immersive {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--color-surface-50);
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title-immersive {
			font-size: 2rem;
		}
	}
	.hero-immersive-footer {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	@media (min-width: 640px) {
		.hero-immersive-footer {
			flex-direction: row;
			align-items: flex-end;
			justify-content: space-between;
		}
	}
	.hero-tagline-immersive {
		font-size: 1rem;
		color: var(--color-surface-200);
		line-height: 1.5;
		max-width: 28rem;
	}
	.hero-ctas-immersive {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* ═══════════════════════════════════════════════════════════
   NEW RIDER NOTE
   ═══════════════════════════════════════════════════════════ */
	.new-rider-note {
		background: color-mix(in oklab, var(--color-tertiary-500) 10%, var(--panel-bg));
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid color-mix(in oklab, var(--color-tertiary-500) 25%, var(--panel-border));
		border-radius: 1rem;
		padding: 1.25rem;
	}
	:global([data-color-mode='dark']) .new-rider-note {
		background: color-mix(in oklab, var(--color-tertiary-500) 12%, var(--panel-bg-dark));
	}
	.note-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-tertiary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
	}
	:global([data-color-mode='dark']) .note-label {
		color: var(--color-tertiary-400);
	}
	.note-text {
		font-size: 0.9375rem;
		color: var(--color-surface-800);
		line-height: 1.6;
	}
	:global([data-color-mode='dark']) .note-text {
		color: var(--color-surface-200);
	}
	.note-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .note-link {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   DONATE SECTION
   ═══════════════════════════════════════════════════════════ */
	.donate-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.25rem;
	}
	:global([data-color-mode='dark']) .donate-section {
		background: var(--panel-bg-dark);
	}
	.donate-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--panel-border);
	}
	@media (min-width: 640px) {
		.donate-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}
	.donate-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-surface-900);
	}
	:global([data-color-mode='dark']) .donate-title {
		color: var(--color-surface-100);
	}
	.donate-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-secondary-500), var(--color-primary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.donate-presets {
		display: flex;
		gap: 0.5rem;
	}
	.donate-preset {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.5rem 0.875rem;
		border-radius: 0.5rem;
		background: white;
		border: 1px solid var(--color-surface-300);
		color: var(--color-surface-700);
		transition: all 0.15s ease;
	}
	:global([data-color-mode='dark']) .donate-preset {
		background: var(--color-surface-800);
		border-color: var(--color-surface-700);
		color: var(--color-surface-200);
	}
	.donate-preset:hover {
		background: var(--color-surface-50);
		border-color: var(--color-surface-400);
	}
	:global([data-color-mode='dark']) .donate-preset:hover {
		background: var(--color-surface-700);
		border-color: var(--color-surface-600);
	}
	.donate-preset.active {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.donate-input-row {
		display: flex;
		gap: 0.75rem;
	}
	.donate-input-wrap {
		position: relative;
		flex: 1;
	}
	.donate-currency {
		position: absolute;
		left: 1rem;
		top: 50%;
		transform: translateY(-50%);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-surface-500);
		pointer-events: none;
	}
	.donate-input {
		width: 100%;
		height: 2.75rem;
		padding-left: 2rem;
		padding-right: 1rem;
		font-size: 1rem;
		font-weight: 600;
		background: white;
		border: 1px solid var(--color-surface-300);
		border-radius: 0.75rem;
		color: var(--color-surface-900);
		transition: all 0.15s ease;
	}
	.donate-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		background: white;
	}
	:global([data-color-mode='dark']) .donate-input {
		background: var(--color-surface-800);
		border-color: var(--color-surface-700);
		color: var(--color-surface-100);
	}
	:global([data-color-mode='dark']) .donate-currency {
		color: var(--color-surface-400);
	}
	.donate-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		font-size: 0.875rem;
		font-weight: 700;
		padding: 0 1.25rem;
		border-radius: 0.75rem;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
	}
	.donate-btn:hover {
		opacity: 0.9;
	}
	/* ═══════════════════════════════════════════════════════════
   ABOUT SECTION
   ═══════════════════════════════════════════════════════════ */
	.about-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .about-section {
		background: var(--panel-bg-dark);
	}
	.about-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.about-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.about-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .about-label {
		color: var(--color-secondary-300);
	}
	.about-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .about-title {
		color: var(--color-surface-100);
	}
	.about-content {
		margin-bottom: 1.25rem;
	}

	.about-new-rider-note {
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		background: color-mix(in oklab, var(--color-surface-50) 74%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
		border-left: 3px solid color-mix(in oklab, var(--color-primary-500) 42%, transparent);
		border-radius: 0.75rem;
		backdrop-filter: none;
	}

	:global([data-color-mode='dark']) .about-new-rider-note {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
		border-left-color: color-mix(in oklab, var(--color-primary-400) 50%, transparent);
	}

	.about-new-rider-note .note-label {
		margin-bottom: 0.35rem;
	}
	.about-paragraph {
		font-size: 0.9375rem;
		color: var(--color-surface-700);
		line-height: 1.7;
		display: block;
	}
	.about-paragraph + .about-paragraph {
		margin-top: 0.75rem;
	}
	:global([data-color-mode='dark']) .about-paragraph {
		color: var(--color-surface-300);
	}
	.about-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .about-link {
		color: var(--color-primary-400);
	}
	.about-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--panel-border);
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
	}
	.tag-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.tag-secondary {
		background: var(--color-secondary-500);
		color: var(--color-secondary-contrast-500);
	}
	.tag-tonal {
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: var(--color-surface-700);
	}
	:global([data-color-mode='dark']) .tag-tonal {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		color: var(--color-surface-300);
	}

	/* About facts grid */
	.about-facts-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin: 1.25rem 0;
	}

	@media (min-width: 768px) {
		.about-facts-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.about-fact {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.about-fact-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-800);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	:global([data-color-mode='dark']) .about-fact-label {
		color: var(--color-primary-200);
	}

	.about-fact-value {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.4;
	}

	:global([data-color-mode='dark']) .about-fact-value {
		color: var(--color-surface-100);
	}

	.about-fact-link {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.4;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s ease;
	}

	.about-fact-link:hover {
		color: var(--color-primary-500);
	}

	:global([data-color-mode='dark']) .about-fact-link {
		color: var(--color-surface-100);
	}

	:global([data-color-mode='dark']) .about-fact-link:hover {
		color: var(--color-primary-400);
	}

	/* ═══════════════════════════════════════════════════════════
EVENTS SECTION (Unified rides/volunteer/news)
═══════════════════════════════════════════════════════════ */
	.events-section {
		background: color-mix(in oklab, var(--color-surface-50) 82%, transparent);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .events-section {
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}
	.events-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.events-header-main {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
	}
	.events-header-cta {
		margin-left: auto;
		flex-shrink: 0;
	}
	@media (max-width: 640px) {
		.events-header {
			flex-direction: column;
			align-items: flex-start;
		}
		.events-header-cta {
			margin-left: 0;
		}
	}
	.events-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-secondary-500), var(--color-tertiary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.events-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-700);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .events-label {
		color: var(--color-secondary-300);
	}
	.events-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .events-title {
		color: var(--color-surface-100);
	}
	.events-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.event-card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: color-mix(in oklab, var(--color-surface-50) 74%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		border-radius: 0.75rem;
		transition: all 0.15s ease;
	}
	:global([data-color-mode='dark']) .event-card {
		background: color-mix(in oklab, var(--color-surface-950) 66%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 12%, transparent);
	}
	.event-card:hover {
		transform: translateY(-2px);
		background: color-mix(in oklab, var(--color-surface-50) 84%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 26%, transparent);
	}
	:global([data-color-mode='dark']) .event-card:hover {
		background: color-mix(in oklab, var(--color-surface-950) 78%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 30%, transparent);
	}
	.event-date {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 3.5rem;
		background: var(--panel-bg);
		border: 1px solid var(--panel-border);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}
	:global([data-color-mode='dark']) .event-date {
		background: var(--panel-bg-dark);
	}
	.event-month {
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--color-surface-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	:global([data-color-mode='dark']) .event-month {
		color: var(--color-surface-400);
	}
	.event-day {
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--color-surface-900);
	}
	:global([data-color-mode='dark']) .event-day {
		color: var(--color-surface-100);
	}
	.event-content {
		flex: 1;
		min-width: 0;
	}
	.event-type-badge {
		display: inline-block;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		margin-bottom: 0.375rem;
	}
	.badge-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.badge-secondary {
		background: var(--color-secondary-500);
		color: var(--color-secondary-contrast-500);
	}
	.badge-tertiary {
		background: var(--color-tertiary-500);
		color: var(--color-tertiary-contrast-500);
	}
	.event-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--color-surface-900);
		line-height: 1.3;
		margin-bottom: 0.25rem;
	}
	:global([data-color-mode='dark']) .event-title {
		color: var(--color-surface-100);
	}
	.event-card:hover .event-title {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .event-card:hover .event-title {
		color: var(--color-primary-400);
	}
	.event-summary {
		font-size: 0.8125rem;
		color: var(--color-surface-700);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	:global([data-color-mode='dark']) .event-summary {
		color: var(--color-surface-300);
	}
	/* ═══════════════════════════════════════════════════════════
   GALLERY SECTION
   ═══════════════════════════════════════════════════════════ */
	.gallery-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .gallery-section {
		background: var(--panel-bg-dark);
	}
	.gallery-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.gallery-header-main {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
	}
	.gallery-header-cta {
		margin-left: auto;
		flex-shrink: 0;
	}
	@media (max-width: 640px) {
		.gallery-header {
			flex-direction: column;
			align-items: flex-start;
		}
		.gallery-header-cta {
			margin-left: 0;
		}
	}
	.gallery-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.gallery-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-tertiary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .gallery-label {
		color: var(--color-tertiary-400);
	}
	.gallery-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .gallery-title {
		color: var(--color-surface-100);
	}
	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.625rem;
	}
	.gallery-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 0.5rem;
		overflow: hidden;
		cursor: pointer;
	}
	.gallery-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.4s ease;
	}
	.gallery-item:hover img {
		transform: scale(1.05);
	}

	/* Instagram Preview Section */
	.instagram-preview-section {
		margin-top: 1.125rem;
		padding-top: 1rem;
		border-top: 1px solid var(--panel-border);
	}
	.instagram-preview-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}
	:global([data-color-mode='dark']) .instagram-preview-label {
		color: var(--color-secondary-400);
	}
	.instagram-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.625rem;
	}
	.instagram-preview-item {
		position: relative;
		aspect-ratio: 4 / 5;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.instagram-preview-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}
	.instagram-preview-item:hover img {
		transform: scale(1.05);
	}
	.instagram-preview-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.instagram-preview-item:hover .instagram-preview-overlay {
		opacity: 1;
	}
	.gallery-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.75rem;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.gallery-item:hover .gallery-overlay {
		opacity: 1;
	}
	.gallery-view {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(4px);
		padding: 0.375rem 1rem;
		border-radius: 9999px;
	}
	.gallery-footer {
		margin-top: 1rem;
		text-align: center;
	}
	.gallery-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-600);
		transition: color 0.15s ease;
	}
	.gallery-link:hover {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .gallery-link {
		color: var(--color-surface-400);
	}
	:global([data-color-mode='dark']) .gallery-link:hover {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   CONTACT SECTION
   ═══════════════════════════════════════════════════════════ */
	.contact-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .contact-section {
		background: var(--panel-bg-dark);
	}
	.contact-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.contact-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-tertiary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.contact-label-section {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .contact-label-section {
		color: var(--color-primary-200);
	}
	.contact-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-950);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .contact-title {
		color: var(--color-surface-50);
	}
	.contact-links {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.contact-link {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem;
		border-radius: 0.625rem;
		transition: all 0.15s ease;
	}
	.contact-link:hover {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
	}
	.contact-link-icon {
		width: 2.5rem;
		height: 2.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border-radius: 9999px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary-700);
		flex-shrink: 0;
		transition: all 0.15s ease;
	}
	.contact-link:hover .contact-link-icon {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	:global([data-color-mode='dark']) .contact-link-icon {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-300);
	}
	.contact-link-text {
		flex: 1;
		min-width: 0;
	}
	.contact-link-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-950);
		display: block;
	}
	:global([data-color-mode='dark']) .contact-link-label {
		color: var(--color-surface-50);
	}
	.contact-link-value {
		font-size: 0.75rem;
		color: var(--color-surface-700);
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global([data-color-mode='dark']) .contact-link-value {
		color: var(--color-surface-200);
	}
	.contact-link-arrow {
		width: 1rem;
		height: 1rem;
		color: var(--color-surface-600);
		flex-shrink: 0;
		transition: all 0.15s ease;
	}
	.contact-link:hover .contact-link-arrow {
		color: var(--color-primary-500);
		transform: translateX(2px);
	}
	:global([data-color-mode='dark']) .contact-link-arrow {
		color: var(--color-surface-200);
	}
	:global([data-color-mode='dark']) .contact-link:hover .contact-link-arrow {
		color: var(--color-primary-300);
	}
	.custom-content-section {
		padding: 0;
	}
	.custom-content-card {
		background: var(--panel-bg);
		border: 1px solid var(--panel-border);
		border-radius: 1.25rem;
		padding: clamp(1.5rem, 4vw, 3rem);
		backdrop-filter: blur(var(--panel-blur));
	}
	:global([data-color-mode='dark']) .custom-content-card {
		background: var(--panel-bg-dark);
	}
	.custom-callout-section .custom-content-card {
		text-align: center;
	}
	.custom-callout-section.callout-tone-surface .custom-content-card {
		background: var(--panel-bg);
	}
	.custom-callout-section.callout-tone-primary .custom-content-card {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--panel-bg));
		border-color: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
	}
	.custom-callout-section.callout-tone-secondary .custom-content-card {
		background: color-mix(in oklab, var(--color-secondary-500) 10%, var(--panel-bg));
		border-color: color-mix(in oklab, var(--color-secondary-500) 24%, transparent);
	}
	.custom-callout-section.callout-tone-tertiary .custom-content-card {
		background: color-mix(in oklab, var(--color-tertiary-500) 10%, var(--panel-bg));
		border-color: color-mix(in oklab, var(--color-tertiary-500) 24%, transparent);
	}
	:global([data-color-mode='dark'])
		.custom-callout-section.callout-tone-surface
		.custom-content-card {
		background: var(--panel-bg-dark);
	}
	:global([data-color-mode='dark'])
		.custom-callout-section.callout-tone-primary
		.custom-content-card {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--panel-bg-dark));
	}
	:global([data-color-mode='dark'])
		.custom-callout-section.callout-tone-secondary
		.custom-content-card {
		background: color-mix(in oklab, var(--color-secondary-500) 10%, var(--panel-bg-dark));
	}
	:global([data-color-mode='dark'])
		.custom-callout-section.callout-tone-tertiary
		.custom-content-card {
		background: color-mix(in oklab, var(--color-tertiary-500) 10%, var(--panel-bg-dark));
	}
	.custom-content-label {
		color: var(--color-primary-600);
		font-size: 0.75rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.custom-content-title {
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		font-weight: 800;
		line-height: 1.08;
		letter-spacing: -0.03em;
		margin-top: 0.35rem;
		overflow-wrap: anywhere;
	}
	:global(.custom-content-body) {
		display: block;
		line-height: 1.75;
		margin: 0.9rem auto 0;
		max-width: 52rem;
		opacity: 0.78;
		white-space: pre-line;
	}
	:global(.custom-content-link) {
		color: var(--color-primary-600);
		font-weight: 650;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.custom-content-button {
		margin-top: 1.25rem;
	}
	/* ═══════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════ */
	.site-footer {
		text-align: center;
		padding-top: 2rem;
		border-top: 1px solid var(--panel-border);
		margin-top: 1rem;
	}
	.footer-community-bridge {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		max-width: 72rem;
		margin: 0 auto 2rem;
		padding: clamp(1.25rem, 3vw, 2rem);
		border: 1px solid rgb(215 242 5 / 0.3);
		border-radius: 1.25rem;
		background: #17324d;
		color: #ffffff;
		text-align: left;
		box-shadow: 0 18px 42px -32px rgb(16 32 46 / 0.7);
	}
	.footer-community-copy {
		max-width: 42rem;
	}
	.footer-community-label {
		margin: 0 0 0.4rem;
		color: #d7f205;
		font-size: 0.72rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.footer-community-copy h2 {
		margin: 0;
		font-size: clamp(1.35rem, 3vw, 2.2rem);
		font-weight: 850;
		line-height: 1.05;
		letter-spacing: -0.04em;
	}
	.footer-community-copy > p:last-child {
		max-width: 38rem;
		margin: 0.7rem 0 0;
		color: rgb(255 255 255 / 0.78);
		font-size: 0.95rem;
		line-height: 1.6;
	}
	.footer-community-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding: 0.7rem 1rem;
		border-radius: 0.45rem;
		background: #d7f205;
		color: #10202e;
		font-size: 0.9rem;
		font-weight: 850;
		text-decoration: none;
		transition:
			background-color 160ms ease,
			transform 160ms ease;
	}
	.footer-community-button:hover {
		background: #e5ff22;
		transform: translateY(-1px);
	}
	:global([data-color-mode='dark']) .footer-community-bridge {
		border-color: rgb(215 242 5 / 0.34);
		background: #18334b;
	}
	.footer-blurb {
		font-size: 0.875rem;
		color: var(--color-surface-600);
		max-width: 36rem;
		margin: 0 auto 0.75rem;
		line-height: 1.6;
	}
	:global(.footer-blurb) {
		font-size: 0.875rem;
		color: #526675;
		max-width: 36rem;
		margin: 0 auto 0.75rem;
		line-height: 1.6;
	}
	:global([data-color-mode='dark']) .footer-blurb {
		color: var(--color-surface-400);
	}
	:global([data-color-mode='dark']) :global(.footer-blurb) {
		color: #b7c6ce;
	}
	.footer-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.footer-link) {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .footer-link {
		color: var(--color-primary-400);
	}
	:global([data-color-mode='dark']) :global(.footer-link) {
		color: var(--advocacy-lime);
	}
	.footer-powered {
		font-size: 0.75rem;
		color: var(--color-surface-500);
		font-weight: 600;
	}
	:global([data-color-mode='dark']) .footer-powered {
		color: rgb(183 198 206 / 0.72);
	}
	.footer-brand {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	@media (max-width: 640px) {
		.footer-community-bridge {
			align-items: stretch;
			flex-direction: column;
			gap: 1rem;
		}

		.footer-community-button {
			align-self: flex-start;
		}
	}

	/* Advocacy presentation: restrained surfaces, clear hierarchy, and one
	   intentional accent per section. */
	.site-advocacy {
		--advocacy-ink: #10202e;
		--advocacy-blue: #17324d;
		--advocacy-lime: #d7f205;
		--advocacy-coral: #f05a3c;
		--advocacy-line: rgb(16 32 46 / 0.14);
		--advocacy-muted: #526675;
		gap: 1.5rem;
		padding-top: 1.5rem;
	}

	.site-advocacy [data-site-block-type='hero'] > .card,
	.site-advocacy [data-site-block-type='hero'] > .bg-surface-950 {
		min-height: clamp(27rem, 46vw, 36rem);
		aspect-ratio: auto;
		border-radius: 1rem;
		background: var(--advocacy-ink);
		box-shadow: 0 20px 40px -28px rgb(16 32 46 / 0.7);
	}

	.site-advocacy [data-site-block-type='hero'] > .card > .site-advocacy-hero-image,
	.site-advocacy [data-site-block-type='hero'] > .bg-surface-950 img {
		opacity: 0.45;
		filter: saturate(0.72) contrast(1.08);
	}

	.site-advocacy [data-site-block-type='hero'] h1 {
		max-width: 12ch;
		font-size: clamp(2.7rem, 7vw, 5.6rem);
		line-height: 0.92;
		letter-spacing: -0.055em;
	}

	.site-advocacy [data-site-block-type='hero'] .bg-primary-500 {
		background: var(--advocacy-lime);
		color: var(--advocacy-ink);
	}

	.site-advocacy .custom-content-card {
		border-color: var(--advocacy-line);
		border-radius: 1rem;
		background: #ffffff;
		box-shadow: 0 14px 30px -28px rgb(16 32 46 / 0.55);
		backdrop-filter: none;
	}

	.site-advocacy .custom-content-section:not(.custom-callout-section) .custom-content-card {
		max-width: 62rem;
		margin: 0 auto;
	}

	.site-advocacy .custom-content-label,
	.site-advocacy .laws-directory-kicker {
		color: var(--advocacy-blue);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.site-advocacy .custom-content-title {
		max-width: 22ch;
		color: var(--advocacy-ink);
		font-size: clamp(1.75rem, 4vw, 3rem);
		line-height: 1;
	}

	.site-advocacy .custom-content-body {
		max-width: 50rem;
		color: var(--advocacy-muted);
		font-size: 1.04rem;
		line-height: 1.7;
		opacity: 1;
	}

	.site-advocacy .custom-callout-section .custom-content-card {
		border-left: 5px solid var(--advocacy-blue);
		background: #eaf1f5;
		text-align: left;
	}

	.site-advocacy .custom-callout-section.callout-tone-tertiary .custom-content-card {
		border-left-color: var(--advocacy-coral);
		background: #fff4ee;
	}

	.site-advocacy .custom-callout-section.callout-tone-surface .custom-content-card {
		border-left-color: var(--advocacy-lime);
		background: #ffffff;
	}

	.site-advocacy .custom-callout-section .custom-content-title {
		max-width: 26ch;
	}

	.site-advocacy .custom-content-button {
		background: var(--advocacy-ink);
		color: #ffffff;
		box-shadow: none;
	}

	.site-advocacy .custom-content-button:hover {
		background: var(--advocacy-blue);
	}

	.site-advocacy .custom-content-card .input {
		border-color: var(--advocacy-line);
		background: #f8faf7;
	}

	.site-advocacy .laws-directory-section {
		min-width: 0;
	}

	.site-advocacy .laws-directory-card {
		border: 1px solid var(--advocacy-line);
		border-radius: 1rem;
		background: #ffffff;
		box-shadow: 0 18px 34px -30px rgb(16 32 46 / 0.58);
		overflow: hidden;
	}

	.site-advocacy .laws-directory-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		background: var(--advocacy-ink);
		color: #ffffff;
	}

	.site-advocacy .laws-directory-heading-copy {
		min-width: 0;
	}

	.site-advocacy .laws-directory-kicker {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--advocacy-lime);
	}

	.site-advocacy .laws-directory-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.55rem;
		background: rgb(215 242 5 / 0.14);
	}

	.site-advocacy .laws-directory-title {
		max-width: 15ch;
		margin-top: 0.7rem;
		font-size: clamp(2rem, 5vw, 3.8rem);
		font-weight: 850;
		line-height: 0.95;
		letter-spacing: -0.055em;
	}

	.site-advocacy .laws-directory-intro {
		max-width: 40rem;
		margin-top: 1rem;
		color: rgb(255 255 255 / 0.72);
		font-size: 1rem;
		line-height: 1.65;
	}

	.site-advocacy .laws-directory-trust {
		display: flex;
		flex: 0 0 auto;
		align-items: flex-start;
		gap: 0.65rem;
		max-width: 14rem;
		padding: 0.8rem;
		border: 1px solid rgb(255 255 255 / 0.16);
		border-radius: 0.7rem;
		color: var(--advocacy-lime);
	}

	.site-advocacy .laws-directory-trust strong,
	.site-advocacy .laws-directory-trust span {
		display: block;
	}

	.site-advocacy .laws-directory-trust strong {
		font-size: 0.78rem;
	}

	.site-advocacy .laws-directory-trust span {
		margin-top: 0.2rem;
		color: rgb(255 255 255 / 0.62);
		font-size: 0.7rem;
		line-height: 1.35;
	}

	.site-advocacy .laws-directory-controls {
		display: grid;
		gap: 1rem;
		padding: 1rem clamp(1.25rem, 4vw, 2.5rem);
		border-bottom: 1px solid var(--advocacy-line);
		background: #f8faf7;
	}

	.site-advocacy .laws-directory-search {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
		padding: 0 0.85rem;
		border: 1px solid var(--advocacy-line);
		border-radius: 0.65rem;
		background: #ffffff;
		color: var(--advocacy-blue);
	}

	.site-advocacy .laws-directory-search input {
		min-width: 0;
		width: 100%;
		padding: 0.82rem 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--advocacy-ink);
		font-size: 0.95rem;
	}

	.site-advocacy .laws-directory-search input::placeholder {
		color: #788b98;
	}

	.site-advocacy .laws-directory-search button {
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 999px;
		color: var(--advocacy-muted);
		font-size: 1.4rem;
		line-height: 1;
	}

	.site-advocacy .laws-directory-search button:hover {
		background: #edf5a8;
		color: var(--advocacy-ink);
	}

	.site-advocacy .laws-directory-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.site-advocacy .laws-directory-filters button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.48rem 0.7rem;
		border: 1px solid transparent;
		border-radius: 999px;
		color: var(--advocacy-muted);
		font-size: 0.78rem;
		font-weight: 700;
		transition:
			background 150ms ease,
			color 150ms ease,
			border-color 150ms ease;
	}

	.site-advocacy .laws-directory-filters button span {
		display: grid;
		place-items: center;
		min-width: 1.35rem;
		height: 1.35rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: #e7ece8;
		font-size: 0.68rem;
	}

	.site-advocacy .laws-directory-filters button:hover,
	.site-advocacy .laws-directory-filters button.active {
		border-color: var(--advocacy-blue);
		background: var(--advocacy-blue);
		color: #ffffff;
	}

	.site-advocacy .laws-directory-filters button.active span {
		background: rgb(255 255 255 / 0.18);
	}

	.site-advocacy .laws-directory-summary {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem clamp(1.25rem, 4vw, 2.5rem);
		color: var(--advocacy-muted);
		font-size: 0.76rem;
		font-weight: 650;
	}

	.site-advocacy .laws-directory-list {
		padding: 0 clamp(1.25rem, 4vw, 2.5rem);
	}

	.site-advocacy .law-entry {
		border-top: 1px solid var(--advocacy-line);
	}

	.site-advocacy .law-entry-summary {
		display: grid;
		grid-template-columns: minmax(10rem, 1.1fr) minmax(12rem, 1.4fr) minmax(10rem, auto) auto;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0;
		cursor: pointer;
		list-style: none;
	}

	.site-advocacy .law-entry-summary::-webkit-details-marker {
		display: none;
	}

	.site-advocacy .law-entry-state {
		color: var(--advocacy-ink);
		font-size: 1rem;
		font-weight: 800;
	}

	.site-advocacy .law-entry-distance {
		color: var(--advocacy-blue);
		font-size: 0.85rem;
		font-weight: 700;
	}

	.site-advocacy .law-entry-status {
		justify-self: start;
		padding: 0.32rem 0.55rem;
		border-radius: 999px;
		background: #edf5a8;
		color: var(--advocacy-ink);
		font-size: 0.68rem;
		font-weight: 750;
		white-space: nowrap;
	}

	.site-advocacy .law-entry-chevron {
		color: var(--advocacy-blue);
		font-size: 1.25rem;
		transition: transform 150ms ease;
	}

	.site-advocacy .law-entry[open] .law-entry-chevron {
		transform: rotate(180deg);
	}

	.site-advocacy .law-entry-detail {
		display: grid;
		gap: 1rem;
		padding: 0 0 1.25rem;
	}

	.site-advocacy .law-entry-summary-copy {
		max-width: 58rem;
		color: var(--advocacy-muted);
		font-size: 0.94rem;
		line-height: 1.65;
	}

	.site-advocacy .law-entry-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 2rem;
		padding: 0.9rem;
		border-radius: 0.65rem;
		background: #f4f6f3;
	}

	.site-advocacy .law-entry-meta span,
	.site-advocacy .law-entry-meta strong {
		display: block;
	}

	.site-advocacy .law-entry-meta span {
		margin-bottom: 0.25rem;
		color: var(--advocacy-muted);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.site-advocacy .law-entry-meta strong {
		color: var(--advocacy-ink);
		font-size: 0.82rem;
	}

	.site-advocacy .law-entry-source {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		width: fit-content;
		max-width: 100%;
		padding: 0.6rem 0.75rem;
		border-radius: 0.55rem;
		background: var(--advocacy-ink);
		color: #ffffff;
		font-size: 0.78rem;
		font-weight: 750;
		text-decoration: none;
	}

	.site-advocacy .law-entry-source:hover {
		background: var(--advocacy-blue);
	}

	.site-advocacy .laws-directory-empty {
		display: grid;
		place-items: center;
		gap: 0.6rem;
		padding: 3rem 1rem;
		color: var(--advocacy-muted);
		text-align: center;
	}

	.site-advocacy .laws-directory-disclaimer {
		margin: 0 clamp(1.25rem, 4vw, 2.5rem) 1.35rem;
		padding-top: 1rem;
		border-top: 1px solid var(--advocacy-line);
		color: var(--advocacy-muted);
		font-size: 0.73rem;
		line-height: 1.55;
	}

	:global([data-color-mode='dark']) .site-advocacy {
		--advocacy-line: rgb(244 247 245 / 0.14);
		--advocacy-muted: #b7c6ce;
	}

	:global([data-color-mode='dark']) .site-advocacy .custom-content-card,
	:global([data-color-mode='dark']) .site-advocacy .laws-directory-card,
	:global([data-color-mode='dark']) .site-advocacy .laws-directory-search {
		background: #12263a;
	}

	:global([data-color-mode='dark']) .site-advocacy .custom-content-title,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-state,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-meta strong {
		color: #f4f7f5;
	}

	:global([data-color-mode='dark']) .site-advocacy .custom-content-label,
	:global([data-color-mode='dark']) .site-advocacy .laws-directory-kicker,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-distance {
		color: var(--advocacy-lime);
	}

	:global([data-color-mode='dark']) .site-advocacy .custom-content-body,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-summary-copy,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-meta span {
		color: var(--advocacy-muted);
	}

	:global([data-color-mode='dark']) .site-advocacy :global(.custom-content-body) {
		color: var(--advocacy-muted);
	}

	:global([data-color-mode='dark']) .site-advocacy .custom-callout-section .custom-content-card {
		background: #18334b;
	}

	:global([data-color-mode='dark'])
		.site-advocacy
		.custom-callout-section.callout-tone-tertiary
		.custom-content-card {
		background: #422d2c;
	}

	:global([data-color-mode='dark'])
		.site-advocacy
		.custom-callout-section.callout-tone-surface
		.custom-content-card {
		background: #12263a;
	}

	:global([data-color-mode='dark']) .site-advocacy .laws-directory-controls,
	:global([data-color-mode='dark']) .site-advocacy .law-entry-meta {
		background: #0d1b29;
	}

	:global([data-color-mode='dark']) .site-advocacy .laws-directory-summary,
	:global([data-color-mode='dark']) .site-advocacy .laws-directory-disclaimer {
		color: var(--advocacy-muted);
	}

	@media (max-width: 700px) {
		.site-advocacy .laws-directory-heading {
			flex-direction: column;
			gap: 1.25rem;
		}

		.site-advocacy .laws-directory-trust {
			max-width: none;
			width: 100%;
		}

		.site-advocacy .law-entry-summary {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.45rem 0.75rem;
		}

		.site-advocacy .law-entry-distance {
			grid-column: 1;
			grid-row: 2;
		}

		.site-advocacy .law-entry-status {
			grid-column: 1;
			grid-row: 3;
			justify-self: start;
		}

		.site-advocacy .law-entry-chevron {
			grid-column: 2;
			grid-row: 1 / span 3;
			align-self: center;
		}

		.site-advocacy .laws-directory-summary {
			flex-direction: column;
			gap: 0.25rem;
		}
	}

	/* Homepage composition: full-bleed campaign hero, editorial rhythm, and
	   action cards that read as invitations instead of a stack of panels. */
	.site-advocacy.site-advocacy-home {
		max-width: none;
		gap: 0;
		padding: 0 0 5rem;
		background: #f4f6f3;
	}

	.site-advocacy-home > section:not([data-site-block-type='hero']) {
		width: min(calc(100% - 2rem), 72rem);
		margin: 1.5rem auto 0;
	}

	.site-advocacy-home > section[data-site-block-type='hero'] {
		width: 100%;
		margin: 0;
	}

	.site-advocacy-home [data-site-block-type='hero'] > .card {
		min-height: min(84svh, 47rem);
		border-radius: 0;
		box-shadow: none;
	}

	.site-advocacy-home [data-site-block-type='hero'] > .card > .site-advocacy-hero-image {
		opacity: 0.72;
		filter: saturate(1.08) contrast(1.06);
	}

	.site-advocacy-home [data-site-block-type='hero'] > .card > .site-advocacy-hero-vignette {
		opacity: 0.7;
		background: linear-gradient(
			to top,
			rgb(9 19 27 / 0.94) 4%,
			rgb(9 19 27 / 0.58) 46%,
			rgb(9 19 27 / 0.12) 100%
		);
	}

	.site-advocacy-home [data-site-block-type='hero'] > .card > .site-advocacy-hero-wash {
		opacity: 0.3;
		background: linear-gradient(110deg, rgb(9 19 27 / 0.58), transparent 62%);
	}

	.site-advocacy-home .site-advocacy-hero-copy {
		max-width: 46rem;
		padding: 0;
		border: 0;
		background: transparent;
		backdrop-filter: none;
	}

	.site-advocacy-home .site-advocacy-hero-kicker {
		display: inline-flex;
		align-self: flex-start;
		margin-top: 0;
		padding: 0.55rem 0.8rem;
		background: var(--advocacy-lime);
		color: var(--advocacy-ink);
		font-size: clamp(0.68rem, 1.2vw, 0.82rem);
		font-weight: 850;
		font-style: italic;
		letter-spacing: 0.055em;
		line-height: 1;
		text-transform: uppercase;
	}

	.site-advocacy-home [data-site-block-type='hero'] h1 {
		max-width: 12ch;
		color: #ffffff;
		font-size: clamp(3.2rem, 8vw, 6.8rem);
		line-height: 0.86;
		letter-spacing: -0.065em;
		text-shadow: 0 3px 24px rgb(0 0 0 / 0.4);
	}

	.site-advocacy-home [data-site-block-type='hero'] .btn,
	.site-advocacy-home [data-site-block-type='hero'] a {
		border-radius: 0.35rem;
	}

	.site-advocacy-home [data-site-block-type='hero'] a:first-child {
		background: var(--advocacy-lime);
		color: var(--advocacy-ink);
		box-shadow: 0 10px 24px -12px rgb(215 242 5 / 0.9);
	}

	.site-advocacy-home [data-site-block-type='hero'] a:first-child:hover {
		background: #e5ff22;
	}

	.site-advocacy-home [data-site-block-type='hero'] a:nth-child(2) {
		border: 1px solid rgb(255 255 255 / 0.72);
		background: rgb(9 19 27 / 0.18);
		color: #ffffff;
		backdrop-filter: blur(6px);
	}

	.site-advocacy-home .custom-content-section:not(.custom-callout-section) .custom-content-card {
		padding: clamp(1.75rem, 5vw, 4rem);
	}

	.site-advocacy-home
		.custom-callout-section:not([data-site-block-type='email_signup'])
		.custom-content-card {
		display: grid;
		grid-template-columns: minmax(0, 1.08fr) minmax(15rem, 0.92fr);
		column-gap: clamp(1.5rem, 5vw, 4.5rem);
		align-items: end;
	}

	.site-advocacy-home
		.custom-callout-section:not([data-site-block-type='email_signup'])
		.custom-content-label {
		grid-column: 1 / -1;
	}

	.site-advocacy-home
		.custom-callout-section:not([data-site-block-type='email_signup'])
		.custom-content-title {
		grid-column: 1;
		grid-row: 2;
	}

	.site-advocacy-home
		.custom-callout-section:not([data-site-block-type='email_signup'])
		.custom-content-body {
		grid-column: 2;
		grid-row: 2;
		margin: 0;
	}

	.site-advocacy-home
		.custom-callout-section:not([data-site-block-type='email_signup'])
		.custom-content-button {
		grid-column: 2;
		grid-row: 3;
		justify-self: start;
	}

	.site-advocacy-home .gallery-section {
		padding: clamp(1.25rem, 4vw, 2.5rem);
		border-color: var(--advocacy-line);
		border-radius: 1rem;
		background: #ffffff;
		box-shadow: 0 18px 34px -30px rgb(16 32 46 / 0.58);
		backdrop-filter: none;
	}

	.site-advocacy-home .gallery-header {
		align-items: end;
		margin-bottom: 1.4rem;
	}

	.site-advocacy-home .gallery-icon {
		background: var(--advocacy-lime);
		color: var(--advocacy-ink);
	}

	.site-advocacy-home .gallery-label {
		color: var(--advocacy-coral);
	}

	.site-advocacy-home .gallery-title {
		color: var(--advocacy-ink);
		font-size: clamp(1.5rem, 3vw, 2.35rem);
		letter-spacing: -0.04em;
	}

	.site-advocacy-home .gallery-grid {
		grid-template-columns: 1.25fr 0.88fr;
		grid-template-rows: repeat(2, clamp(9rem, 18vw, 14rem));
		gap: 0.8rem;
	}

	.site-advocacy-home .gallery-item:first-child {
		grid-row: 1 / span 2;
		aspect-ratio: auto;
	}

	.site-advocacy-home .gallery-item {
		border-radius: 0.75rem;
	}

	.site-advocacy-home .gallery-header-cta {
		border-color: var(--advocacy-line);
		background: #f4f6f3;
		color: var(--advocacy-blue);
	}

	.site-advocacy-home [data-site-block-type='email_signup'] .custom-content-card {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(19rem, 1.1fr);
		column-gap: clamp(1.5rem, 5vw, 4.5rem);
		align-items: center;
		border-color: var(--advocacy-lime);
		background: var(--advocacy-lime);
	}

	.site-advocacy-home [data-site-block-type='email_signup'] .custom-content-label,
	.site-advocacy-home [data-site-block-type='email_signup'] .custom-content-title {
		grid-column: 1;
		color: var(--advocacy-ink);
	}

	.site-advocacy-home [data-site-block-type='email_signup'] :global(.custom-content-body) {
		grid-column: 1;
		color: var(--advocacy-ink);
	}

	.site-advocacy-home [data-site-block-type='email_signup'] form {
		grid-column: 2;
		grid-row: 1 / span 3;
		max-width: none;
		margin-top: 0;
	}

	.site-advocacy-home [data-site-block-type='email_signup'] .input {
		border-color: rgb(16 32 46 / 0.18);
		background: rgb(255 255 255 / 0.78);
		color: var(--advocacy-ink);
	}

	.site-advocacy-home [data-site-block-type='email_signup'] .btn {
		background: var(--advocacy-ink);
		color: #ffffff;
	}

	.site-advocacy-home [data-site-block-type='email_signup'] .btn:hover {
		background: var(--advocacy-blue);
	}

	:global([data-color-mode='dark']) .site-advocacy.site-advocacy-home {
		background: #0d1b29;
	}

	:global([data-color-mode='dark']) .site-advocacy-home .gallery-section {
		background: #12263a;
	}

	:global([data-color-mode='dark']) .site-advocacy-home .gallery-title {
		color: #f4f7f5;
	}

	:global([data-color-mode='dark']) .site-advocacy-home .gallery-header-cta {
		background: #18334b;
		color: #f4f7f5;
	}

	:global([data-color-mode='dark'])
		.site-advocacy-home
		[data-site-block-type='email_signup']
		.custom-content-card {
		background: var(--advocacy-lime);
		color: var(--advocacy-ink);
	}

	:global([data-color-mode='dark'])
		.site-advocacy-home
		[data-site-block-type='email_signup']
		.custom-content-label,
	:global([data-color-mode='dark'])
		.site-advocacy-home
		[data-site-block-type='email_signup']
		.custom-content-title,
	:global([data-color-mode='dark'])
		.site-advocacy-home
		[data-site-block-type='email_signup']
		:global(.custom-content-body) {
		color: var(--advocacy-ink);
	}

	@media (max-width: 700px) {
		.site-advocacy-home [data-site-block-type='hero'] > .card {
			min-height: min(88svh, 46rem);
		}

		.site-advocacy-home [data-site-block-type='hero'] h1 {
			font-size: clamp(2.8rem, 14vw, 4.3rem);
		}

		.site-advocacy-home
			.custom-callout-section:not([data-site-block-type='email_signup'])
			.custom-content-card,
		.site-advocacy-home [data-site-block-type='email_signup'] .custom-content-card {
			display: block;
		}

		.site-advocacy-home
			.custom-callout-section:not([data-site-block-type='email_signup'])
			.custom-content-body {
			margin-top: 0.9rem;
		}

		.site-advocacy-home
			.custom-callout-section:not([data-site-block-type='email_signup'])
			.custom-content-button {
			margin-top: 1.25rem;
		}

		.site-advocacy-home [data-site-block-type='email_signup'] form {
			margin-top: 1.5rem;
		}

		.site-advocacy-home .gallery-grid {
			grid-template-rows: 12rem 8rem;
		}
	}
	:global([data-color-mode='dark']) .footer-brand {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   LIGHTBOX
   ═══════════════════════════════════════════════════════════ */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20000;
		background: color-mix(in oklab, var(--color-surface-950) 95%, transparent);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.lightbox-panel {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
		width: 100%;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border-radius: 1rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}
	.lightbox-counter {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-100);
	}
	.lightbox-counter span {
		color: var(--color-surface-500);
	}
	.lightbox-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: var(--color-surface-100);
		transition: background-color 0.15s ease;
	}
	.lightbox-close:hover {
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}
	.lightbox-stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: 1rem;
	}
	.lightbox-image {
		max-width: 100%;
		max-height: 60vh;
		object-fit: contain;
		border-radius: 0.5rem;
	}
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
		color: var(--color-surface-100);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		opacity: 0.7;
	}
	.lightbox-nav:hover {
		opacity: 1;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}
	.lightbox-prev {
		left: 1rem;
	}
	.lightbox-next {
		right: 1rem;
	}
	.lightbox-thumbnails {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
	}
	.lightbox-thumbnails::-webkit-scrollbar {
		height: 4px;
	}
	.lightbox-thumbnails::-webkit-scrollbar-track {
		background: transparent;
	}
	.lightbox-thumbnails::-webkit-scrollbar-thumb {
		background: color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		border-radius: 2px;
	}
	.thumbnail {
		flex-shrink: 0;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 0.15s ease;
		opacity: 0.6;
	}
	.thumbnail:hover,
	.thumbnail.active {
		opacity: 1;
		border-color: var(--color-primary-500);
	}
	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* ═══════════════════════════════════════════════════════════
   PANEL STYLE VARIANTS
   ═══════════════════════════════════════════════════════════ */
	.microsite-page.panel-filled .quick-info,
	.microsite-page.panel-filled .new-rider-note,
	.microsite-page.panel-filled .donate-section,
	.microsite-page.panel-filled .about-section,
	.microsite-page.panel-filled .events-section,
	.microsite-page.panel-filled .gallery-section,
	.microsite-page.panel-filled .contact-section {
		backdrop-filter: none;
	}
	.microsite-page.panel-outlined .quick-info,
	.microsite-page.panel-outlined .new-rider-note,
	.microsite-page.panel-outlined .donate-section,
	.microsite-page.panel-outlined .about-section,
	.microsite-page.panel-outlined .events-section,
	.microsite-page.panel-outlined .gallery-section,
	.microsite-page.panel-outlined .contact-section {
		--panel-blur: 8px;
	}

	/* ═══════════════════════════════════════════════════════════
ABOUT FAQ — Nested accordion within About section
═══════════════════════════════════════════════════════════ */
	.about-faq {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--panel-border);
	}
	.about-faq-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}
	:global([data-color-mode='dark']) .about-faq-label {
		color: var(--color-secondary-400);
	}

	/* Shared FAQ component styles */
	.faq-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.faq-item {
		border: 1px solid var(--panel-border);
		border-radius: 0.75rem;
		overflow: hidden;
	}
	.faq-question {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 1rem;
		background: color-mix(in oklab, var(--color-surface-500) 5%, transparent);
		color: var(--color-surface-900);
		font-weight: 600;
		font-size: 0.9375rem;
		text-align: left;
		transition: background-color 0.15s ease;
	}
	.faq-question:hover {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
	}
	:global([data-color-mode='dark']) .faq-question {
		color: var(--color-surface-100);
	}
	.faq-chevron {
		width: 1.25rem;
		height: 1.25rem;
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}
	.faq-chevron.open {
		transform: rotate(180deg);
	}
	.faq-answer {
		padding: 0 1rem 1rem;
		color: var(--color-surface-700);
		font-size: 0.9375rem;
		line-height: 1.6;
	}
	:global([data-color-mode='dark']) .faq-answer {
		color: var(--color-surface-300);
	}

	/* ═══════════════════════════════════════════════════════════
RIDES WIDGET SECTION — Standalone iframe embed
═══════════════════════════════════════════════════════════ */
	.rides-widget-section {
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--panel-border);
	}
	.rides-widget-iframe {
		width: 100%;
		aspect-ratio: 16/10;
		min-height: 400px;
		border: none;
		display: block;
	}

	/* ═══════════════════════════════════════════════════════════
SPONSORS SECTION
═══════════════════════════════════════════════════════════ */
	.sponsor-section {
		position: relative;
		overflow: hidden;
		background:
			radial-gradient(
				90% 140% at 0% 0%,
				color-mix(in oklab, var(--color-tertiary-500) 22%, transparent) 0%,
				transparent 55%
			),
			radial-gradient(
				70% 120% at 100% 100%,
				color-mix(in oklab, var(--color-secondary-500) 20%, transparent) 0%,
				transparent 58%
			),
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--color-surface-50) 82%, transparent),
				color-mix(in oklab, var(--color-primary-500) 10%, transparent)
			);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 26%, transparent);
		border-radius: 1.15rem;
		padding: 1.35rem;
		box-shadow: inset 0 1px 0 color-mix(in oklab, var(--color-surface-50) 45%, transparent);
	}
	.sponsor-section::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			120deg,
			color-mix(in oklab, var(--color-primary-500) 10%, transparent) 0%,
			transparent 40%,
			color-mix(in oklab, var(--color-tertiary-500) 8%, transparent) 100%
		);
		opacity: 0.45;
	}
	:global([data-color-mode='dark']) .sponsor-section {
		background:
			radial-gradient(
				90% 140% at 0% 0%,
				color-mix(in oklab, var(--color-tertiary-500) 28%, transparent) 0%,
				transparent 58%
			),
			radial-gradient(
				75% 120% at 100% 100%,
				color-mix(in oklab, var(--color-secondary-500) 24%, transparent) 0%,
				transparent 60%
			),
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--color-surface-950) 72%, transparent),
				color-mix(in oklab, var(--color-primary-500) 14%, transparent)
			);
		border-color: color-mix(in oklab, var(--color-primary-400) 34%, transparent);
		box-shadow: inset 0 1px 0 color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}
	.sponsor-card {
		position: relative;
		z-index: 1;
		background: transparent;
	}
	.sponsor-header {
		margin-bottom: 1rem;
	}
	.sponsor-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-primary-800);
		letter-spacing: 0.17em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .sponsor-label {
		color: var(--color-primary-200);
	}
	.sponsor-title {
		font-size: 1.95rem;
		font-weight: 900;
		color: var(--color-surface-950);
		line-height: 1.1;
		margin-top: 0.35rem;
		max-width: 22ch;
	}
	:global([data-color-mode='dark']) .sponsor-title {
		color: var(--color-surface-50);
	}
	@media (max-width: 640px) {
		.sponsor-title {
			font-size: 1.4rem;
		}
	}
	.sponsor-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 0.85rem;
	}
	.sponsor-item-link,
	.sponsor-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		min-height: 5.25rem;
		background: color-mix(in oklab, var(--color-surface-50) 78%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		border-radius: 0.9rem;
		padding: 0.8rem 0.9rem;
		transition:
			transform 170ms ease,
			border-color 170ms ease,
			background 170ms ease,
			box-shadow 170ms ease;
	}
	.sponsor-item-link {
		text-decoration: none;
	}
	.sponsor-item-link:hover {
		transform: translateY(-2px);
		border-color: color-mix(in oklab, var(--color-primary-500) 38%, transparent);
		background: color-mix(in oklab, var(--color-surface-50) 90%, transparent);
		box-shadow: 0 10px 20px -14px color-mix(in oklab, var(--color-primary-500) 44%, transparent);
	}
	:global([data-color-mode='dark']) .sponsor-item-link,
	:global([data-color-mode='dark']) .sponsor-item {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}
	:global([data-color-mode='dark']) .sponsor-item-link:hover {
		background: color-mix(in oklab, var(--color-surface-950) 82%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 42%, transparent);
		box-shadow: 0 10px 20px -14px color-mix(in oklab, var(--color-primary-400) 45%, transparent);
	}
	.sponsor-logo-frame {
		display: flex;
		width: 3rem;
		height: 3rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 34%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-surface-50) 52%, transparent),
			0 3px 8px rgb(0 0 0 / 0.14);
	}
	.sponsor-logo-frame.logo-bg-light {
		background: color-mix(in oklab, var(--color-surface-50) 90%, var(--color-primary-500) 10%);
	}
	.sponsor-logo-frame.logo-bg-dark {
		background: color-mix(in oklab, var(--color-surface-950) 88%, var(--color-surface-50) 12%);
	}
	.sponsor-logo-frame.logo-bg-auto {
		background: color-mix(in oklab, var(--color-surface-500) 26%, transparent);
	}
	:global([data-color-mode='dark']) .sponsor-logo-frame {
		border-color: color-mix(in oklab, var(--color-surface-50) 20%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-surface-50) 12%, transparent),
			0 3px 10px rgb(0 0 0 / 0.38);
	}
	.sponsor-logo-frame img {
		max-height: 2.2rem;
		max-width: 2.2rem;
		object-fit: contain;
	}
	.sponsor-content {
		flex: 1;
		min-width: 0;
	}
	.sponsor-name {
		font-size: 1.03rem;
		font-weight: 800;
		color: var(--color-surface-950);
		line-height: 1.25;
	}
	:global([data-color-mode='dark']) .sponsor-name {
		color: var(--color-surface-50);
	}
	.sponsor-text {
		font-size: 0.875rem;
		color: var(--color-surface-700);
		line-height: 1.35;
		margin-top: 0.25rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	:global([data-color-mode='dark']) .sponsor-text {
		color: var(--color-surface-200);
	}
	.sponsor-arrow {
		width: 1.1rem;
		height: 1.1rem;
		color: var(--color-surface-600);
		flex-shrink: 0;
		transition:
			transform 170ms ease,
			color 170ms ease;
	}
	:global([data-color-mode='dark']) .sponsor-arrow {
		color: var(--color-surface-200);
	}
	.sponsor-item-link:hover .sponsor-arrow {
		color: var(--color-primary-500);
		transform: translateX(3px);
	}
	:global([data-color-mode='dark']) .sponsor-item-link:hover .sponsor-arrow {
		color: var(--color-primary-300);
	}
</style>
