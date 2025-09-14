<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';

  let error = $state('');
  let message = $state('Completing login…');
  let sending = $state(false);
  let resendEmail = $state('');
  let resendSuccess = $state('');
  let resendError = $state('');
  let ridParam = $state('');
  let returnToParam = $state('');
  let emailValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(resendEmail));

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
        const { data, error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
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
      if (returnTo && returnTo.startsWith('/')) {
        dest = returnTo;
        try {
          const rtUrl = new URL(returnTo, window.location.origin);
          autoClaimSlug = rtUrl.searchParams.get('auto_claim_group') || '';
        } catch {}
      } else if (rid) {
        dest = `/roadid/${encodeURIComponent(rid)}`;
      }

      if (autoClaimSlug) {
        try {
          const claimRes = await fetch(`/api/groups/${encodeURIComponent(autoClaimSlug)}/claim`, { method: 'POST' });
          if (claimRes.ok) {
            dest = `/groups/${encodeURIComponent(autoClaimSlug)}/edit`;
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
    sending = true;
    try {
      const body = {
        email: resendEmail,
        createProfile: true,
        returnTo: returnToParam && returnToParam.startsWith('/') ? returnToParam : ridParam ? `/roadid/${ridParam}` : '/'
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
    } catch (err) {
      resendError = err.message || 'Unable to resend link.';
    } finally {
      sending = false;
    }
  }
</script>

<div class="mx-auto w-full max-w-md space-y-4 p-4">
  <h1 class="text-xl font-semibold text-center">Auth Confirmation</h1>
  {#if error}
    <div class="rounded-md border border-red-600/50 bg-red-900/20 p-3 text-red-200">
      <p class="mb-1">{error}</p>
      <p class="text-sm text-red-300">Your link may be invalid or expired. You can request a new link below.</p>
    </div>
    <form class="rounded-md border border-surface-700 bg-surface-900 p-3" onsubmit={resend}>
      <label for="resend-email" class="mb-1 block text-xs text-surface-300">Email</label>
      <input id="resend-email" type="email" bind:value={resendEmail} placeholder="you@example.com" class="input w-full" required />
      {#if resendError}
        <div class="mt-2 text-xs text-red-400">{resendError}</div>
      {/if}
      {#if resendSuccess}
        <div class="mt-2 text-xs text-green-400">{resendSuccess}</div>
      {/if}
      <button type="submit" class="btn preset-filled-primary-500 mt-3 w-full {sending ? 'animate-pulse' : ''} {(!emailValid || sending) ? 'opacity-50 cursor-not-allowed' : ''}" disabled={!emailValid || sending}>Resend Magic Link</button>
      <div class="mt-2 text-center text-[11px] text-surface-400">We’ll send a new link to the email above.</div>
    </form>
  {:else}
    <p class="text-surface-200 text-center">{message}</p>
  {/if}
</div>
