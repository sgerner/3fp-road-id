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
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';

	const themeStorageKey = '3fp-theme';
	const defaultTheme = '3fp';
	const themeOptions = [
		{ value: '3fp', label: '3FP' },
		{ value: 'mint', label: 'Mint' },
		{ value: 'cerberus', label: 'Cerberus' },
		{ value: 'modern', label: 'Modern' },
		{ value: 'seafoam', label: 'Seafoam' },
		{ value: 'rocket', label: 'Rocket' },
		{ value: 'pine', label: 'Pine' }
	];

	let user = $state(null);
	let showLogin = $state(false);
	let email = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let honeypot = $state('');
	let loginBtnEl = $state(null);
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
	const navigationItems = [
		{ href: '/', label: 'Home', icon: IconHome, match: (pathname) => pathname === '/' },
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
			href: '/roadid',
			label: 'In Case',
			icon: IconIdCard,
			match: (pathname) => pathname.startsWith('/roadid')
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

	async function initSession() {
		const { data } = await supabase.auth.getSession();
		user = data.session?.user || null;
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
		if (turnstileEnabled && turnstileEl && !turnstileWidgetId) {
			initTurnstile();
		}
	});

	onMount(() => {
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
		document.addEventListener('click', onDocClickMenu);
		document.addEventListener('keydown', onKeyMenu);
		return () => {
			sub.subscription?.unsubscribe?.();
			document.removeEventListener('click', onDocClick);
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onDocClickMenu);
			document.removeEventListener('keydown', onKeyMenu);
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
		email = '';
		try {
			document.cookie = 'sb_session=; Path=/; Max-Age=0; SameSite=Lax';
		} catch {
			// ignore
		}
	}

	function isActiveNav(item) {
		return item.match($page.url.pathname);
	}
</script>

<svelte:head>
	<title>3 Feet Please</title>
</svelte:head>

<div class="min-h-dvh">
	<Toast.Group {toaster} />
	<div aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;">
		<div bind:this={turnstileEl}></div>
	</div>
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
						<div class="flex items-center gap-2">
							<button class="chip preset-tonal-surface" onclick={doLogout}>Logout</button>
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
			</div>
		</div>
	{/if}
</div>
