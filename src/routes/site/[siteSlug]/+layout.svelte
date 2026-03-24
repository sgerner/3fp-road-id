<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import IconMenu from '@lucide/svelte/icons/menu';
	import IconMoonStar from '@lucide/svelte/icons/moon-star';
	import IconSun from '@lucide/svelte/icons/sun';
	import IconX from '@lucide/svelte/icons/x';

	let { data, children } = $props();

	const site = $derived(data.site);
	const group = $derived(site?.group ?? null);
	const basePath = $derived(site?.basePath || '');
	const homeHref = $derived(basePath || '/');
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const joinHref = $derived(basePath ? `${basePath}/join` : '/join');
	const galleryHref = $derived(basePath ? `${basePath}#gallery` : '/#gallery');
	const contactHref = $derived(basePath ? `${basePath}#contact` : '/#contact');
	const membershipCtaLabel = $derived(
		(site?.membershipProgram?.cta_label || '').trim() || 'Follow'
	);
	const micrositeColorModeStorageKey = '3fp-microsite-color-mode';

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

	function normalizePath(pathname) {
		const value = String(pathname || '').replace(/\/+$/g, '');
		return value || '/';
	}

	function isActive(href) {
		if (!href) return false;
		let targetUrl;
		try {
			targetUrl = new URL(href, $page.url);
		} catch {
			return false;
		}

		const currentPath = normalizePath($page.url.pathname);
		const targetPath = normalizePath(targetUrl.pathname);
		const currentHash = $page.url.hash || '';
		const targetHash = targetUrl.hash || '';

		if (targetHash) {
			return currentPath === targetPath && currentHash === targetHash;
		}

		return currentPath === targetPath && !currentHash;
	}
</script>

<svelte:head>
	<title>{site?.siteConfig?.site_title || group?.name || 'Group'}</title>
	<meta
		name="description"
		content={site?.siteConfig?.seo_description ||
			site?.siteConfig?.home_intro ||
			group?.description ||
			''}
	/>
	<link rel="canonical" href={site?.siteUrl || ''} />
</svelte:head>

<div
	class="microsite-shell min-h-dvh"
	data-theme={site?.theme?.dataTheme || '3fp'}
	data-color-mode={colorMode}
	style={site?.theme?.style || ''}
>
	<div class="microsite-frame flex min-h-dvh flex-col">
		<header class="microsite-nav-shell">
			<div
				class="microsite-nav microsite-nav--{site?.siteConfig?.nav_style ||
					'floating'} mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6"
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

		<main class="relative z-10 flex-1">
			{@render children()}
		</main>

		<footer class="mt-16 pb-8 text-center">
			<a
				href="https://3fp.org"
				target="_blank"
				rel="noopener noreferrer"
				class="microsite-footer-link text-xs transition-colors"
			>
				Powered by 3fp.org
			</a>
		</footer>
	</div>
</div>

<style>
	.microsite-shell {
		position: relative;
		isolation: isolate;
		color: var(--ms-fg, var(--color-surface-50));
		/* Cinematic 3-orb drama: primary, secondary, tertiary - all highly saturated */
		background:
			radial-gradient(
				85rem 65rem at 20% 25%,
				color-mix(in oklab, var(--color-primary-500) 55%, transparent),
				transparent 45%
			),
			radial-gradient(
				75rem 55rem at 80% 15%,
				color-mix(in oklab, var(--color-secondary-500) 52%, transparent),
				transparent 48%
			),
			radial-gradient(
				65rem 50rem at 50% 105%,
				color-mix(in oklab, var(--color-tertiary-500) 58%, transparent),
				transparent 52%
			),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--color-surface-950) 98%, var(--color-primary-900) 2%) 0%,
				color-mix(in oklab, var(--color-surface-900) 94%, var(--color-secondary-800) 6%) 50%,
				color-mix(in oklab, var(--color-surface-950) 96%, var(--color-tertiary-900) 4%) 100%
			);
		animation: cinematic-bg-shift 30s ease-in-out infinite alternate;
	}

	.microsite-shell[data-color-mode='dark'] {
		color-scheme: dark;
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
		/* Cinematic light mode: 3 highly saturated orbs */
		background:
			radial-gradient(
				90rem 60rem at 25% 20%,
				color-mix(in oklab, var(--color-primary-400) 62%, transparent),
				transparent 42%
			),
			radial-gradient(
				80rem 50rem at 85% 10%,
				color-mix(in oklab, var(--color-secondary-400) 58%, transparent),
				transparent 45%
			),
			radial-gradient(
				70rem 45rem at 55% 110%,
				color-mix(in oklab, var(--color-tertiary-400) 65%, transparent),
				transparent 48%
			),
			linear-gradient(
				180deg,
				color-mix(in oklab, white 94%, var(--color-primary-100) 6%) 0%,
				color-mix(in oklab, white 90%, var(--color-secondary-100) 10%) 50%,
				color-mix(in oklab, white 92%, var(--color-tertiary-100) 8%) 100%
			);
		animation: cinematic-bg-shift 30s ease-in-out infinite alternate;
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

	.microsite-nav-shell {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 45;
		padding-top: 0.35rem;
		background: linear-gradient(
			to bottom,
			color-mix(in oklab, var(--color-surface-950) 34%, transparent) 0%,
			transparent 100%
		);
	}

	.microsite-shell[data-color-mode='light'] .microsite-nav-shell {
		background: linear-gradient(
			to bottom,
			color-mix(in oklab, white 92%, transparent) 0%,
			transparent 100%
		);
	}

	.microsite-nav-offset {
		height: 5.2rem;
	}

	.microsite-nav {
		backdrop-filter: blur(20px);
	}

	.microsite-nav--floating {
		margin-top: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 12%, transparent);
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-surface-950) 78%, transparent);
	}

	.microsite-shell[data-color-mode='light'] .microsite-nav--floating {
		border-color: color-mix(in oklab, var(--color-primary-500) 28%, transparent);
		background: color-mix(in oklab, white 78%, var(--color-primary-100) 22%);
		box-shadow:
			0 14px 34px -24px color-mix(in oklab, var(--color-primary-500) 44%, transparent),
			0 9px 20px -18px rgb(15 23 42 / 0.25);
	}

	.microsite-nav--inline {
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-50) 12%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 52%, transparent);
	}

	.microsite-nav--minimal {
		background: transparent;
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

	/* Cinematic background animation - subtle organic movement */
	@keyframes cinematic-bg-shift {
		0% {
			background-position:
				0% 0%,
				100% 0%,
				50% 100%,
				30% 80%,
				0% 0%;
		}
		100% {
			background-position:
				5% 10%,
				95% 5%,
				55% 95%,
				35% 75%,
				0% 0%;
		}
	}
</style>
