<script>
	import '../app.css';
	let { children } = $props();
	import { AppBar, Navigation, Toaster } from '@skeletonlabs/skeleton-svelte';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { toaster } from './toaster-svelte';
	// Nav icons
	import IconMenu from '@lucide/svelte/icons/menu';
	import IconHome from '@lucide/svelte/icons/home';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconIdCard from '@lucide/svelte/icons/id-card';

	let user = $state(null);
	let showLogin = $state(false);
	let email = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let loginBtnEl = $state(null);
	let mobileMenuBtnEl = $state(null);
	let mobileMenuEl = $state(null);
	let showMobileMenu = $state(false);
	let loginContainerEl = $state(null);
	let emailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(email));

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		user = data.session?.user || null;
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
			if (!emailValid) {
				error = 'Enter a valid email address.';
				return;
			}
			const rt =
				typeof window !== 'undefined'
					? window.location.pathname + window.location.search + window.location.hash
					: '/';
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, createProfile: true, returnTo: rt })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send magic link');
			}
			success = `We sent a login link to ${email}.`;
		} catch (err) {
			error = err.message || 'Login failed.';
		} finally {
			loading = false;
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
</script>

<svelte:head>
	<title>SafeSpokes | 3 Feet Please</title>
</svelte:head>

<div class="from-surface-950 to-surface-700 h-full min-h-screen bg-linear-to-br">
	<Toaster {toaster} />
	<AppBar background="bg-primary-500" classes="text-surface-950">
		{#snippet lead()}
			<div class="flex items-center gap-2">
				<!-- Mobile hamburger -->
				<button
					class="rounded p-2 hover:bg-white/20 md:hidden"
					bind:this={mobileMenuBtnEl}
					onclick={() => (showMobileMenu = !showMobileMenu)}
					aria-label="Menu"
					aria-expanded={showMobileMenu}
				>
					<IconMenu />
				</button>
				<a href="/" class="flex items-center gap-2">
					<img src="/3fp.png" alt="3 Feet Please" class="h-6 w-6" />
					<span class="font-bold">3 Feet Please</span>
				</a>
			</div>
		{/snippet}
		{#snippet trail()}
			<div class="relative">
				{#if user}
					<div class="flex items-center gap-2">
						<span class="hidden text-sm md:inline">{user.email}</span>
						<button class="chip preset-tonal-surface-500" onclick={doLogout}>Logout</button>
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
						<!-- Backdrop + modal for mobile -->
						<div
							class="fixed inset-0 z-40 bg-black/50 md:hidden"
							onclick={() => (showLogin = false)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') showLogin = false;
							}}
							role="button"
							tabindex="0"
							aria-label="Close login"
						></div>

						<!-- Container for login UI (used for click-outside) -->
						<div bind:this={loginContainerEl}>
							<!-- Mobile modal -->
							<form
								class="border-surface-700 bg-surface-900 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border p-4 shadow-2xl md:hidden"
								onsubmit={doLogin}
							>
								<div class="mb-2 flex items-center justify-between">
									<h3 class="text-base font-semibold">Log in / Register</h3>
									<button
										type="button"
										class="btn preset-tonal-warning btn-sm px-2 !py-1 text-sm"
										onclick={() => (showLogin = false)}>Close</button
									>
								</div>
								<label for="login-email-m" class="text-surface-300 mb-1 block text-xs">Email</label>
								<input
									id="login-email-m"
									type="email"
									bind:value={email}
									placeholder="you@example.com"
									class="input bg-primary-950/30 w-full text-white"
									required
								/>
								{#if error}
									<div class="mt-2 text-xs text-red-400">{error}</div>
								{/if}
								{#if success}
									<div class="mt-2 text-xs text-green-400">{success}</div>
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
								<div class="text-surface-400 mt-2 text-center text-[11px]">
									Use the same form to log in or create an account.
								</div>
							</form>

							<!-- Desktop dropdown -->
							<form
								class="border-surface-700 bg-surface-900 absolute right-0 z-50 mt-2 hidden w-64 rounded-md border p-3 shadow-lg md:block md:w-80"
								onsubmit={doLogin}
							>
								<label for="login-email" class="text-surface-300 mb-1 block text-xs">Email</label>
								<input
									id="login-email"
									type="email"
									bind:value={email}
									placeholder="you@example.com"
									class="input bg-primary-950/30 w-full text-white"
									required
								/>
								{#if error}
									<div class="mt-2 text-xs text-red-400">{error}</div>
								{/if}
								{#if success}
									<div class="mt-2 text-xs text-green-400">{success}</div>
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
								<div class="text-surface-400 mt-2 text-center text-[11px]">
									Use the same form to log in or create an account.
								</div>
							</form>
						</div>
					{/if}
				{/if}
			</div>
		{/snippet}
	</AppBar>

	<!-- Layout: Rail on md+, bottom bar on small screens -->
	<div class="grid grid-cols-1 md:grid-cols-[auto_1fr]">
		<!-- Left Rail (md+) -->
		<aside class="hidden md:block">
			<Navigation.Rail
				background="bg-surface-900/90 backdrop-blur"
				classes="text-white"
				height="h-[100dvh]"
				tilesJustify="justify-start"
			>
				{#snippet tiles()}
					<Navigation.Tile label="Home" href="/" selected={$page.url.pathname === '/'}>
						<IconHome />
					</Navigation.Tile>
					<Navigation.Tile
						label="Groups"
						href="/groups"
						selected={$page.url.pathname.startsWith('/groups')}
					>
						<IconUsers />
					</Navigation.Tile>
					<Navigation.Tile
						label="Road ID"
						href="/roadid"
						selected={$page.url.pathname.startsWith('/roadid')}
					>
						<IconIdCard />
					</Navigation.Tile>
				{/snippet}
			</Navigation.Rail>
		</aside>

		<!-- Content -->
		<main class="flex min-h-[calc(100dvh-56px)] w-full flex-col items-center gap-4 p-4 pb-4">
			{@render children()}
		</main>
	</div>

	<!-- Mobile dropdown menu (AppBar hamburger) -->
	{#if showMobileMenu}
		<div class="fixed top-[56px] right-2 left-2 z-50 md:hidden" bind:this={mobileMenuEl}>
			<div
				class="border-surface-700 bg-surface-900/95 rounded-md border p-2 text-white shadow-xl backdrop-blur"
			>
				<a
					href="/"
					class="flex items-center gap-2 rounded px-2 py-2 hover:bg-white/10"
					onclick={() => (showMobileMenu = false)}
				>
					<IconHome /> <span>Home</span>
				</a>
				<a
					href="/groups"
					class="flex items-center gap-2 rounded px-2 py-2 hover:bg-white/10"
					onclick={() => (showMobileMenu = false)}
				>
					<IconUsers /> <span>Groups</span>
				</a>
				<a
					href="/roadid"
					class="flex items-center gap-2 rounded px-2 py-2 hover:bg-white/10"
					onclick={() => (showMobileMenu = false)}
				>
					<IconIdCard /> <span>Road ID</span>
				</a>
			</div>
		</div>
	{/if}
</div>
