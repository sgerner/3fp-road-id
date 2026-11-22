<script>
	let { data } = $props();
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabaseClient';
	import { goto } from '$app/navigation';
	import TurnstileVerification from '#lib/components/security/TurnstileVerification.svelte';
	import { isSafeInternalPath } from '#lib/security/navigation';
	import { syncServerSession } from '#lib/security/session';
	import {
		isValidRoadIdEmail,
		normalizeRoadIdCodeInput,
		resolveConfirmRedirectDestination
	} from '#lib/utils/roadId';

	let error = $state('');
	let claimError = $state('');
	let message = $state('Completing login…');
	let sending = $state(false);
	let resendEmail = $state('');
	let resendSuccess = $state('');
	let resendError = $state('');
	let ridParam = $state('');
	let returnToParam = $state('');
	let emailValid = $derived(isValidRoadIdEmail(resendEmail));
	let resendHoneypot = $state('');
	/** @type {any} */
	let resendTurnstile = $state(null);

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
		} catch {
			// Ignore malformed history paths
		}
		return new URLSearchParams(window.location.search);
	}

	onMount(async () => {
		try {
			let params = normalizeParamsFromWeirdPath();
			const hashParams = new URLSearchParams(
				window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
			);
			const supaCode = params.get('code');
			const rid = normalizeRoadIdCodeInput(params.get('rid') || '');
			const returnTo = params.get('return_to');
			ridParam = rid || '';
			returnToParam = returnTo || '';
			const tokenHash = params.get('token_hash') || params.get('token');
			const tokenTypeRaw = (params.get('type') || 'email').toLowerCase();
			const tokenType = tokenTypeRaw === 'magiclink' ? 'email' : tokenTypeRaw;
			const hashAccessToken = hashParams.get('access_token');
			const hashRefreshToken = hashParams.get('refresh_token');
			let session = null;

			if (tokenHash) {
				let verified = null;
				let verifyError = null;
				for (const type of [tokenType, 'email']) {
					const { data: otpData, error: vErr } = await supabase.auth.verifyOtp({
						token_hash: tokenHash,
						type
					});
					if (!vErr) {
						verified = otpData;
						verifyError = null;
						break;
					}
					verifyError = vErr;
				}
				if (!verified) {
					error = verifyError?.message || 'Failed to verify email link.';
					return;
				}
				session = verified?.session || null;
			} else if (supaCode) {
				const { data: codeData, error: exErr } =
					await supabase.auth.exchangeCodeForSession(supaCode);
				if (exErr) {
					error = exErr.message || 'Failed to complete sign-in.';
					return;
				}
				session = codeData?.session || null;
			} else if (hashAccessToken && hashRefreshToken) {
				const { data: sessionData, error: setErr } = await supabase.auth.setSession({
					access_token: hashAccessToken,
					refresh_token: hashRefreshToken
				});
				if (setErr) {
					error = setErr.message || 'Failed to complete sign-in.';
					return;
				}
				session = sessionData?.session || null;
				try {
					const cleaned = new URL(window.location.href);
					cleaned.hash = '';
					history.replaceState(null, '', cleaned.toString());
				} catch {
					// Ignore history cleanup errors
				}
			} else {
				error = 'Invalid confirmation link.';
				return;
			}

			message = 'Logged in! Syncing session…';
			if (session && !(await syncServerSession(session))) {
				error = 'Unable to establish your authenticated session. Please try again.';
				return;
			}

			let dest = resolveConfirmRedirectDestination({ rid, returnTo });
			let autoClaimSlug = '';
			let autoAddOwnerSlug = '';
			let ownerInviteToken = '';
			if (returnTo && isSafeInternalPath(returnTo)) {
				try {
					const rtUrl = new URL(returnTo, window.location.origin);
					autoClaimSlug = rtUrl.searchParams.get('auto_claim_group') || '';
					autoAddOwnerSlug = rtUrl.searchParams.get('auto_add_owner') || '';
					ownerInviteToken = rtUrl.searchParams.get('owner_invite') || '';
					rtUrl.searchParams.delete('auto_claim_group');
					rtUrl.searchParams.delete('auto_add_owner');
					rtUrl.searchParams.delete('owner_invite');
					const cleanedReturn = `${rtUrl.pathname}${rtUrl.search}${rtUrl.hash}`;
					dest = resolveConfirmRedirectDestination({ rid, returnTo: cleanedReturn });
				} catch {
					// Keep resolved destination
				}
			}

			if (rid) {
				message = 'Linking your bracelet…';
				const claimRes = await fetch('/api/v1/road-id-profile/codes', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ code: rid, allowAlreadyOwned: true })
				});
				if (!claimRes.ok) {
					const claimPayload = await claimRes.json().catch(() => ({}));
					claimError =
						claimPayload?.error || 'Unable to link this bracelet code to your Emergency ID.';
					return;
				}
				dest = '/profile#road-id';
			}

			if (autoClaimSlug) {
				try {
					const claimRes = await fetch(`/api/groups/${encodeURIComponent(autoClaimSlug)}/claim`, {
						method: 'POST'
					});
					if (claimRes.ok) {
						dest = `/groups/${encodeURIComponent(autoClaimSlug)}/manage/edit`;
					}
				} catch {
					// Continue to fallback destination
				}
			}

			if (autoAddOwnerSlug && ownerInviteToken) {
				try {
					const ownerRes = await fetch(
						`/api/groups/${encodeURIComponent(autoAddOwnerSlug)}/owners`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ inviteToken: ownerInviteToken })
						}
					);
					if (ownerRes.ok) {
						dest = `/groups/${encodeURIComponent(autoAddOwnerSlug)}/manage/edit`;
					}
				} catch {
					// Continue to fallback destination
				}
			}

			message = 'Logged in! Redirecting…';
			setTimeout(() => goto(dest, { replaceState: true }), 250);
		} catch (e) {
			error = 'Unexpected error during confirmation.';
			console.error(e);
		}
	});

	async function resend(e) {
		e?.preventDefault?.();
		if (sending || !resendTurnstile) return;
		resendError = '';
		resendSuccess = '';
		await resendTurnstile.submit({
			validate: () => {
				if (!emailValid) {
					resendError = 'Enter a valid email address.';
					return false;
				}
				if (resendHoneypot.trim()) {
					resendError = 'Invalid submission.';
					return false;
				}
				return true;
			},
			onSubmit: async (turnstileToken) => {
				try {
					const body = {
						email: resendEmail,
						createProfile: true,
						returnTo: resolveConfirmRedirectDestination({
							rid: ridParam,
							returnTo: returnToParam
						}),
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
				}
			}
		});
	}
</script>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-hidden"
>
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby="auth-confirm-heading"
	>
		<div
			class="flex flex-col justify-between gap-6 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Account Access</span>
			</p>
			<h1
				id="auth-confirm-heading"
				class="text-surface-950! m-0 text-[clamp(2.8rem,6.5vw,5.75rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
			>
				Auth <span class="text-secondary-500">Confirmation</span>
			</h1>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</header>

	<!-- CONTENT -->
	<section
		class="bg-surface-950 border-surface-950 flex-1 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
	>
		{#if claimError}
			<div class="flex max-w-2xl flex-col gap-6">
				<div class="bg-tertiary-500 text-surface-950 flex flex-col gap-2 p-6 sm:p-8" role="alert">
					<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Bracelet Claim Issue</p>
					<p class="m-0 text-2xl font-black uppercase italic">{claimError}</p>
					<p class="m-0 text-sm font-medium">
						Your account sign-in succeeded. You can manage your Emergency ID or claim a different
						bracelet code on your profile.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-4">
					<a
						href="/profile#road-id"
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center px-8 py-3.5 text-base font-black tracking-wide uppercase transition"
					>
						Open Emergency ID
					</a>
				</div>
			</div>
		{:else if error}
			<div class="flex max-w-2xl flex-col gap-8">
				<div class="bg-tertiary-500 text-surface-950 flex flex-col gap-2 p-6 sm:p-8" role="alert">
					<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Verification Issue</p>
					<p class="m-0 text-2xl font-black uppercase italic">{error}</p>
					<p class="m-0 text-sm font-medium">
						Your link may be invalid or expired. Request a fresh magic link below.
					</p>
				</div>

				<form class="border-surface-50 flex flex-col gap-5 border-t-2 pt-8" onsubmit={resend}>
					<input
						type="text"
						name="website"
						bind:value={resendHoneypot}
						autocomplete="off"
						tabindex="-1"
						aria-hidden="true"
						style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
					/>
					<div class="flex flex-col gap-2">
						<label
							for="resend-email"
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
						>
							Email
						</label>
						<input
							id="resend-email"
							type="email"
							autocomplete="email"
							bind:value={resendEmail}
							placeholder="you@example.com"
							class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 w-full border-2"
							required
						/>
					</div>
					<TurnstileVerification
						bind:this={resendTurnstile}
						bind:busy={sending}
						enabled={data.turnstileEnabled !== false}
					/>
					{#if resendError}
						<div
							class="bg-tertiary-500 text-surface-950 px-4 py-2 text-xs font-bold uppercase"
							role="alert"
						>
							{resendError}
						</div>
					{/if}
					{#if resendSuccess}
						<div class="bg-primary-500 text-surface-950 px-4 py-2 text-xs font-black uppercase">
							{resendSuccess}
						</div>
					{/if}
					<div class="flex flex-wrap items-center gap-4">
						<button
							type="submit"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center px-8 py-3.5 text-base font-black tracking-wide uppercase transition {sending
								? 'motion-safe:animate-pulse'
								: ''} {!emailValid || sending ? 'cursor-not-allowed opacity-50' : ''}"
							disabled={!emailValid || sending}
						>
							Resend Magic Link
						</button>
						<span class="text-surface-300 text-xs">
							We’ll send a new link to the email above.
						</span>
					</div>
				</form>
			</div>
		{:else}
			<div class="bg-secondary-500 text-surface-50 flex max-w-xl flex-col gap-3 p-8">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Signing In</p>
				<p class="m-0 text-3xl font-black uppercase italic">{message}</p>
			</div>
		{/if}
	</section>
</div>
