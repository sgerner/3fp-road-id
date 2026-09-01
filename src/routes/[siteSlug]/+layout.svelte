<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		buildAbsoluteUrl,
		cleanSeoText,
		getRelativePathname,
		limitSeoText,
		normalizePathname
	} from '$lib/seo';
	import IconMenu from '@lucide/svelte/icons/menu';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconMoonStar from '@lucide/svelte/icons/moon-star';
	import IconSun from '@lucide/svelte/icons/sun';
	import IconX from '@lucide/svelte/icons/x';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import { optimizedImageUrl } from '$lib/media/optimized';
	import { fade, fly } from 'svelte/transition';
	import { scrollReveal } from '$lib/microsites/scrollReveal';

	let { data, children } = $props();

	const site = $derived(data.site);
	const group = $derived(site?.group ?? null);
	const isTbagSite = $derived(site?.siteConfig?.site_variant === 'tbag');
	const heroImageHref = $derived(
		optimizedImageUrl(group?.cover_photo_url, { width: 1600, quality: 58 })
	);
	const heroImageSrcSet = $derived(
		group?.cover_photo_url
			? `${optimizedImageUrl(group.cover_photo_url, { width: 480, quality: 46 })} 480w, ${optimizedImageUrl(group.cover_photo_url, { width: 800, quality: 50 })} 800w, ${heroImageHref} 1600w`
			: ''
	);
	const heroImageMobileHref = $derived(
		optimizedImageUrl(group?.cover_photo_url, { width: 640, quality: 50 })
	);
	const heroImageMobileSrcSet = $derived(
		group?.cover_photo_url
			? `${optimizedImageUrl(group.cover_photo_url, { width: 480, quality: 46 })} 480w, ${heroImageMobileHref} 640w`
			: ''
	);
	const heroImageSmallHref = $derived(
		optimizedImageUrl(group?.cover_photo_url, { width: 320, quality: 40 })
	);
	const logoImageHref = $derived(optimizedImageUrl(group?.logo_url, { width: 128, quality: 58 }));
	const taxonomy = $derived(site?.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const basePath = $derived(site?.basePath || '');
	const homeHref = $derived(basePath || '/');
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const joinHref = $derived(basePath ? `${basePath}/join` : '/join');
	const galleryHref = $derived(basePath ? `${basePath}/gallery` : '/gallery');
	const assetsHref = $derived(basePath ? `${basePath}/assets` : '/assets');
	const contactHref = $derived(basePath ? `${basePath}#contact` : '/#contact');
	const communityHref = 'https://3fp.org';
	const membershipCtaLabel = $derived(
		(site?.membershipProgram?.cta_label || '').trim() || 'Follow'
	);
	const micrositeColorModeStorageKey = '3fp-microsite-color-mode';
	const currentPathname = $derived(normalizePathname($page.url.pathname));
	const homePathname = $derived(normalizePathname(homeHref));
	const siteRootUrl = $derived(buildAbsoluteUrl($page.url.origin, homeHref || '/'));
	const seoCanonical = $derived(buildAbsoluteUrl($page.url.origin, currentPathname || '/'));
	const seoSection = $derived.by(() => {
		const relative = getRelativePathname(currentPathname, homePathname);
		return relative.split('/')[0] || '';
	});
	const customPage = $derived(
		(site?.siteConfig?.site_pages || []).find(
			(candidate) => !candidate.is_home && candidate.slug === seoSection
		) || null
	);
	const isHomePage = $derived(currentPathname === homePathname);
	const seoTitle = $derived(
		(site?.siteConfig?.site_title || group?.name || 'Cycling Group').trim()
	);
	const seoPageTitle = $derived.by(() => {
		if (isHomePage) return seoTitle;
		const sectionTitles = {
			updates: 'Updates',
			gallery: 'Gallery',
			join: membershipCtaLabel || 'Join',
			assets: 'Resources'
		};
		const sectionTitle = customPage?.title || sectionTitles[seoSection];
		return sectionTitle ? `${sectionTitle} — ${seoTitle}` : seoTitle;
	});
	const seoOgImage = $derived(
		group?.cover_photo_url || group?.logo_url || site?.photoBucket?.image_assets?.[0]?.href || ''
	);

	const seoDescription = $derived.by(() => {
		if (customPage?.seo_description || customPage?.description) {
			return limitSeoText(customPage.seo_description || customPage.description, 165);
		}
		const sectionDescriptions = {
			updates: limitSeoText(
				`${seoTitle} updates, announcements, route changes, volunteer asks, and public notes.`,
				165
			),
			gallery: limitSeoText(
				`Photo gallery from rides, events, and community days with ${seoTitle}.`,
				165
			),
			join: limitSeoText(
				`Join ${seoTitle} to follow membership options, support the group, and stay connected.`,
				165
			),
			assets: limitSeoText(`Official links and downloadable resources shared by ${seoTitle}.`, 165)
		};
		if (!isHomePage && sectionDescriptions[seoSection]) {
			return sectionDescriptions[seoSection];
		}
		const city = cleanSeoText(group?.city);
		const state = cleanSeoText(group?.state_region);
		const locality = [city, state].filter(Boolean).join(', ');
		const primary = cleanSeoText(site?.siteConfig?.site_tagline || site?.siteConfig?.home_intro);
		const fallback = cleanSeoText(
			group?.description ||
				group?.service_area_description ||
				group?.membership_info ||
				'Community bike rides, local events, and advocacy.'
		);
		const tail = locality ? ` Join rides in ${locality}.` : ' Join local rides and events.';
		return limitSeoText(`${primary || fallback}${tail}`, 165);
	});

	const seoKeywords = $derived.by(() => {
		const values = new Set([
			cleanSeoText(group?.name),
			cleanSeoText(group?.city),
			cleanSeoText(group?.state_region),
			cleanSeoText(group?.primary_discipline),
			cleanSeoText(group?.audience_focus),
			cleanSeoText(group?.group_type),
			'bike rides',
			'cycling group',
			'community cycling',
			'group rides',
			'bike advocacy'
		]);
		if (group?.slug === '3-feet-please' || isTbagSite) values.add('3 Feet Please');
		if (seoSection) values.add(seoSection);
		for (const item of taxonomy?.audiences || []) values.add(cleanSeoText(item));
		for (const item of taxonomy?.disciplines || []) values.add(cleanSeoText(item));
		for (const item of taxonomy?.skills || []) values.add(cleanSeoText(item));
		return Array.from(values).filter(Boolean).slice(0, 18).join(', ');
	});

	const seoStructuredData = $derived.by(() => {
		const sameAs = (site?.contactLinks || [])
			.map((link) => String(link?.href || '').trim())
			.filter((href) => /^https?:\/\//i.test(href))
			.slice(0, 12);
		const payload = isHomePage
			? {
					'@context': 'https://schema.org',
					'@type': group?.slug === '3-feet-please' || isTbagSite ? 'NGO' : 'SportsOrganization',
					name: seoTitle,
					description: seoDescription,
					url: siteRootUrl,
					logo: group?.logo_url || undefined,
					image: seoOgImage || undefined,
					areaServed: [group?.city, group?.state_region].filter(Boolean).join(', ') || undefined,
					sameAs: sameAs.length ? sameAs : undefined
				}
			: {
					'@context': 'https://schema.org',
					'@type': 'WebPage',
					name: seoPageTitle,
					description: seoDescription,
					url: seoCanonical,
					image: seoOgImage || undefined,
					isPartOf: {
						'@type': 'WebSite',
						name: seoTitle,
						url: siteRootUrl
					}
				};
		return JSON.stringify(payload);
	});

	const navItems = $derived.by(() => {
		const available = new Map();
		for (const page of site?.siteConfig?.site_pages || []) {
			available.set(`page:${page.id}`, {
				label: page.nav_label || page.title,
				href: page.is_home ? homeHref : basePath ? `${basePath}/${page.slug}` : `/${page.slug}`
			});
		}
		if (
			site?.siteConfig?.sections?.news &&
			((site?.newsPosts?.length || 0) > 0 || currentPathname === normalizePathname(updatesHref))
		) {
			available.set('special:updates', { label: 'Updates', href: updatesHref });
		}
		if (site?.siteConfig?.sections?.join) {
			available.set('special:join', { label: membershipCtaLabel, href: joinHref });
		}
		if (site?.siteConfig?.sections?.gallery && site?.photoBucket?.asset_count) {
			available.set('special:gallery', { label: 'Gallery', href: galleryHref });
		}
		if (site?.assetBuckets?.some((b) => b.asset_count > 0 && b.slug !== 'photos')) {
			available.set('special:resources', { label: 'Resources', href: assetsHref });
		}
		if (site?.siteConfig?.sections?.contact) {
			available.set('special:contact', { label: 'Contact', href: contactHref });
		}
		const navigation = site?.siteConfig?.site_pages?.[0]?.navigation?.items || [];
		return navigation
			.map((item) => {
				const destination = available.get(item.id);
				return destination
					? { ...destination, label: item.label || destination.label, placement: item.placement }
					: null;
			})
			.filter(Boolean);
	});
	const primaryNavItems = $derived(navItems.filter((item) => item.placement === 'primary'));
	const moreNavItems = $derived(navItems.filter((item) => item.placement === 'more'));
	const mobileNavItems = $derived(navItems.filter((item) => item.placement !== 'hidden'));

	let mobileMenuOpen = $state(false);
	let colorMode = $state('light');
	let prefersReducedMotion = $state(false);
	let hasMounted = $state(false);
	const routeTransitionKey = $derived(currentPathname);

	function normalizeColorMode(value) {
		return value === 'dark' ? 'dark' : 'light';
	}

	function setColorMode(value, persist = true) {
		const next = normalizeColorMode(value);
		colorMode = next;
		if (persist && typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(micrositeColorModeStorageKey, next);
			} catch {
				// ignore storage failures
			}
		}
	}

	function toggleColorMode() {
		setColorMode(colorMode === 'dark' ? 'light' : 'dark');
	}

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleMotionPreferenceChange = () => (prefersReducedMotion = motionQuery.matches);
		handleMotionPreferenceChange();
		if (typeof motionQuery.addEventListener === 'function') {
			motionQuery.addEventListener('change', handleMotionPreferenceChange);
		} else {
			motionQuery.addListener(handleMotionPreferenceChange);
		}

		try {
			const stored = window.localStorage.getItem(micrositeColorModeStorageKey);
			setColorMode(stored || 'light', false);
		} catch {
			setColorMode('light', false);
		}
		hasMounted = true;

		return () => {
			if (typeof motionQuery.removeEventListener === 'function') {
				motionQuery.removeEventListener('change', handleMotionPreferenceChange);
			} else {
				motionQuery.removeListener(handleMotionPreferenceChange);
			}
		};
	});

	function isActive(href) {
		if (!href) return false;
		let targetUrl;
		try {
			targetUrl = new URL(href, $page.url);
		} catch {
			return false;
		}

		const currentPath = normalizePathname($page.url.pathname);
		const targetPath = normalizePathname(targetUrl.pathname);
		const currentHash = $page.url.hash || '';
		const targetHash = targetUrl.hash || '';

		if (targetHash) {
			return currentPath === targetPath && currentHash === targetHash;
		}

		return currentPath === targetPath && !currentHash;
	}
