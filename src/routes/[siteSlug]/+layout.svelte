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
	import IconMoonStar from '@lucide/svelte/icons/moon-star';
	import IconSun from '@lucide/svelte/icons/sun';
	import IconX from '@lucide/svelte/icons/x';

	let { data, children } = $props();

	const site = $derived(data.site);
	const group = $derived(site?.group ?? null);
	const taxonomy = $derived(site?.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const basePath = $derived(site?.basePath || '');
	const homeHref = $derived(basePath || '/');
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const joinHref = $derived(basePath ? `${basePath}/join` : '/join');
	const galleryHref = $derived(basePath ? `${basePath}/gallery` : '/gallery');
	const assetsHref = $derived(basePath ? `${basePath}/assets` : '/assets');
	const contactHref = $derived(basePath ? `${basePath}#contact` : '/#contact');
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
		const sectionTitle = sectionTitles[seoSection];
		return sectionTitle ? `${sectionTitle} — ${seoTitle}` : seoTitle;
	});
	const seoOgImage = $derived(
		group?.cover_photo_url || group?.logo_url || site?.photoBucket?.image_assets?.[0]?.href || ''
	);

	const seoDescription = $derived.by(() => {
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
			assets: limitSeoText(
				`Official links and downloadable resources shared by ${seoTitle}.`,
				165
			)
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
			'bike advocacy',
			'3 Feet Please'
		]);
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
					'@type': 'SportsOrganization',
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
		const items = [{ label: 'Home', href: homeHref }];
		if (site?.siteConfig?.sections?.news && (site?.newsPosts?.length || 0) > 0) {
			items.push({ label: 'Updates', href: updatesHref });
		}
		if (site?.siteConfig?.sections?.join) {
			items.push({ label: membershipCtaLabel, href: joinHref });
		}
		if (site?.siteConfig?.sections?.gallery && site?.photoBucket?.asset_count) {
			items.push({ label: 'Gallery', href: galleryHref });
		}
		if (site?.assetBuckets?.some((b) => b.asset_count > 0 && b.slug !== 'photos')) {
			items.push({ label: 'Resources', href: assetsHref });
		}
		if (site?.siteConfig?.sections?.contact) {
			items.push({ label: 'Contact', href: contactHref });
		}
		return items;
	});

	let mobileMenuOpen = $state(false);
	let colorMode = $state('light');

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
		try {
			const stored = window.localStorage.getItem(micrositeColorModeStorageKey);
			setColorMode(stored || 'light', false);
		} catch {
			setColorMode('light', false);
		}
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
		'cinematic'} min-h-dvh"
	data-theme={site?.theme?.dataTheme || '3fp'}
	data-color-mode={colorMode}
	style={site?.theme?.style || ''}
>
	<div class="microsite-frame flex min-h-dvh flex-col">
		<header class="microsite-nav-shell">
			<div
				class="microsite-nav microsite-nav--floating mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6"
			>
				<a href={homeHref} class="microsite-mark flex min-w-0 items-center gap-3">
					{#if group?.logo_url}
						<img
							src={group.logo_url}
							alt={`${group.name} logo`}
							class="ring-surface-50/10 h-10 w-10 flex-shrink-0 rounded-xl object-cover shadow ring-1"
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

				<nav class="hidden items-center gap-1 md:flex">
					{#each navItems as item}
						<a href={item.href} class="microsite-nav-link {isActive(item.href) ? 'is-active' : ''}">
							{item.label}
						</a>
					{/each}
				</nav>

				<div class="flex items-center gap-2">
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
						class="microsite-menu-btn md:hidden"
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
				<div class="mx-auto max-w-7xl px-4 pb-4 md:hidden">
					<div class="microsite-mobile-menu space-y-1 rounded-2xl p-2.5">
						{#each navItems as item}
							<a
								href={item.href}
								class="microsite-mobile-link {isActive(item.href) ? 'is-active' : ''}"
								onclick={() => (mobileMenuOpen = false)}
							>
								{item.label}
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</header>
		<div class="microsite-nav-offset" aria-hidden="true"></div>

		<main class="relative flex-1">
			{@render children()}
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

	.microsite-footer-link {
		color: var(--ms-footer);
	}

	.microsite-footer-link:hover {
		color: var(--ms-footer-hover);
	}

	@media (max-width: 767px) {
		.microsite-nav-offset {
			height: 4.75rem;
		}

		.microsite-nav--floating {
			border-radius: 1.25rem;
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
</style>
