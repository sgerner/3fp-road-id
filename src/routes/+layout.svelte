<script>
	import '../app.css';
	let { children, data } = $props();
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { toaster } from './toaster-svelte';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '$lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	// Nav icons
	import IconMenu from '@lucide/svelte/icons/menu';
	import IconHome from '@lucide/svelte/icons/home';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import IconLogOut from '@lucide/svelte/icons/log-out';
	import IconUserCircle2 from '@lucide/svelte/icons/user-circle-2';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	// Branding / social icons
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconFacebook from '@lucide/svelte/icons/facebook';
	import IconInstagram from '@lucide/svelte/icons/instagram';
	import IconMail from '@lucide/svelte/icons/mail';
	import GlobalAssistant from '$lib/components/ai/GlobalAssistant.svelte';

	const themeStorageKey = '3fp-theme';
	const defaultTheme = '3fp';
	function getInitialLayoutData() {
		return data ?? {};
	}
	const initialLayoutData = getInitialLayoutData();
	const initialUser = initialLayoutData.user ?? null;
	const initialUserProfile = initialLayoutData.userProfile ?? null;
	function normalizeOwnedGroups(value) {
		if (!Array.isArray(value)) return [];
		return value
			.map((group) => ({
				id: group?.id ?? null,
				slug: group?.slug ?? null,
				name: group?.name ?? 'Untitled group'
			}))
			.filter((group) => group.slug);
	}
	const initialOwnedGroups = normalizeOwnedGroups(initialLayoutData.ownedGroups);
	const themeOptions = [
		{ value: '3fp', label: '3FP' },
		{ value: 'mint', label: 'Mint' },
		{ value: 'cerberus', label: 'Cerberus' },
		{ value: 'catppuccin', label: 'Catppuccin' },
		{ value: 'legacy', label: 'Legacy' },
		{ value: 'nouveau', label: 'Nouveau' },
		{ value: 'rose', label: 'Rose' },
		{ value: 'sahara', label: 'Sahara' },
		{ value: 'seafoam', label: 'Seafoam' },
		{ value: 'wintry', label: 'Wintry' }
	];

	let user = $state(initialUser);
	let userProfile = $state(initialUserProfile);
	let ownedGroups = $state(initialOwnedGroups);
	let showLogin = $state(false);
	let showUserMenu = $state(false);
	let email = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let honeypot = $state('');
	let loginBtnEl = $state(null);
	let userMenuBtnEl = $state(null);
	let userMenuEl = $state(null);
	let mobileMenuBtnEl = $state(null);
	let mobileMenuEl = $state(null);
	let showMobileMenu = $state(false);
	let loginContainerEl = $state(null);
	let theme = $state(defaultTheme);
	let emailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(email));
	let turnstileEnabled = $derived(
		Boolean(PUBLIC_TURNSTILE_SITE_KEY) && data.turnstileEnabled !== false
	);
	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);
	const profileImageUrl = $derived(
		userProfile?.avatar_url ??
			user?.user_metadata?.avatar_url ??
			user?.user_metadata?.picture ??
			user?.user_metadata?.image ??
			null
	);
	const profileDisplayName = $derived(
		userProfile?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? 'Profile'
	);
	const profileInitials = $derived.by(() => {
		const value = String(profileDisplayName || '').trim();
		if (!value) return 'U';
		const parts = value.split(/\s+/).filter(Boolean);
		if (!parts.length) return 'U';
		return parts
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('');
	});
	const myGroupsMenuHref = $derived(
		ownedGroups.length === 1 && ownedGroups[0]?.slug
			? `/groups/${ownedGroups[0].slug}`
			: '/groups/my'
	);
	const myGroupsMenuLabel = $derived(ownedGroups.length === 1 ? 'My Group' : 'My Groups');
	const navigationItems = [
		{ href: '/', label: 'Home', icon: IconHome, match: (pathname) => pathname === '/' },
		{
			href: '/ride',
			label: 'Ride',
			icon: IconBike,
			match: (pathname) => pathname.startsWith('/ride')
		},
		{
			href: '/groups',
			label: 'Groups',
			icon: IconUsers,
			match: (pathname) => pathname.startsWith('/groups')
		},
		{
			href: '/volunteer',
			label: 'Volunteer',
			icon: IconHandHeart,
			match: (pathname) => pathname.startsWith('/volunteer')
		},
		{
			href: '/learn',
			label: 'Learn',
			icon: IconBookOpen,
			match: (pathname) => pathname.startsWith('/learn')
		},
		{
			href: '/merch',
			label: 'Merch',
			icon: IconShoppingBag,
			match: (pathname) => pathname.startsWith('/merch')
		}
	];

	function normalizeTheme(value) {
		return themeOptions.some((option) => option.value === value) ? value : defaultTheme;
	}

	function applyTheme(value, persist = true) {
		const nextTheme = normalizeTheme(value);
		theme = nextTheme;
		if (typeof document !== 'undefined') {
			document.documentElement.dataset.theme = nextTheme;
		}
		if (persist && typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(themeStorageKey, nextTheme);
			} catch {
				// ignore
			}
		}
	}

	async function loadCurrentProfile(nextUser = user) {
		if (!nextUser?.id) {
			userProfile = null;
			return;
		}
		try {
			const response = await fetch('/api/profile');
			if (!response.ok) {
				userProfile = null;
				return;
			}
			const payload = await response.json().catch(() => ({}));
			userProfile = payload?.profile ?? null;
		} catch {
			userProfile = null;
		}
	}

	async function loadOwnedGroups(nextUser = user) {
		if (!nextUser?.id) {
			ownedGroups = [];
			return;
		}
		try {
			const membershipQuery = new URLSearchParams({
				select: 'group_id',
				user_id: `eq.${nextUser.id}`,
				role: 'eq.owner'
			});
			const membershipRes = await fetch(`/api/v1/group-members?${membershipQuery.toString()}`);
			if (!membershipRes.ok) {
				ownedGroups = [];
				return;
			}
			const membershipPayload = await membershipRes.json().catch(() => ({}));
			const groupIds = Array.from(
				new Set(
					(membershipPayload?.data ?? [])
						.map((row) => row?.group_id)
						.filter((value) => value !== null && value !== undefined)
				)
			);
			if (!groupIds.length) {
				ownedGroups = [];
				return;
			}
			const groupsQuery = new URLSearchParams({
				select: 'id,slug,name',
				id: `in.(${groupIds.join(',')})`,
				order: 'name.asc'
			});
			const groupsRes = await fetch(`/api/v1/groups?${groupsQuery.toString()}`);
			if (!groupsRes.ok) {
				ownedGroups = [];
				return;
			}
			const groupsPayload = await groupsRes.json().catch(() => ({}));
			ownedGroups = normalizeOwnedGroups(groupsPayload?.data ?? []);
		} catch {
			ownedGroups = [];
		}
	}

	async function initSession() {
		const { data } = await supabase.auth.getSession();
		user = data.session?.user || null;
		await Promise.all([loadCurrentProfile(user), loadOwnedGroups(user)]);
	}

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
		if (isMicrositeRoute) return;
		if (turnstileEnabled && turnstileEl && !turnstileWidgetId) {
			initTurnstile();
		}
	});

	onMount(() => {
		if (isMicrositeRoute) {
			return;
		}
		try {
			const storedTheme = window.localStorage.getItem(themeStorageKey);
			const initialTheme = normalizeTheme(storedTheme || document.documentElement.dataset.theme);
			applyTheme(initialTheme);
		} catch {
			applyTheme(defaultTheme, false);
		}

		void initSession();

		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
			user = session?.user || null;
			showUserMenu = false;
			try {
				if (session) {
					const payload = JSON.stringify(session);
					document.cookie = `sb_session=${encodeURIComponent(payload)}; Path=/; Max-Age=${60 * 24 * 60 * 60}; SameSite=Lax`;
				} else {
					document.cookie = 'sb_session=; Path=/; Max-Age=0; SameSite=Lax';
				}
			} catch {
				// ignore
			}
			void Promise.all([
				loadCurrentProfile(session?.user || null),
				loadOwnedGroups(session?.user || null)
			]);
		});
		function onDocClick(e) {
			if (!showLogin) return;
			const t = e.target;
			if (loginContainerEl?.contains?.(t) || loginBtnEl?.contains?.(t)) return;
			showLogin = false;
		}
		function onKey(e) {
			if (e.key === 'Escape') showLogin = false;
		}
		function onDocClickUserMenu(e) {
			if (!showUserMenu) return;
			const t = e.target;
			if (userMenuEl?.contains?.(t) || userMenuBtnEl?.contains?.(t)) return;
			showUserMenu = false;
		}
		function onKeyUserMenu(e) {
			if (e.key === 'Escape') showUserMenu = false;
		}
		function onProfileUpdated(event) {
			const profile = event?.detail?.profile;
			if (!profile) {
				void loadCurrentProfile(user);
				return;
			}
			if (profile?.user_id && user?.id && String(profile.user_id) !== String(user.id)) return;
			userProfile = profile;
		}
		// Also close mobile menu on outside click / escape
		const onDocClickMenu = (e) => {
			if (!showMobileMenu) return;
			const t = e.target;
			if (mobileMenuEl?.contains?.(t) || mobileMenuBtnEl?.contains?.(t)) return;
			showMobileMenu = false;
		};
		const onKeyMenu = (e) => {
			if (e.key === 'Escape') showMobileMenu = false;
		};
		document.addEventListener('click', onDocClick);
		document.addEventListener('keydown', onKey);
		document.addEventListener('click', onDocClickUserMenu);
		document.addEventListener('keydown', onKeyUserMenu);
		document.addEventListener('click', onDocClickMenu);
		document.addEventListener('keydown', onKeyMenu);
		window.addEventListener('profile-updated', onProfileUpdated);
		return () => {
			sub.subscription?.unsubscribe?.();
			document.removeEventListener('click', onDocClick);
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onDocClickUserMenu);
			document.removeEventListener('keydown', onKeyUserMenu);
			document.removeEventListener('click', onDocClickMenu);
			document.removeEventListener('keydown', onKeyMenu);
			window.removeEventListener('profile-updated', onProfileUpdated);
		};
	});

	async function doLogin(e) {
		e?.preventDefault?.();
		error = '';
		success = '';
		loading = true;
		try {
			if (honeypot.trim()) {
				error = 'Invalid submission.';
				return;
			}
			if (!emailValid) {
				error = 'Enter a valid email address.';
				return;
			}
			let turnstileToken = '';
			if (turnstileEnabled) {
				await initTurnstile();
				if (!turnstileWidgetId) {
					error = 'Verification failed. Please reload and try again.';
					return;
				}
				turnstileToken = await executeTurnstile(turnstileWidgetId);
				if (!turnstileToken) {
					error = 'Verification failed. Please try again.';
					return;
				}
			}
			const rt =
				typeof window !== 'undefined'
					? window.location.pathname + window.location.search + window.location.hash
					: '/';
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					createProfile: true,
					returnTo: rt,
					honeypot,
					turnstileToken
				})
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send magic link');
			}
			success = `We sent a login link to ${email}.`;
			honeypot = '';
		} catch (err) {
			error = err.message || 'Login failed.';
		} finally {
			loading = false;
			if (turnstileEnabled && turnstileWidgetId) {
				resetTurnstile(turnstileWidgetId);
			}
		}
	}

	async function doLogout() {
		await supabase.auth.signOut();
		showLogin = false;
		showUserMenu = false;
		email = '';
		userProfile = null;
		ownedGroups = [];
		try {
			document.cookie = 'sb_session=; Path=/; Max-Age=0; SameSite=Lax';
		} catch {
			// ignore
		}
	}

	function isActiveNav(item) {
		return item.match($page.url.pathname);
	}

	function isGetInvolvedActive() {
		return $page.url.pathname.startsWith('/get-involved');
	}

	let isEmbedRoute = $derived($page.url.pathname.startsWith('/ride/widget/frame'));
	let isMicrositeRoute = $derived(Boolean(data?.isMicrosite));