</script>

<svelte:head>
	<title>{seoPageTitle}</title>
	<meta name="description" content={seoDescription} />
	<meta name="keywords" content={seoKeywords} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={seoTitle} />
	<meta property="og:title" content={seoPageTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={seoCanonical} />
	{#if seoOgImage}
		<meta property="og:image" content={seoOgImage} />
		<meta property="og:image:alt" content={`${seoTitle} cover image`} />
	{/if}
	{#if group?.cover_photo_url}
		<link
			rel="preload"
			as="image"
			href={heroImageSmallHref}
			imagesrcset={heroImageSmallHref}
			imagesizes="100vw"
			media="(max-width: 480px)"
			fetchpriority="high"
		/>
		<link
			rel="preload"
			as="image"
			href={heroImageMobileHref}
			imagesrcset={heroImageMobileSrcSet}
			imagesizes="100vw"
			media="(min-width: 481px) and (max-width: 767px)"
			fetchpriority="high"
		/>
		<link
			rel="preload"
			as="image"
			href={heroImageHref}
			imagesrcset={heroImageSrcSet}
			imagesizes="100vw"
			media="(min-width: 768px)"
			fetchpriority="high"
		/>
	{/if}

	<meta name="twitter:card" content={seoOgImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={seoPageTitle} />
	<meta name="twitter:description" content={seoDescription} />
	{#if seoOgImage}
		<meta name="twitter:image" content={seoOgImage} />
	{/if}

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<div
	class="microsite-shell microsite-bg--{site?.siteConfig?.background_style ||
		'cinematic'} min-h-dvh {group?.slug === '3-feet-please' ? 'site-advocacy' : ''} {isTbagSite
		? 'site-tbag'
		: ''} {group?.slug === '3-feet-please' && isHomePage ? 'site-advocacy-home' : ''}"
	data-theme={site?.theme?.dataTheme || '3fp'}
	data-color-mode={colorMode}
	style={site?.theme?.style || ''}
>
	<div class="microsite-frame flex min-h-dvh flex-col">
		<header class="microsite-nav-shell">
			<div
				class="microsite-nav microsite-nav--floating mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6"
			>
				<a href={homeHref} class="microsite-mark flex min-w-0 shrink-0 items-center gap-3">
					{#if group?.logo_url}
						<img
							src={logoImageHref}
							alt={`${group.name} logo`}
							class="ring-surface-50/10 h-10 w-10 flex-shrink-0 rounded-xl object-cover shadow ring-1"
							decoding="async"
						/>
					{:else}
						<div
							class="microsite-mark__fallback flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
						>
							<span class="microsite-mark__initial text-sm font-black"
								>{(group?.name || 'G').slice(0, 1)}</span
							>
						</div>
					{/if}
					<p class="microsite-mark__text truncate text-sm font-black tracking-tight">
						{site?.siteConfig?.site_title || group?.name}
					</p>
				</a>

				<nav class="hidden min-w-0 items-center gap-1 lg:flex">
					{#each primaryNavItems as item}
						<a href={item.href} class="microsite-nav-link {isActive(item.href) ? 'is-active' : ''}">
							{item.label}
						</a>
					{/each}
					{#if moreNavItems.length}
						<details class="microsite-more-menu relative">
							<summary class="microsite-nav-link flex cursor-pointer items-center gap-1">
								More <IconChevronDown class="h-3.5 w-3.5" />
							</summary>
							<div class="microsite-more-popover">
								{#each moreNavItems as item}
									<a
										href={item.href}
										class="microsite-mobile-link {isActive(item.href) ? 'is-active' : ''}"
										onclick={(event) =>
											event.currentTarget.closest('details')?.removeAttribute('open')}
									>
										{item.label}
									</a>
								{/each}
							</div>
						</details>
					{/if}
				</nav>

				<div class="flex items-center gap-2">
					{#if group?.slug === '3-feet-please'}
						<a
							href={communityHref}
							target="_blank"
							rel="noopener noreferrer"
							class="microsite-community-link"
							aria-label="Visit the 3fp.org community"
							title="Visit the 3fp.org community"
						>
							<span>3fp.org</span>
							<IconExternalLink class="h-3.5 w-3.5" />
						</a>
					{/if}
					<button
						type="button"
						class="microsite-theme-btn"
						onclick={toggleColorMode}
						aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
						title={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}
					>
						{#if colorMode === 'dark'}
							<IconSun class="h-4 w-4" />
						{:else}
							<IconMoonStar class="h-4 w-4" />
						{/if}
						<span class="hidden sm:inline">{colorMode === 'dark' ? 'Light' : 'Dark'}</span>
					</button>
					<button
						type="button"
						class="microsite-menu-btn lg:hidden"
						onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
						aria-label="Toggle site menu"
					>
						{#if mobileMenuOpen}
							<IconX class="h-5 w-5" />
						{:else}
							<IconMenu class="h-5 w-5" />
						{/if}
					</button>
				</div>
			</div>

			{#if mobileMenuOpen}
				<div class="mx-auto max-w-7xl px-4 pb-4 lg:hidden">
					<div class="microsite-mobile-menu space-y-1 rounded-2xl p-2.5">
						{#each mobileNavItems as item}
							<a
								href={item.href}
								class="microsite-mobile-link {isActive(item.href) ? 'is-active' : ''}"
								onclick={() => (mobileMenuOpen = false)}
							>
								{item.label}
							</a>
						{/each}
						{#if group?.slug === '3-feet-please'}
							<a
								href={communityHref}
								target="_blank"
								rel="noopener noreferrer"
								class="microsite-mobile-link microsite-mobile-community-link"
							>
								<span>Visit the 3fp.org community</span>
								<IconExternalLink class="h-4 w-4" />
							</a>
						{/if}
					</div>
				</div>
			{/if}
		</header>
		<div class="microsite-nav-offset" aria-hidden="true"></div>

		<main class="relative flex-1" use:scrollReveal>
			{#key routeTransitionKey}
				<div
					class="microsite-route"
					in:fly={{
						y: hasMounted && !prefersReducedMotion ? 12 : 0,
						duration: hasMounted && !prefersReducedMotion ? 360 : 0
					}}
					out:fade={{ duration: hasMounted && !prefersReducedMotion ? 180 : 0 }}
				>
					{@render children()}
				</div>
			{/key}
		</main>
	</div>
</div>

<style>
	.microsite-shell {
		position: relative;
		isolation: isolate;
		color: var(--ms-fg, var(--color-surface-50));
		font-family: var(--base-font-family);
		font-size: var(--base-font-size);
		line-height: var(--base-line-height);
		font-weight: var(--base-font-weight);
		letter-spacing: var(--base-letter-spacing);
		/* Re-map paired app tokens so microsites don't inherit main app palette pairings. */
		--color-primary-950-50: var(--color-primary-950);
		--color-primary-700-300: var(--color-primary-700);
		--color-secondary-700-300: var(--color-secondary-700);
		--color-tertiary-700-300: var(--color-tertiary-700);
		--color-surface-950-50: var(--color-surface-950);
		--color-surface-800-200: var(--color-surface-800);
		--color-surface-700-300: var(--color-surface-700);
		--color-surface-600-400: var(--color-surface-600);
		--color-surface-100-900: var(--color-surface-100);
		--color-surface-50-950: var(--color-surface-50);
	}

	.microsite-bg--cinematic {
		/* Compressed 3-orb drama: all orbs visible on viewport, highly saturated */
		background:
			radial-gradient(
				70vw 70vw at 15% 45%,
				color-mix(in oklab, var(--color-primary-500) 60%, transparent),
				transparent 35%
			),
			radial-gradient(
				60vw 60vw at 85% 40%,
				color-mix(in oklab, var(--color-secondary-500) 58%, transparent),
				transparent 38%
			),
			radial-gradient(
				55vw 55vw at 50% 85%,
				color-mix(in oklab, var(--color-tertiary-500) 62%, transparent),
				transparent 40%
			),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--color-surface-950) 98%, var(--color-primary-900) 2%) 0%,
				color-mix(in oklab, var(--color-surface-900) 94%, var(--color-secondary-800) 6%) 50%,
				color-mix(in oklab, var(--color-surface-950) 96%, var(--color-tertiary-900) 4%) 100%
			);
		animation: cinematic-bg-shift 20s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	/* ═══════════════════════════════════════════════════════════
BACKGROUND STYLES — Aurora, Prism, Void
═══════════════════════════════════════════════════════════ */

	/* Aurora — Flowing northern lights effect */
	.microsite-bg--aurora {
		background:
		/* Diagonal flowing ribbon - primary */
			linear-gradient(
				125deg,
				transparent 0%,
				transparent 30%,
				color-mix(in oklab, var(--color-primary-500) 35%, transparent) 40%,
				color-mix(in oklab, var(--color-primary-400) 50%, transparent) 50%,
				color-mix(in oklab, var(--color-secondary-500) 45%, transparent) 60%,
				transparent 70%,
				transparent 100%
			),
			/* Horizontal flowing ribbon - secondary */
			linear-gradient(
					175deg,
					color-mix(in oklab, var(--color-secondary-500) 40%, transparent) 0%,
					transparent 20%,
					transparent 60%,
					color-mix(in oklab, var(--color-tertiary-500) 35%, transparent) 75%,
					transparent 100%
				),
			/* Subtle vertical gradient glow */
			linear-gradient(
					90deg,
					color-mix(in oklab, var(--color-surface-950) 95%, var(--color-primary-900) 5%) 0%,
					color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-900) 10%) 50%,
					color-mix(in oklab, var(--color-surface-950) 93%, var(--color-tertiary-900) 7%) 100%
				);
		animation: aurora-flow 15s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	/* Prism — Geometric shard lighting (viewport-visible shards) */
	.microsite-bg--prism {
		background:
			linear-gradient(
				115deg,
				color-mix(in oklab, var(--color-primary-500) 45%, transparent) 0%,
				transparent 35%
			),
			linear-gradient(
				245deg,
				color-mix(in oklab, var(--color-secondary-500) 40%, transparent) 0%,
				transparent 38%
			),
			linear-gradient(
				25deg,
				color-mix(in oklab, var(--color-tertiary-500) 35%, transparent) 0%,
				transparent 42%
			),
			conic-gradient(
				from 15deg at 60% 40%,
				color-mix(in oklab, var(--color-surface-950) 88%, transparent) 0deg,
				color-mix(in oklab, var(--color-primary-700) 70%, transparent) 80deg,
				color-mix(in oklab, var(--color-surface-950) 88%, transparent) 160deg,
				color-mix(in oklab, var(--color-secondary-700) 65%, transparent) 260deg,
				color-mix(in oklab, var(--color-tertiary-700) 60%, transparent) 320deg,
				color-mix(in oklab, var(--color-surface-950) 88%, transparent) 360deg
			);
		animation: prism-rotate 15s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	/* Void — Minimal refined surface */
	.microsite-bg--void {
		background:
		/* Subtle top glow */
			radial-gradient(
				ellipse 120vw 40vh at 50% 0%,
				color-mix(in oklab, var(--color-surface-800) 40%, transparent) 0%,
				transparent 70%
			),
			/* Subtle bottom glow */
			radial-gradient(
					ellipse 120vw 40vh at 50% 100%,
					color-mix(in oklab, var(--color-surface-900) 50%, transparent) 0%,
					transparent 60%
				),
			/* Base surface color */ var(--color-surface-950);
		background-attachment: fixed;
	}

	/* Light mode variants */
	.microsite-shell[data-color-mode='light'].microsite-bg--aurora {
		background:
		/* Diagonal flowing ribbon - primary */
			linear-gradient(
				125deg,
				transparent 0%,
				transparent 30%,
				color-mix(in oklab, var(--color-primary-400) 45%, transparent) 40%,
				color-mix(in oklab, var(--color-primary-300) 55%, transparent) 50%,
				color-mix(in oklab, var(--color-secondary-400) 50%, transparent) 60%,
				transparent 70%,
				transparent 100%
			),
			/* Horizontal flowing ribbon - secondary */
			linear-gradient(
					175deg,
					color-mix(in oklab, var(--color-secondary-400) 50%, transparent) 0%,
					transparent 20%,
					transparent 60%,
					color-mix(in oklab, var(--color-tertiary-400) 45%, transparent) 75%,
					transparent 100%
				),
			/* Subtle vertical gradient glow */
			linear-gradient(
					90deg,
					color-mix(in oklab, white 95%, var(--color-primary-100) 5%) 0%,
					color-mix(in oklab, white 90%, var(--color-secondary-100) 10%) 50%,
					color-mix(in oklab, white 93%, var(--color-tertiary-100) 7%) 100%
				);
		animation: aurora-flow 15s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	.microsite-shell[data-color-mode='light'].microsite-bg--prism {
		background:
			linear-gradient(
				115deg,
				color-mix(in oklab, var(--color-primary-400) 40%, transparent) 0%,
				transparent 35%
			),
			linear-gradient(
				245deg,
				color-mix(in oklab, var(--color-secondary-400) 35%, transparent) 0%,
				transparent 38%
			),
			linear-gradient(
				25deg,
				color-mix(in oklab, var(--color-tertiary-400) 30%, transparent) 0%,
				transparent 42%
			),
			conic-gradient(
				from 15deg at 60% 40%,
				color-mix(in oklab, white 88%, transparent) 0deg,
				color-mix(in oklab, var(--color-primary-300) 70%, transparent) 80deg,
				color-mix(in oklab, white 88%, transparent) 160deg,
				color-mix(in oklab, var(--color-secondary-300) 65%, transparent) 260deg,
				color-mix(in oklab, var(--color-tertiary-300) 60%, transparent) 320deg,
				color-mix(in oklab, white 88%, transparent) 360deg
			);
		animation: prism-rotate 15s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	.microsite-shell[data-color-mode='light'].microsite-bg--void {
		background:
		/* Subtle top glow - light mode */
			radial-gradient(
				ellipse 120vw 40vh at 50% 0%,
				color-mix(in oklab, var(--color-surface-200) 60%, transparent) 0%,
				transparent 70%
			),
			/* Subtle bottom glow - light mode */
			radial-gradient(
					ellipse 120vw 40vh at 50% 100%,
					color-mix(in oklab, var(--color-surface-100) 80%, transparent) 0%,
					transparent 60%
				),
			/* Base surface color - light mode */ var(--color-surface-50);
		background-attachment: fixed;
	}

	.microsite-shell[data-color-mode='dark'] {
		color-scheme: dark;
		--color-primary-950-50: var(--color-primary-50);
		--color-primary-700-300: var(--color-primary-300);
		--color-secondary-700-300: var(--color-secondary-300);
		--color-tertiary-700-300: var(--color-tertiary-300);
		--color-surface-950-50: var(--color-surface-50);
		--color-surface-800-200: var(--color-surface-200);
		--color-surface-700-300: var(--color-surface-300);
		--color-surface-600-400: var(--color-surface-400);
		--color-surface-100-900: var(--color-surface-900);
		--color-surface-50-950: var(--color-surface-950);
		--ms-fg: rgb(248 250 252 / 0.98);
		--ms-mark: rgb(255 255 255 / 0.96);
		--ms-title: rgb(255 255 255 / 0.97);
		--ms-stat: rgb(255 255 255 / 0.95);
		--ms-nav-link: rgb(255 255 255 / 0.68);
		--ms-nav-link-active-bg: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		--ms-nav-link-active-fg: rgb(255 255 255 / 1);
		--ms-footer: rgb(255 255 255 / 0.3);
		--ms-footer-hover: rgb(255 255 255 / 0.55);
		--ms-toggle-bg: color-mix(in oklab, var(--color-surface-950) 65%, transparent);
		--ms-toggle-border: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
		--ms-toggle-fg: rgb(255 255 255 / 0.95);
	}

	.microsite-shell[data-color-mode='light'] {
		color-scheme: light;
		--ms-fg: rgb(15 23 42 / 0.96);
		--ms-muted: rgb(51 65 85 / 0.74);
		--ms-mark: rgb(15 23 42 / 0.98);
		--ms-title: color-mix(in oklab, var(--color-surface-950) 88%, var(--color-primary-800) 12%);
		--ms-stat: color-mix(in oklab, var(--color-surface-900) 84%, var(--color-secondary-800) 16%);
		--ms-nav-link: rgb(30 41 59 / 0.84);
		--ms-nav-link-active-bg: color-mix(in oklab, var(--color-primary-500) 32%, white 68%);
		--ms-nav-link-active-fg: rgb(15 23 42 / 0.96);
		--ms-footer: rgb(15 23 42 / 0.52);
		--ms-footer-hover: rgb(15 23 42 / 0.82);
		--ms-toggle-bg: color-mix(in oklab, white 78%, var(--color-primary-100) 22%);
		--ms-toggle-border: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		--ms-toggle-fg: rgb(15 23 42 / 0.9);
	}

	.microsite-shell[data-color-mode='light'].microsite-bg--cinematic {
		/* Cinematic light mode: compressed 3 highly saturated orbs */
		background:
			radial-gradient(
				70vw 70vw at 15% 45%,
				color-mix(in oklab, var(--color-primary-400) 65%, transparent),
				transparent 35%
			),
			radial-gradient(
				60vw 60vw at 85% 40%,
				color-mix(in oklab, var(--color-secondary-400) 62%, transparent),
				transparent 38%
			),
			radial-gradient(
				55vw 55vw at 50% 85%,
				color-mix(in oklab, var(--color-tertiary-400) 68%, transparent),
				transparent 40%
			),
			linear-gradient(
				180deg,
				color-mix(in oklab, white 94%, var(--color-primary-100) 6%) 0%,
				color-mix(in oklab, white 90%, var(--color-secondary-100) 10%) 50%,
				color-mix(in oklab, white 92%, var(--color-tertiary-100) 8%) 100%
			);
		animation: cinematic-bg-shift 20s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	.microsite-shell::before {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		background: repeating-linear-gradient(
			115deg,
			color-mix(in oklab, var(--color-surface-50) 5%, transparent) 0 1px,
			transparent 1px 28px
		);
		opacity: 0.3;
		z-index: -1;
	}

	.microsite-shell[data-color-mode='light']::before {
		background: repeating-linear-gradient(
			115deg,
			color-mix(in oklab, var(--color-primary-500) 8%, transparent) 0 1px,
			transparent 1px 32px
		);
		opacity: 0.26;
	}

	/* Safety net: keep content-card headings readable in both modes, even if edited classes regress */
	:global(.microsite-shell :is(h1, h2, h3, h4, h5, h6)) {
		font-family: var(--heading-font-family);
	}

	:global(.microsite-shell .microsite-page .glass-card :is(h1, h2, h3, h4, h5, h6)) {
		color: var(--color-surface-950-50);
	}

	.microsite-nav-shell {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 45;
		padding-top: 0.35rem;
	}

	.microsite-nav-offset {
		height: 5.2rem;
	}

	.microsite-nav {
		backdrop-filter: blur(20px);
	}

	.microsite-nav--floating {
		margin-top: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-surface-950) 65%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		box-shadow:
			0 8px 32px -12px color-mix(in oklab, var(--color-surface-950) 50%, transparent),
			inset 0 1px 1px color-mix(in oklab, var(--color-surface-50) 8%, transparent);
	}

	.microsite-shell[data-color-mode='light'] .microsite-nav--floating {
		border-color: color-mix(in oklab, var(--color-surface-950) 15%, transparent);
		background: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		box-shadow:
			0 8px 32px -12px color-mix(in oklab, var(--color-surface-950) 15%, transparent),
			inset 0 1px 1px color-mix(in oklab, var(--color-surface-50) 50%, transparent);
	}

	.microsite-mark__fallback {
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-secondary-500) 85%, white 15%)
		);
	}

	.microsite-mark__initial,
	.microsite-mark__text {
		color: var(--ms-mark);
	}

	.microsite-nav-link {
		padding: 0.6rem 0.9rem;
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--ms-nav-link);
		transition:
			background-color 160ms ease,
			color 160ms ease;
	}

	.microsite-nav-link:hover,
	.microsite-nav-link.is-active {
		color: var(--ms-nav-link-active-fg);
		background: var(--ms-nav-link-active-bg);
	}

	.microsite-more-menu > summary {
		list-style: none;
	}

	.microsite-more-menu > summary::-webkit-details-marker {
		display: none;
	}

	.microsite-more-menu[open] > summary {
		color: var(--ms-nav-link-active-fg);
		background: var(--ms-nav-link-active-bg);
	}

	.microsite-more-popover {
		position: absolute;
		top: calc(100% + 0.65rem);
		right: 0;
		display: grid;
		min-width: 12rem;
		gap: 0.2rem;
		padding: 0.55rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 14%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 92%, transparent);
		box-shadow: 0 18px 45px -18px color-mix(in oklab, black 60%, transparent);
		backdrop-filter: blur(20px);
	}

	.microsite-shell[data-color-mode='light'] .microsite-more-popover {
		border-color: color-mix(in oklab, var(--color-surface-950) 14%, transparent);
		background: color-mix(in oklab, white 92%, var(--color-primary-50) 8%);
	}

	.microsite-theme-btn,
	.microsite-menu-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		height: 2.5rem;
		border-radius: 999px;
		border: 1px solid var(--ms-toggle-border);
		background: var(--ms-toggle-bg);
		color: var(--ms-toggle-fg);
		padding: 0 0.8rem;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.microsite-community-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		height: 2.5rem;
		padding: 0 0.75rem;
		border: 1px solid var(--ms-toggle-border);
		border-radius: 999px;
		background: var(--ms-toggle-bg);
		color: var(--ms-toggle-fg);
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		text-decoration: none;
		transition:
			background-color 160ms ease,
			border-color 160ms ease,
			transform 160ms ease;
	}

	.microsite-community-link:hover {
		transform: translateY(-1px);
		filter: brightness(1.03);
	}

	.microsite-theme-btn:hover,
	.microsite-menu-btn:hover {
		filter: brightness(1.02);
	}

	.microsite-menu-btn {
		width: 2.5rem;
		padding: 0;
	}

	.microsite-mobile-menu {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		backdrop-filter: blur(20px);
	}

	.microsite-shell[data-color-mode='light'] .microsite-mobile-menu {
		border-color: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		background: color-mix(in oklab, white 82%, var(--color-primary-100) 18%);
	}

	.microsite-mobile-link {
		display: block;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		font-size: 0.95rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--ms-nav-link);
	}

	.microsite-mobile-link:hover,
	.microsite-mobile-link.is-active {
		color: var(--ms-nav-link-active-fg);
		background: var(--ms-nav-link-active-bg);
	}

	.microsite-mobile-community-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.45rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		color: var(--color-primary-600);
		font-weight: 800;
	}

	.microsite-footer-link {
		color: var(--ms-footer);
	}

	.microsite-footer-link:hover {
		color: var(--ms-footer-hover);
	}

	.microsite-route {
		position: relative;
	}

	/* Keep the first viewport light while preserving stable scroll geometry for long pages. */
	:global(.microsite-shell .microsite-page > section:not([data-site-block-type='hero'])),
	:global(.microsite-shell .microsite-page > footer),
	:global(.microsite-shell .microsite-updates-page > section:not(:first-child)) {
		content-visibility: auto;
		contain-intrinsic-size: auto 520px;
	}

	:global(.microsite-shell .microsite-scroll-reveal) {
		opacity: 0;
		transform: translate3d(0, 1rem, 0);
		transition:
			opacity 560ms cubic-bezier(0.22, 0.8, 0.24, 1) var(--microsite-reveal-delay, 0ms),
			transform 560ms cubic-bezier(0.22, 0.8, 0.24, 1) var(--microsite-reveal-delay, 0ms);
		will-change: opacity, transform;
	}

	:global(.microsite-shell .microsite-scroll-reveal.is-visible) {
		opacity: 1;
		transform: none;
		will-change: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.microsite-shell .microsite-scroll-reveal),
		:global(.microsite-shell .microsite-scroll-reveal.is-visible) {
			opacity: 1;
			transform: none;
			transition: none;
			will-change: auto;
		}
	}

	@media (max-width: 767px) {
		.microsite-nav-offset {
			height: 4.75rem;
		}

		.microsite-nav--floating {
			border-radius: 1.25rem;
		}
	}

	@media (max-width: 1023px) {
		.microsite-community-link {
			display: none;
		}
	}

	@media (min-width: 768px) {
		.microsite-menu-btn {
			display: none !important;
		}
	}

	/* Dramatic orb animation - more pronounced movement */
	@keyframes cinematic-bg-shift {
		0% {
			background-position:
				-20% -20%,
				120% -25%,
				60% 120%,
				0% 0%;
		}
		50% {
			background-position:
				30% 40%,
				70% 30%,
				40% 70%,
				0% 0%;
		}
		100% {
			background-position:
				-20% -20%,
				120% -25%,
				60% 120%,
				0% 0%;
		}
	}

	/* Aurora flow - subtle ribbon movement */
	@keyframes aurora-flow {
		0%,
		100% {
			background-position:
				0% 0%,
				0% 0%,
				0% 0%;
		}
		50% {
			background-position:
				2% 1%,
				-1% 2%,
				0% 0%;
		}
	}

	/* Prism shift - subtle geometric drift */
	@keyframes prism-rotate {
		0%,
		100% {
			background-position:
				0% 0%,
				0% 0%,
				0% 0%;
		}
		50% {
			background-position:
				2% 1%,
				-1% 2%,
				1% -1%;
		}
	}

	/* Tenant atmospheres move slowly enough to feel cinematic rather than
	   distracting. The final gradient stop stays fixed so every page always
	   has a reliable, readable surface underneath the color. */
	@keyframes tenant-cinematic-wash {
		0% {
			background-position:
				-4% -5%,
				104% 5%,
				58% 108%,
				45% 28%,
				0% 0%;
		}
		50% {
			background-position:
				10% 11%,
				92% 19%,
				48% 93%,
				51% 39%,
				0% 0%;
		}
		100% {
			background-position:
				1% -1%,
				108% 2%,
				64% 104%,
				40% 24%,
				0% 0%;
		}
	}

	@keyframes tenant-cinematic-sweep {
		0% {
			transform: translate3d(-3%, -1%, 0) rotate(-3deg) scale(1);
		}
		50% {
			transform: translate3d(3%, 2%, 0) rotate(1deg) scale(1.04);
		}
		100% {
			transform: translate3d(-1%, 4%, 0) rotate(4deg) scale(1.08);
		}
	}

	/* Noise texture overlay for cinematic grain */
	.microsite-shell::after {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
		opacity: 0.015;
		z-index: 9999;
	}

	:global([data-color-mode='dark']) .microsite-shell::after {
		opacity: 0.025;
	}

	/* Tenant visual identity: an editorial, desert-sky atmosphere with enough
	   motion and contrast to feel alive, while paper surfaces keep long-form
	   content easy to scan. */
	.microsite-shell.site-tbag,
	.microsite-shell.site-tbag.microsite-bg--cinematic {
		--tenant-ink: #11333d;
		--tenant-primary: #155e75;
		--tenant-secondary: #2f7a78;
		--tenant-accent: #c96f52;
		--tenant-paper: #f7faf8;
		--tenant-paper-deep: #edf3f1;
		background-color: #eef8f4;
		background:
			radial-gradient(58rem 34rem at -8% -10%, rgb(21 94 117 / 0.29), transparent 69%),
			radial-gradient(48rem 32rem at 108% 4%, rgb(201 111 82 / 0.22), transparent 70%),
			radial-gradient(68rem 40rem at 50% 112%, rgb(47 122 120 / 0.22), transparent 65%),
			radial-gradient(36rem 24rem at 44% 28%, rgb(255 255 255 / 0.78), transparent 74%),
			linear-gradient(118deg, #edf8f4 0%, #fbf7f0 48%, #f9efea 100%);
		background-size:
			120% 120%,
			112% 118%,
			126% 120%,
			110% 115%,
			100% 100%;
		background-position:
			-4% -5%,
			104% 5%,
			58% 108%,
			45% 28%,
			0% 0%;
		color: var(--tenant-ink);
		animation: tenant-cinematic-wash 32s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] {
		--tenant-ink: #eef7f5;
		--tenant-primary: #8bc9cf;
		--tenant-secondary: #70b8a7;
		--tenant-accent: #e0a084;
		--tenant-paper: #102e3a;
		--tenant-paper-deep: #0a222c;
		background-color: #071b25;
		background:
			radial-gradient(62rem 38rem at -8% -4%, rgb(47 122 120 / 0.42), transparent 68%),
			radial-gradient(52rem 32rem at 108% 12%, rgb(201 111 82 / 0.22), transparent 70%),
			radial-gradient(74rem 42rem at 50% 110%, rgb(21 94 117 / 0.34), transparent 65%),
			radial-gradient(36rem 24rem at 46% 30%, rgb(139 201 207 / 0.12), transparent 72%),
			linear-gradient(118deg, #061821 0%, #0b2d3a 52%, #122b2c 100%);
		background-size:
			120% 120%,
			112% 118%,
			126% 120%,
			110% 115%,
			100% 100%;
		background-position:
			-4% -5%,
			104% 5%,
			58% 108%,
			45% 28%,
			0% 0%;
		color: var(--tenant-ink);
		animation: tenant-cinematic-wash 32s ease-in-out infinite alternate;
	}

	.microsite-shell.site-tbag::before,
	.microsite-shell.site-tbag::after {
		display: block;
		content: '';
		position: fixed;
		inset: -18vh -12vw;
		z-index: -1;
		pointer-events: none;
	}

	/* A blurred diagonal reflection gives the page its “moving through the
	   city at golden hour” feeling without introducing an extra asset. */
	.microsite-shell.site-tbag::before {
		background:
			linear-gradient(116deg, transparent 21%, rgb(255 255 255 / 0.18) 35%, transparent 49%),
			conic-gradient(
				from 208deg at 46% 44%,
				transparent 0deg 68deg,
				rgb(45 155 145 / 0.12) 88deg,
				transparent 122deg 238deg,
				rgb(216 118 90 / 0.1) 258deg,
				transparent 292deg 360deg
			);
		filter: blur(38px);
		opacity: 0.9;
		transform: translate3d(0, 0, 0);
		animation: tenant-cinematic-sweep 38s ease-in-out infinite alternate;
		will-change: transform;
	}

	/* Fine grain makes the gradients feel tactile without becoming a visible
	   pattern at normal reading distance. */
	.microsite-shell.site-tbag::after {
		inset: 0;
		background-image:
			radial-gradient(circle at 17% 23%, rgb(17 51 61 / 0.2) 0 0.7px, transparent 1.4px),
			radial-gradient(circle at 83% 71%, rgb(17 51 61 / 0.16) 0 0.6px, transparent 1.3px);
		background-size:
			6px 6px,
			9px 9px;
		mix-blend-mode: multiply;
		opacity: 0.1;
	}

	.microsite-shell.site-tbag[data-color-mode='dark']::before {
		opacity: 0.7;
	}

	.microsite-shell.site-tbag[data-color-mode='dark']::after {
		background-image:
			radial-gradient(circle at 17% 23%, rgb(207 241 237 / 0.16) 0 0.7px, transparent 1.4px),
			radial-gradient(circle at 83% 71%, rgb(207 241 237 / 0.12) 0 0.6px, transparent 1.3px);
		mix-blend-mode: screen;
		opacity: 0.08;
	}

	.microsite-shell.site-tbag .microsite-nav--floating {
		border-color: rgb(21 94 117 / 0.16);
		background: rgb(247 250 248 / 0.92);
		box-shadow: 0 16px 36px -26px rgb(17 51 61 / 0.48);
		color: var(--tenant-ink);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.microsite-shell.site-tbag .microsite-nav-link {
		color: #315661;
	}

	.microsite-shell.site-tbag .microsite-nav-link:hover,
	.microsite-shell.site-tbag .microsite-nav-link.is-active,
	.microsite-shell.site-tbag .microsite-more-menu[open] > summary {
		background: #dcecef;
		color: #11333d;
	}

	.microsite-shell.site-tbag .microsite-mark__text,
	.microsite-shell.site-tbag .microsite-theme-btn,
	.microsite-shell.site-tbag .microsite-menu-btn {
		color: #11333d;
	}

	.microsite-shell.site-tbag .microsite-theme-btn,
	.microsite-shell.site-tbag .microsite-menu-btn {
		border-color: rgb(21 94 117 / 0.16);
		background: #f3f8f6;
	}

	.microsite-shell.site-tbag .microsite-more-popover,
	.microsite-shell.site-tbag .microsite-mobile-menu {
		border-color: rgb(21 94 117 / 0.16);
		background: rgb(247 250 248 / 0.98);
		box-shadow: 0 22px 46px -26px rgb(17 51 61 / 0.55);
		backdrop-filter: none;
	}

	.microsite-shell.site-tbag .microsite-mobile-link {
		color: #315661;
	}

	.microsite-shell.site-tbag .microsite-mobile-link:hover,
	.microsite-shell.site-tbag .microsite-mobile-link.is-active {
		background: #dcecef;
		color: #11333d;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-nav--floating {
		border-color: rgb(139 201 207 / 0.2);
		background: rgb(8 31 41 / 0.92);
		box-shadow: 0 18px 40px -26px rgb(0 0 0 / 0.78);
		color: #eef7f5;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-nav-link,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-mark__text,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-theme-btn,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-menu-btn {
		color: #eef7f5;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-nav-link:hover,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-nav-link.is-active,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-more-menu[open] > summary,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-mobile-link:hover,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-mobile-link.is-active {
		background: rgb(47 122 120 / 0.3);
		color: #f5fbf9;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-theme-btn,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-menu-btn {
		border-color: rgb(139 201 207 / 0.2);
		background: #103541;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-more-popover,
	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-mobile-menu {
		border-color: rgb(139 201 207 / 0.2);
		background: #102e3a;
		box-shadow: 0 22px 46px -26px rgb(0 0 0 / 0.8);
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] .microsite-mobile-link {
		color: #c5ddda;
	}

	.microsite-shell.site-tbag :global(:focus-visible) {
		outline: 2px solid #2f7a78;
		outline-offset: 3px;
	}

	.microsite-shell.site-tbag[data-color-mode='dark'] :global(:focus-visible) {
		outline-color: #8bc9cf;
	}

	@media (max-width: 767px) {
		.microsite-shell.site-tbag.microsite-bg--cinematic {
			background-attachment: scroll;
			background-size:
				170% 130%,
				150% 135%,
				160% 130%,
				135% 125%,
				100% 100%;
			animation-duration: 40s;
		}

		.microsite-shell.site-tbag::before,
		.microsite-shell.site-tbag::after {
			position: absolute;
		}

		.microsite-shell.site-tbag::before {
			inset: -8rem -28%;
			filter: blur(28px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.microsite-shell.site-tbag.microsite-bg--cinematic,
		.microsite-shell.site-tbag::before {
			animation: none;
		}

		.microsite-shell.site-tbag::before {
			transform: none;
		}
	}

	/* 3 Feet Please keeps its citrus signal as an action color, then uses
	   ocean ink, clay, and paper tones to make the organization feel credible.
	   The animated wash adds campaign energy to the long page without
	   competing with the hero photograph or the main action buttons. */
	.microsite-shell.site-advocacy,
	.microsite-shell.site-advocacy.microsite-bg--void,
	.microsite-shell.site-advocacy.microsite-bg--cinematic,
	.microsite-shell.site-advocacy.microsite-bg--aurora,
	.microsite-shell.site-advocacy.microsite-bg--prism {
		--advocacy-shell-ink: #0b2533;
		--advocacy-shell-blue: #1d536b;
		--advocacy-shell-citrus: #c4d32d;
		--advocacy-shell-coral: #d8795d;
		background-color: #ebf8f2;
		background:
			radial-gradient(60rem 38rem at -10% -12%, rgb(29 83 107 / 0.3), transparent 67%),
			radial-gradient(50rem 34rem at 106% 12%, rgb(196 211 45 / 0.26), transparent 69%),
			radial-gradient(56rem 36rem at 56% 108%, rgb(216 121 93 / 0.24), transparent 67%),
			radial-gradient(36rem 25rem at 47% 30%, rgb(255 255 255 / 0.8), transparent 74%),
			linear-gradient(118deg, #ebf8f2 0%, #fbf7e8 49%, #faeee6 100%);
		background-size:
			120% 120%,
			112% 118%,
			126% 120%,
			110% 115%,
			100% 100%;
		background-position:
			-4% -5%,
			104% 5%,
			58% 108%,
			45% 28%,
			0% 0%;
		color: var(--advocacy-shell-ink);
		animation: tenant-cinematic-wash 34s ease-in-out infinite alternate;
		background-attachment: fixed;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] {
		--advocacy-shell-ink: #f3f8f6;
		--advocacy-shell-blue: #8fc5cf;
		--advocacy-shell-citrus: #cbd77d;
		--advocacy-shell-coral: #e09a82;
		background-color: #061720;
		background:
			radial-gradient(62rem 38rem at -8% -4%, rgb(29 83 107 / 0.52), transparent 68%),
			radial-gradient(54rem 34rem at 108% 18%, rgb(196 211 45 / 0.23), transparent 71%),
			radial-gradient(56rem 36rem at 54% 104%, rgb(216 121 93 / 0.24), transparent 69%),
			radial-gradient(36rem 24rem at 46% 30%, rgb(143 197 207 / 0.14), transparent 72%),
			linear-gradient(118deg, #061720 0%, #0b2f3b 52%, #182b29 100%);
		background-size:
			120% 120%,
			112% 118%,
			126% 120%,
			110% 115%,
			100% 100%;
		background-position:
			-4% -5%,
			104% 5%,
			58% 108%,
			45% 28%,
			0% 0%;
		color: var(--advocacy-shell-ink);
		animation: tenant-cinematic-wash 34s ease-in-out infinite alternate;
	}

	.microsite-shell.site-advocacy::before,
	.microsite-shell.site-advocacy::after {
		display: block;
		content: '';
		position: fixed;
		inset: -18vh -12vw;
		z-index: -1;
		pointer-events: none;
	}

	.microsite-shell.site-advocacy::before {
		background:
			linear-gradient(116deg, transparent 19%, rgb(255 255 255 / 0.16) 34%, transparent 49%),
			conic-gradient(
				from 200deg at 48% 44%,
				transparent 0deg 60deg,
				rgb(196 211 45 / 0.13) 83deg,
				transparent 112deg 228deg,
				rgb(216 121 93 / 0.12) 255deg,
				transparent 290deg 360deg
			);
		filter: blur(38px);
		opacity: 0.9;
		transform: translate3d(0, 0, 0);
		animation: tenant-cinematic-sweep 38s ease-in-out infinite alternate;
		will-change: transform;
	}

	.microsite-shell.site-advocacy::after {
		inset: 0;
		background-image:
			radial-gradient(circle at 17% 23%, rgb(11 37 51 / 0.2) 0 0.7px, transparent 1.4px),
			radial-gradient(circle at 83% 71%, rgb(11 37 51 / 0.16) 0 0.6px, transparent 1.3px);
		background-size:
			6px 6px,
			9px 9px;
		mix-blend-mode: multiply;
		opacity: 0.1;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark']::before {
		opacity: 0.7;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark']::after {
		background-image:
			radial-gradient(circle at 17% 23%, rgb(207 241 237 / 0.16) 0 0.7px, transparent 1.4px),
			radial-gradient(circle at 83% 71%, rgb(207 241 237 / 0.12) 0 0.6px, transparent 1.3px);
		mix-blend-mode: screen;
		opacity: 0.08;
	}

	@media (max-width: 767px) {
		.microsite-shell.site-advocacy.microsite-bg--void,
		.microsite-shell.site-advocacy.microsite-bg--cinematic,
		.microsite-shell.site-advocacy.microsite-bg--aurora,
		.microsite-shell.site-advocacy.microsite-bg--prism {
			background-attachment: scroll;
			background-size:
				170% 130%,
				150% 135%,
				160% 130%,
				135% 125%,
				100% 100%;
			animation-duration: 42s;
		}

		.microsite-shell.site-advocacy::before,
		.microsite-shell.site-advocacy::after {
			position: absolute;
		}

		.microsite-shell.site-advocacy::before {
			inset: -8rem -28%;
			filter: blur(28px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.microsite-shell.site-advocacy.microsite-bg--void,
		.microsite-shell.site-advocacy.microsite-bg--cinematic,
		.microsite-shell.site-advocacy.microsite-bg--aurora,
		.microsite-shell.site-advocacy.microsite-bg--prism,
		.microsite-shell.site-advocacy::before {
			animation: none;
		}

		.microsite-shell.site-advocacy::before {
			transform: none;
		}
	}

	.microsite-shell.site-advocacy .microsite-nav-shell {
		background: transparent;
	}

	.microsite-shell.site-advocacy .microsite-nav--floating {
		border-color: rgb(11 37 51 / 0.14);
		background: rgb(247 249 246 / 0.92);
		box-shadow: 0 14px 34px -24px rgb(11 37 51 / 0.48);
		color: #0b2533;
		backdrop-filter: none;
	}

	.microsite-shell.site-advocacy .microsite-nav-link {
		color: #3e5f6c;
	}

	.microsite-shell.site-advocacy .microsite-nav-link:hover,
	.microsite-shell.site-advocacy .microsite-nav-link.is-active,
	.microsite-shell.site-advocacy .microsite-more-menu[open] > summary {
		background: #e5ebc1;
		color: #0b2533;
	}

	.microsite-shell.site-advocacy .microsite-mark__text,
	.microsite-shell.site-advocacy .microsite-theme-btn,
	.microsite-shell.site-advocacy .microsite-menu-btn {
		color: #0b2533;
	}

	.microsite-shell.site-advocacy .microsite-theme-btn,
	.microsite-shell.site-advocacy .microsite-menu-btn {
		border-color: rgb(11 37 51 / 0.14);
		background: #f4f7f3;
	}

	.microsite-shell.site-advocacy .microsite-community-link {
		border-color: rgb(196 211 45 / 0.62);
		background: rgb(196 211 45 / 0.16);
		color: #0b2533;
	}

	.microsite-shell.site-advocacy .microsite-more-popover,
	.microsite-shell.site-advocacy .microsite-mobile-menu {
		border-color: rgb(11 37 51 / 0.14);
		background: rgb(247 249 246 / 0.98);
		box-shadow: 0 22px 46px -26px rgb(11 37 51 / 0.58);
		backdrop-filter: none;
	}

	.microsite-shell.site-advocacy .microsite-mobile-link {
		color: #3e5f6c;
	}

	.microsite-shell.site-advocacy .microsite-mobile-link:hover,
	.microsite-shell.site-advocacy .microsite-mobile-link.is-active {
		background: #e5ebc1;
		color: #0b2533;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-nav--floating {
		border-color: rgb(143 197 207 / 0.2);
		background: rgb(8 28 40 / 0.92);
		box-shadow: 0 18px 42px -26px rgb(0 0 0 / 0.78);
		color: #f3f8f6;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-nav-link,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-mark__text,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-theme-btn,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-menu-btn {
		color: #f3f8f6;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-nav-link:hover,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-nav-link.is-active,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-more-menu[open] > summary,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-mobile-link:hover,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-mobile-link.is-active {
		background: rgb(196 211 45 / 0.22);
		color: #f6fbf8;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-theme-btn,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-menu-btn {
		border-color: rgb(143 197 207 / 0.2);
		background: #103341;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-community-link {
		border-color: rgb(203 215 125 / 0.5);
		background: rgb(196 211 45 / 0.18);
		color: #f6fbf8;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-more-popover,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-mobile-menu {
		border-color: rgb(143 197 207 / 0.2);
		background: #102e3e;
		box-shadow: 0 22px 46px -26px rgb(0 0 0 / 0.82);
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-mobile-link {
		color: #c2d9da;
	}

	.microsite-shell.site-advocacy :global(:focus-visible) {
		outline: 2px solid #1d536b;
		outline-offset: 3px;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] :global(:focus-visible) {
		outline-color: #cbd77d;
	}

	/* The campaign homepage lets the photo carry the first impression. A
	   restrained navy header wash keeps the overlaid navigation legible. */
	.microsite-shell.site-advocacy-home .microsite-nav-shell {
		position: absolute;
		inset: 0 0 auto;
		z-index: 30;
		padding-bottom: 0.75rem;
		background: linear-gradient(180deg, rgb(7 25 35 / 0.62), transparent);
	}

	.microsite-shell.site-advocacy-home .microsite-nav-offset {
		display: none;
	}

	.microsite-shell.site-advocacy-home .microsite-nav--floating {
		border-color: transparent;
		background: transparent;
		box-shadow: none;
		color: #ffffff;
	}

	.microsite-shell.site-advocacy-home .microsite-nav-link,
	.microsite-shell.site-advocacy-home .microsite-mark__text {
		color: #ffffff;
		text-shadow: 0 1px 14px rgb(0 0 0 / 0.45);
	}

	.microsite-shell.site-advocacy-home .microsite-nav-link:hover,
	.microsite-shell.site-advocacy-home .microsite-nav-link.is-active,
	.microsite-shell.site-advocacy-home .microsite-more-menu[open] > summary {
		background: #c4d32d;
		color: #0b2533;
		text-shadow: none;
	}

	.microsite-shell.site-advocacy-home .microsite-theme-btn,
	.microsite-shell.site-advocacy-home .microsite-menu-btn {
		border-color: rgb(255 255 255 / 0.42);
		background: rgb(7 25 35 / 0.24);
		color: #ffffff;
		backdrop-filter: blur(10px);
	}

	.microsite-shell.site-advocacy-home .microsite-community-link {
		border-color: rgb(196 211 45 / 0.72);
		background: rgb(196 211 45 / 0.16);
		color: #ffffff;
		text-shadow: 0 1px 14px rgb(0 0 0 / 0.45);
	}

	.microsite-shell.site-advocacy-home .microsite-community-link:hover {
		background: #c4d32d;
		color: #0b2533;
		text-shadow: none;
	}

	.microsite-shell.site-advocacy-home :global(:focus-visible) {
		outline-color: #c4d32d;
	}

	.microsite-shell.site-advocacy-home .microsite-more-popover,
	.microsite-shell.site-advocacy-home .microsite-mobile-menu {
		border-color: rgb(11 37 51 / 0.14);
		background: #f7f9f6;
		box-shadow: 0 22px 46px -26px rgb(11 37 51 / 0.7);
		color: #0b2533;
		backdrop-filter: none;
	}

	.microsite-shell.site-advocacy-home .microsite-mobile-link {
		color: #3e5f6c;
	}

	.microsite-shell.site-advocacy-home .microsite-mobile-link:hover,
	.microsite-shell.site-advocacy-home .microsite-mobile-link.is-active {
		background: #e5ebc1;
		color: #0b2533;
	}

	.microsite-shell.site-advocacy-home .microsite-mobile-community-link {
		border-top-color: rgb(11 37 51 / 0.14);
		color: #1d536b;
	}

	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-theme-btn,
	.microsite-shell.site-advocacy[data-color-mode='dark'] .microsite-menu-btn {
		border-color: rgb(255 255 255 / 0.42);
		background: rgb(7 25 35 / 0.45);
		color: #ffffff;
	}
</style>
