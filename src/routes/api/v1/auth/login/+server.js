import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { enforceRateLimit, isSafeInternalPath, readJsonBody } from '$lib/server/security';
import { isTurnstileEnabled } from '$lib/server/turnstile';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { createOwnerInviteState } from '$lib/server/groupOwnerInvites';
import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import { getConfiguredPublicOrigin } from '$lib/server/publicOrigin';

// Expect a payload like:
// {
//    code: "ABC123XY",
//    email: "user@example.com",
//    createProfile: true   // if creating a new profile; false for normal login
// }
const hasTurnstileSecret = Boolean(TURNSTILE_SECRET_KEY);

export async function POST(event) {
	const { request } = event;
	const limited = enforceRateLimit(event, {
		name: 'auth-login',
		limit: 10,
		windowMs: 15 * 60 * 1000
	});
	if (limited) return limited;

	try {
		const parsedBody = await readJsonBody(request, { maxBytes: 16 * 1024 });
		if (!parsedBody.ok) {
			return json({ error: parsedBody.error }, { status: parsedBody.status });
		}
		const body = parsedBody.value;
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return json({ error: 'Invalid request body.' }, { status: 400 });
		}

		const code = typeof body.code === 'string' ? body.code.trim().slice(0, 64) : '';
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const createProfile =
			body.createProfile === true ||
			(typeof body.createProfile === 'string' &&
				body.createProfile.trim().toLowerCase() === 'true');
		const returnTo = typeof body.returnTo === 'string' ? body.returnTo : '';
		const honeypot = body.honeypot;
		const turnstileToken = body.turnstileToken;
		if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return json({ error: 'Enter a valid email address.' }, { status: 400 });
		}
		const requestOrigin = getConfiguredPublicOrigin();

		if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
			return json({ error: 'Invalid submission.' }, { status: 400 });
		}

		const turnstileEnabled = isTurnstileEnabled();

		if (turnstileEnabled && hasTurnstileSecret) {
			if (!turnstileToken || typeof turnstileToken !== 'string') {
				return json({ error: 'Verification failed. Please try again.' }, { status: 400 });
			}
			const payload = new URLSearchParams({
				secret: TURNSTILE_SECRET_KEY,
				response: turnstileToken
			});
			const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				redirect: 'error',
				body: payload,
				signal: AbortSignal.timeout(5000)
			});
			if (!verify.ok) {
				console.error('Turnstile verification failed to respond:', verify.status);
				return json({ error: 'Verification failed. Please try again.' }, { status: 400 });
			}
			const verification = await verify.json().catch(() => ({ success: false }));
			if (!verification?.success) {
				console.warn('Turnstile verification failure', verification);
				return json({ error: 'Verification failed. Please try again.' }, { status: 400 });
			}
		} else if (turnstileEnabled && !hasTurnstileSecret) {
			console.error('TURNSTILE_SECRET_KEY is not configured while Turnstile is enabled.');
			if (!dev) {
				return json({ error: 'Verification is temporarily unavailable.' }, { status: 503 });
			}
		}

		// Build confirm URL with return_to so users land back where they started.
		let safeReturn = isSafeInternalPath(returnTo) ? returnTo : '/';
		let ownerInviteRequested = false;
		let ownerInviteGroup = null;
		let ownerInviteManager = null;
		if (safeReturn !== '/') {
			try {
				const returnUrl = new URL(safeReturn, requestOrigin);
				const ownerSlug = returnUrl.searchParams.get('auto_add_owner')?.trim() || '';
				// Never allow a caller to carry a capability into a newly issued link.
				returnUrl.searchParams.delete('owner_invite');
				safeReturn = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
				if (ownerSlug) {
					ownerInviteRequested = true;
					const manager = await requireGroupSiteManager({
						cookies: event.cookies,
						groupSlug: ownerSlug
					});
					if (!manager.ok) {
						return json({ error: manager.error }, { status: manager.status });
					}
					ownerInviteManager = manager;
					ownerInviteGroup = manager.group;
				}
			} catch {
				return json({ error: 'Invalid return path.' }, { status: 400 });
			}
		}
		if (ownerInviteRequested) {
			try {
				const ownerInviteToken = createOwnerInviteState({
					groupId: ownerInviteGroup.id,
					groupSlug: ownerInviteGroup.slug,
					invitedEmail: email,
					inviterUserId: ownerInviteManager.userId
				});
				const returnUrl = new URL(safeReturn, requestOrigin);
				returnUrl.searchParams.set('owner_invite', ownerInviteToken);
				safeReturn = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
			} catch (inviteError) {
				console.error('Unable to create owner invite capability:', inviteError);
				return json({ error: 'Owner invitations are temporarily unavailable.' }, { status: 503 });
			}
		}
		const params = new URLSearchParams({ return_to: safeReturn });
		if (code) params.set('rid', code);
		const baseUrl = requestOrigin;
		let redirectUrl;
		try {
			const confirmUrl = new URL('/auth/confirm', baseUrl);
			confirmUrl.search = params.toString();
			redirectUrl = confirmUrl.toString();
		} catch (buildErr) {
			console.error('Failed to construct auth redirect URL:', buildErr);
			return json({ error: 'Auth redirect URL is misconfigured.' }, { status: 500 });
		}

		// Call signInWithOtp (Magic Link) with shouldCreateUser toggled.
		const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
			email,
			options: {
				shouldCreateUser: createProfile,
				emailRedirectTo: redirectUrl
			}
		});

		if (authError) {
			console.warn('Magic-link request rejected by auth provider', authError);
			return json({ error: 'Unable to send login link. Please try again.' }, { status: 400 });
		}

		// If we are creating a new profile, insert it into the profiles table
		// and update the qr_codes table to link the code to the new profile.
		/*if (createProfile) {
			const { data: profileData, error: profileError } = await supabase
				.from('profiles')
				.insert([{ full_name, user_id: authData.user.uid }])
				.select()
				.single();

			if (profileError) {
				return json({ error: profileError.message }, { status: 400 });
			}

			// Update the qr_codes record to associate the new profile.
			const { error: qrError } = await supabase
				.from('qr_codes')
				.update({ profile_id: profileData.user_id })
				.eq('code', code);

			if (qrError) {
				return json({ error: qrError.message }, { status: 400 });
			}
		}*/

		// Return a message. The magic link email will be sent by Supabase.
		return json({ message: 'Magic link sent. Please check your email.' });
	} catch (error) {
		console.error('Unexpected error in auth login endpoint:', error);
		return json({ error: 'Unexpected error occurred' }, { status: 500 });
	}
}