</script>

<svelte:head>
	<title>3 Feet Please</title>
</svelte:head>

<div class="min-h-dvh">
	<Toast.Group {toaster} />
	{#if !isMicrositeRoute}
		<div aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;">
			<div bind:this={turnstileEl}></div>
		</div>
	{/if}
	{#if isEmbedRoute || isMicrositeRoute}
		<main class="min-h-dvh min-w-0 overflow-x-hidden p-0">
			{@render children()}
		</main>
	{:else}
		<header
			class="border-b-primary-500/20 bg-primary-500/20 sticky top-0 z-50 border-b backdrop-blur-xl"
		>
			<div class="flex items-center justify-between gap-4 p-4">
				<div class="flex items-center gap-2">
					<button
						class="border-surface-950-50/10 text-surface-950-50 hover:bg-surface-950-50/10 rounded-lg border p-2 md:hidden"
						bind:this={mobileMenuBtnEl}
						onclick={() => (showMobileMenu = !showMobileMenu)}
						aria-label="Menu"
						aria-expanded={showMobileMenu}
					>
						<IconMenu class="h-5 w-5" />
					</button>
					<a href="/" class="text-surface-950-50 flex items-center gap-3">
						<img src="/3fp.png" alt="3 Feet Please" class="h-9 w-9 rounded-md object-contain" />
						<div>
							<p class="text-primary-950-50 m-0 text-lg font-bold tracking-wide">3 Feet Please</p>
						</div>
					</a>
				</div>

				<div class="flex items-center gap-3">
					<label class="hidden items-center gap-2 md:flex">
						<select
							class="select bg-surface-100-900/70 text-sm"
							value={theme}
							onchange={(e) => applyTheme(e.currentTarget.value)}
							aria-label="Select theme"
						>
							{#each themeOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					<div class="relative">
						{#if user}
							<div class="relative flex items-center gap-2">
								<button
									class="profile-trigger hover:border-primary-500/45 border-surface-500/30 bg-surface-100-900/65 flex items-center gap-2 rounded-full border px-2 py-1 transition"
									bind:this={userMenuBtnEl}
									onclick={() => (showUserMenu = !showUserMenu)}
									aria-label="Open profile menu"
									aria-expanded={showUserMenu}
									aria-haspopup="menu"
								>
									<span class="profile-avatar">
										{#if profileImageUrl}
											<img
												src={profileImageUrl}
												alt={`${profileDisplayName || 'User'} profile photo`}
												class="h-full w-full object-cover"
											/>
										{:else}
											<span>{profileInitials}</span>
										{/if}
									</span>
									<span class="text-sm font-semibold max-md:hidden">
										{profileDisplayName}
									</span>
									<IconChevronDown class="h-4 w-4 opacity-70 max-md:hidden" />
								</button>
								{#if showUserMenu}
									<div
										class="profile-menu border-surface-300-700 bg-surface-100-900 absolute top-[calc(100%+0.55rem)] right-0 z-50 w-56 rounded-xl border p-1.5 shadow-xl"
										bind:this={userMenuEl}
										role="menu"
									>
										<a
											href="/profile"
											class="profile-menu-item"
											role="menuitem"
											onclick={() => (showUserMenu = false)}
										>
											<IconUserCircle2 class="h-4 w-4" />
											Profile
										</a>
										<a
											href={myGroupsMenuHref}
											class="profile-menu-item"
											role="menuitem"
											onclick={() => (showUserMenu = false)}
										>
											<IconUsers class="h-4 w-4" />
											{myGroupsMenuLabel}
										</a>
										<a
											href="/volunteer/shifts"
											class="profile-menu-item"
											role="menuitem"
											onclick={() => (showUserMenu = false)}
										>
											<IconHandHeart class="h-4 w-4" />
											Volunteer shifts
										</a>
										<button class="profile-menu-item w-full" onclick={doLogout} role="menuitem">
											<IconLogOut class="h-4 w-4" />
											Log out
										</button>
									</div>
								{/if}
							</div>
						{:else}
							<button
								class="chip preset-filled-primary-500"
								bind:this={loginBtnEl}
								onclick={() => (showLogin = !showLogin)}
							>
								Log in / Register
							</button>
							{#if showLogin}
								<div
									class="bg-surface-50-950/50 fixed inset-0 z-40 md:hidden"
									onclick={() => (showLogin = false)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') showLogin = false;
									}}
									role="button"
									tabindex="0"
									aria-label="Close login"
								></div>

								<div bind:this={loginContainerEl}>
									<form
										class="border-surface-300-700 bg-surface-100-900 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border p-4 shadow-2xl md:hidden"
										onsubmit={doLogin}
									>
										<input
											type="text"
											name="website"
											bind:value={honeypot}
											autocomplete="off"
											tabindex="-1"
											aria-hidden="true"
											style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
										/>
										<div class="mb-2 flex items-center justify-between">
											<h3 class="text-base font-semibold">Log in / Register</h3>
											<button
												type="button"
												class="btn preset-tonal-warning btn-sm px-2 !py-1 text-sm"
												onclick={() => (showLogin = false)}>Close</button
											>
										</div>
										<label for="login-email-m" class="text-surface-700-300 mb-1 block text-xs"
											>Email</label
										>
										<input
											id="login-email-m"
											type="email"
											bind:value={email}
											placeholder="you@example.com"
											class="input bg-primary-50-950/30 text-surface-950-50 w-full"
											required
										/>
										{#if error}
											<div class="text-error-600-400 mt-2 text-xs">{error}</div>
										{/if}
										{#if success}
											<div class="text-success-600-400 mt-2 text-xs">{success}</div>
										{/if}
										<button
											type="submit"
											class="btn preset-filled-primary-500 mt-3 w-full {loading
												? 'animate-pulse'
												: ''} {!emailValid || loading ? 'cursor-not-allowed opacity-50' : ''}"
											disabled={loading || !emailValid}
										>
											Send Magic Link
										</button>
										<div class="text-surface-600-400 mt-2 text-center text-[11px]">
											Use the same form to log in or create an account.
										</div>
									</form>

									<form
										class="border-surface-300-700 bg-surface-100-900 absolute right-0 z-50 mt-3 hidden w-80 rounded-xl border p-4 shadow-lg md:block"
										onsubmit={doLogin}
									>
										<input
											type="text"
											name="website"
											bind:value={honeypot}
											autocomplete="off"
											tabindex="-1"
											aria-hidden="true"
											style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
										/>
										<label for="login-email" class="text-surface-700-300 mb-1 block text-xs"
											>Email</label
										>
										<input
											id="login-email"
											type="email"
											bind:value={email}
											placeholder="you@example.com"
											class="input bg-primary-50-950/30 text-surface-950-50 w-full"
											required
										/>
										{#if error}
											<div class="text-error-600-400 mt-2 text-xs">{error}</div>
										{/if}
										{#if success}
											<div class="text-success-600-400 mt-2 text-xs">{success}</div>
										{/if}
										<button
											type="submit"
											class="btn preset-filled-primary-500 mt-3 w-full {loading
												? 'animate-pulse'
												: ''} {!emailValid || loading ? 'cursor-not-allowed opacity-50' : ''}"
											disabled={loading || !emailValid}
										>
											Send Magic Link
										</button>
										<div class="text-surface-600-400 mt-2 text-center text-[11px]">
											Use the same form to log in or create an account.
										</div>
									</form>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		</header>

		<div class="grid min-h-[calc(100dvh-73px)] grid-cols-1 md:grid-cols-[6.5rem_minmax(0,1fr)]">
			<aside class="border-surface-500/10 bg-surface-50-950/42 hidden md:block md:border-r">
				<div class="sticky top-[73px] flex h-[calc(100dvh-73px)] flex-col items-center px-2 py-4">
					<nav aria-label="Primary" class="flex w-full flex-col items-center gap-2">
						{#each navigationItems as item}
							<a
								href={item.href}
								title={item.label}
								aria-label={item.label}
								class={`flex w-full max-w-[5.6rem] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-4 text-center transition ${
									isActiveNav(item)
										? 'bg-primary-600-400 text-surface-50-950 shadow-primary-50-950/25 shadow-lg'
										: 'text-surface-800-200 hover:bg-surface-950-50/10 hover:text-surface-950-50'
								}`}
							>
								<item.icon class="h-6 w-6 shrink-0" />
								<span class="text-[0.78rem] leading-none font-medium">{item.label}</span>
							</a>
						{/each}
						<!-- ── Bottom branding section ── -->
						<div class="mt-auto flex w-full flex-col items-center gap-3 pt-4 pb-2">
							<!-- Divider -->
							<div class="border-surface-500/15 w-full border-t"></div>

							<!-- Get Involved link -->
							<a
								href="/get-involved"
								title="Get Involved"
								aria-label="Get Involved"
								class={`rail-brand-link flex w-full flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition ${
									isGetInvolvedActive()
										? 'text-primary-500 bg-primary-500/10'
										: 'text-surface-600-400 hover:text-primary-500 hover:bg-primary-500/8'
								}`}
							>
								<span class="text-[0.68rem] leading-none font-semibold tracking-wide"
									>Get Involved</span
								>
							</a>

							<!-- Social icon row -->
							<div class="flex items-center gap-1">
								<a
									href="https://www.facebook.com/3FeetPlease/"
									target="_blank"
									rel="noopener noreferrer"
									title="3FP on Facebook"
									aria-label="3 Feet Please on Facebook"
									class="rail-social-btn"
								>
									<IconFacebook class="h-3.5 w-3.5" />
								</a>
								<a
									href="https://www.instagram.com/3feetplease"
									target="_blank"
									rel="noopener noreferrer"
									title="3FP on Instagram"
									aria-label="3 Feet Please on Instagram"
									class="rail-social-btn"
								>
									<IconInstagram class="h-3.5 w-3.5" />
								</a>
								<a
									href="mailto:hi@3fp.org"
									title="Email 3FP"
									aria-label="Email 3 Feet Please"
									class="rail-social-btn"
								>
									<IconMail class="h-3.5 w-3.5" />
								</a>
							</div>

							<a
								href="/donate"
								title="Donate"
								aria-label="Donate"
								class="rail-donate-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.7rem] font-bold tracking-wide"
							>
								<IconHeart class="h-3.5 w-3.5 fill-current" />
								Donate
							</a>

							<div class="flex w-full items-center justify-center gap-1 px-2 text-[0.65rem]">
								<a
									href="/privacy"
									class="text-surface-700-300 hover:text-surface-600-400 transition"
								>
									Privacy
								</a>
								<span class="text-surface-700-300">|</span>
								<a href="/terms" class="text-surface-700-300 hover:text-surface-600-400 transition">
									Terms
								</a>
							</div>

							{#if data.isAdmin}
								<a
									href="/admin/rides/import"
									class="text-surface-700-300 hover:text-surface-600-400 w-full px-2 py-1 text-center text-[0.65rem] transition"
								>
									Import Rides
								</a>
							{/if}
						</div>
					</nav>
				</div>
			</aside>

			<main class="min-w-0 overflow-x-hidden p-4">
				{@render children()}
			</main>
		</div>

		<!-- Mobile dropdown menu (AppBar hamburger) -->
		{#if showMobileMenu}
			<div class="fixed top-[73px] right-4 left-4 z-50 md:hidden" bind:this={mobileMenuEl}>
				<div
					class="border-surface-300-700 bg-surface-100-900/78 text-surface-950-50 rounded-xl border p-2 shadow-xl backdrop-blur-xl"
				>
					<div class="border-surface-500/10 mb-2 border-b px-1 pb-3">
						<label class="flex flex-col gap-2">
							<span
								class="text-surface-700-300 text-[0.65rem] font-semibold tracking-[0.24em] uppercase"
							>
								Theme
							</span>
							<select
								class="select bg-surface-50-950/80 w-full"
								value={theme}
								onchange={(e) => applyTheme(e.currentTarget.value)}
								aria-label="Select theme"
							>
								{#each themeOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
					</div>
					<nav aria-label="Mobile" class="space-y-1">
						{#each navigationItems as item}
							<a
								href={item.href}
								class={`flex items-center gap-3 rounded-lg px-3 py-3 ${
									isActiveNav(item)
										? 'bg-primary-500 text-surface-50-950'
										: 'hover:bg-surface-950-50/10'
								}`}
								onclick={() => (showMobileMenu = false)}
							>
								<item.icon class="h-5 w-5 shrink-0" />
								<span>{item.label}</span>
							</a>
						{/each}
					</nav>
					<div class="border-surface-500/10 mt-2 space-y-1 border-t pt-2">
						<a
							href="/get-involved"
							class={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
								isGetInvolvedActive()
									? 'text-primary-500 bg-primary-500/10'
									: 'text-surface-700-300 hover:bg-surface-950-50/10 hover:text-primary-400'
							}`}
							onclick={() => (showMobileMenu = false)}
						>
							<IconHeart class="h-5 w-5 shrink-0" />
							Get Involved
						</a>
						<!-- Social + Donate row -->
						<div class="flex items-center gap-2 px-3 py-1.5">
							<a
								href="https://www.facebook.com/3FeetPlease/"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Facebook"
								class="mob-social-btn"
							>
								<IconFacebook class="h-4 w-4" />
							</a>
							<a
								href="https://www.instagram.com/3feetplease"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Instagram"
								class="mob-social-btn"
							>
								<IconInstagram class="h-4 w-4" />
							</a>
							<a href="mailto:hi@3fp.org" aria-label="Email" class="mob-social-btn">
								<IconMail class="h-4 w-4" />
							</a>
							<a
								href="/donate"
								class="mob-donate-btn ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
								onclick={() => (showMobileMenu = false)}
							>
								<IconHeart class="h-3.5 w-3.5 fill-current" />
								Donate
							</a>
						</div>
						<div class="flex flex-wrap items-center gap-4 px-3 pb-1 text-xs">
							<a
								href="/privacy"
								class="text-surface-700-300 hover:text-surface-600-400 transition"
								onclick={() => (showMobileMenu = false)}
							>
								Privacy
							</a>
							<a
								href="/terms"
								class="text-surface-700-300 hover:text-surface-600-400 transition"
								onclick={() => (showMobileMenu = false)}
							>
								Terms
							</a>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<GlobalAssistant userId={user?.id ?? null} pathname={$page.url.pathname} />
	{/if}
</div>

<style>
	.profile-avatar {
		display: inline-flex;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		overflow: hidden;
		align-items: center;
		justify-content: center;
		font-size: 0.78rem;
		font-weight: 700;
		background: color-mix(in oklab, var(--color-primary-500) 16%, var(--color-surface-900) 84%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.profile-menu {
		backdrop-filter: blur(10px);
	}

	.profile-menu-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		border: 0;
		border-radius: 0.65rem;
		padding: 0.55rem 0.6rem;
		font-size: 0.9rem;
		color: inherit;
		text-decoration: none;
		background: transparent;
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.profile-menu-item:hover {
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
		color: var(--color-primary-300);
	}

	/* ── Rail: Get Involved link ── */
	:global(.rail-brand-link) {
		text-decoration: none;
	}
	:global(.rail-brand-link:hover) {
		text-decoration: none;
	}

	/* ── Rail: social icon buttons ── */
	:global(.rail-social-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.6rem;
		color: var(--color-surface-500);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 6%, transparent);
		text-decoration: none;
		transition:
			color 150ms,
			background 150ms,
			border-color 150ms,
			transform 150ms;
	}
	:global(.rail-social-btn:hover) {
		color: var(--color-primary-500);
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		transform: translateY(-1px);
	}

	/* ── Rail: Donate button ── */
	:global(.rail-donate-btn) {
		color: color-mix(in oklab, var(--color-error-500) 88%, var(--color-surface-50) 12%);
		background: color-mix(in oklab, var(--color-error-500) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 34%, transparent);
		text-decoration: none;
		transition:
			transform 150ms ease,
			background 150ms ease,
			border-color 150ms ease;
	}
	:global(.rail-donate-btn:hover) {
		transform: translateY(-1px);
		background: color-mix(in oklab, var(--color-error-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-error-500) 44%, transparent);
	}

	/* ── Mobile menu: social icon buttons ── */
	:global(.mob-social-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 0.6rem;
		color: var(--color-surface-500);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 6%, transparent);
		text-decoration: none;
		transition:
			color 150ms,
			background 150ms,
			border-color 150ms;
	}
	:global(.mob-social-btn:hover) {
		color: var(--color-primary-400);
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	/* ── Mobile menu: Donate button ── */
	:global(.mob-donate-btn) {
		color: color-mix(in oklab, var(--color-error-500) 88%, var(--color-surface-50) 12%);
		background: color-mix(in oklab, var(--color-error-500) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 34%, transparent);
		text-decoration: none;
	}
</style>
