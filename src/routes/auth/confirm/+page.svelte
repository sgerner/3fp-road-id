<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '$lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';

	let error = $state('');
	let message = $state('Completing login…');
	let sending = $state(false);
	let resendEmail = $state('');
	let resendSuccess = $state('');
	let resendError = $state('');
	let ridParam = $state('');
	let returnToParam = $state('');
	let emailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(resendEmail));
	let resendHoneypot = $state('');
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

	function setSessionCookie(session) {
		try {
			const payload = JSON.stringify(session);
			document.cookie = `sb_session=${encodeURIComponent(payload)}; Path=/; Max-Age=${60 * 24 * 60 * 60}; SameSite=Lax`;
		} catch {}
	}

	function normalizeParamsFromWeirdPath() {
		try {
			const { pathname, search } = window.location;
			if (!search && pathname.includes('&')) {
				const parts = pathname.split('&');
				const base = parts.shift();
				const qs = '?' + parts.join('&');
				history.replaceState(null, '', base + qs);
				return new URLSearchParams(qs);
			}
		} catch {}
		return new URLSearchParams(window.location.search);
	}

	onMount(async () => {
		try {
			const url = new URL(window.location.href);
			let params = normalizeParamsFromWeirdPath();
			const supaCode = params.get('code');
			const rid = params.get('rid');
			const returnTo = params.get('return_to');
			ridParam = rid || '';
			returnToParam = returnTo || '';
			const tokenHash = params.get('token_hash');
			let session = null;

			if (tokenHash) {
				const { data, error: vErr } = await supabase.auth.verifyOtp({
					token_hash: tokenHash,
					type: 'email'
				});
				if (vErr) {
					error = vErr.message || 'Failed to verify email link.';
					return;
				}
				session = data?.session || null;
			} else if (supaCode) {
				const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(supaCode);
				if (exErr) {
					error = exErr.message || 'Failed to complete sign-in.';
					return;
				}
				session = data?.session || null;
			} else {
				error = 'Invalid confirmation link.';
				return;
			}

			// Session persisted by supabase client; redirect appropriately
			message = 'Logged in! Redirecting…';
			if (session) setSessionCookie(session);

			// Auto-claim group if requested
			let dest = '/';
			let autoClaimSlug = '';
			let autoAddOwnerSlug = '';
			if (returnTo && returnTo.startsWith('/')) {
				dest = returnTo;
				try {
					const rtUrl = new URL(returnTo, window.location.origin);
					autoClaimSlug = rtUrl.searchParams.get('auto_claim_group') || '';
					autoAddOwnerSlug = rtUrl.searchParams.get('auto_add_owner') || '';
				} catch {}
			} else if (rid) {
				dest = `/roadid/${encodeURIComponent(rid)}`;
			}

			// Upsert email into profiles for display in owner lists
			try {
				const u = session?.user;
				if (u?.id && u?.email) {
					await supabase.from('profiles').upsert({ user_id: u.id, email: u.email });
				}
			} catch {}

			if (autoClaimSlug) {
				try {
					const claimRes = await fetch(`/api/groups/${encodeURIComponent(autoClaimSlug)}/claim`, {
						method: 'POST'
					});
					if (claimRes.ok) {
						dest = `/groups/${encodeURIComponent(autoClaimSlug)}/edit`;
					}
				} catch {}
			}

			if (autoAddOwnerSlug) {
				try {
					const ownerRes = await fetch(
						`/api/groups/${encodeURIComponent(autoAddOwnerSlug)}/owners`,
						{ method: 'POST' }
					);
					if (ownerRes.ok) {
						dest = `/groups/${encodeURIComponent(autoAddOwnerSlug)}/edit`;
					}
				} catch {}
			}

			setTimeout(() => goto(dest, { replaceState: true }), 250);
		} catch (e) {
			error = 'Unexpected error during confirmation.';
			console.error(e);
		}
	});

	async function resend(e) {
		e?.preventDefault?.();
		resendError = '';
		resendSuccess = '';
		if (!emailValid) {
			resendError = 'Enter a valid email address.';
			return;
		}
		if (resendHoneypot.trim()) {
			resendError = 'Invalid submission.';
			return;
		}
		sending = true;
		try {
			let turnstileToken = '';
			if (turnstileEnabled) {
				await initTurnstile();
				if (!turnstileWidgetId) {
					resendError = 'Verification failed. Please reload and try again.';
					sending = false;
					return;
				}
				turnstileToken = await executeTurnstile(turnstileWidgetId);
				if (!turnstileToken) {
					resendError = 'Verification failed. Please try again.';
					sending = false;
					return;
				}
			}
			const body = {
				email: resendEmail,
				createProfile: true,
				returnTo:
					returnToParam && returnToParam.startsWith('/')
						? returnToParam
						: ridParam
							? `/roadid/${ridParam}`
							: '/',
				honeypot: resendHoneypot,
				turnstileToken
			};
			if (ridParam) body.code = ridParam;
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send magic link');
			}
			resendSuccess = `We sent a new login link to ${resendEmail}.`;
			resendHoneypot = '';
		} catch (err) {
			resendError = err.message || 'Unable to resend link.';
		} finally {
			sending = false;
			if (turnstileEnabled && turnstileWidgetId) {
				resetTurnstile(turnstileWidgetId);
			}
		}
	}
</script>

<div class="mx-auto w-full max-w-md space-y-4 p-4">
	<h1 class="text-center text-xl font-semibold">Auth Confirmation</h1>
	{#if error}
		<div class="rounded-md border border-red-600/50 bg-red-900/20 p-3 text-red-200">
			<p class="mb-1">{error}</p>
			<p class="text-sm text-red-300">
				Your link may be invalid or expired. You can request a new link below.
			</p>
		</div>
		<form class="border-surface-700 bg-surface-900 rounded-md border p-3" onsubmit={resend}>
			<div aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;">
				<div bind:this={turnstileEl}></div>
			</div>
			<input
				type="text"
				name="website"
				bind:value={resendHoneypot}
				autocomplete="off"
				tabindex="-1"
				aria-hidden="true"
				style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
			/>
			<label for="resend-email" class="text-surface-300 mb-1 block text-xs">Email</label>
			<input
				id="resend-email"
				type="email"
				bind:value={resendEmail}
				placeholder="you@example.com"
				class="input w-full"
				required
			/>
			{#if resendError}
				<div class="mt-2 text-xs text-red-400">{resendError}</div>
			{/if}
			{#if resendSuccess}
				<div class="mt-2 text-xs text-green-400">{resendSuccess}</div>
			{/if}
			<button
				type="submit"
				class="btn preset-filled-primary-500 mt-3 w-full {sending
					? 'animate-pulse'
					: ''} {!emailValid || sending ? 'cursor-not-allowed opacity-50' : ''}"
				disabled={!emailValid || sending}>Resend Magic Link</button
			>
			<div class="text-surface-400 mt-2 text-center text-[11px]">
				We’ll send a new link to the email above.
			</div>
		</form>
	{:else}
		<p class="text-surface-200 text-center">{message}</p>
	{/if}
</div>
