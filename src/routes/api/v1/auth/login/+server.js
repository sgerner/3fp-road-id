import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';
import { PUBLIC_URL_BASE } from '$env/static/public';
import { TURNSTILE_SECRET_KEY } from '$env/static/private';

// Expect a payload like:
// {
//    code: "ABC123XY",
//    email: "user@example.com",
//    createProfile: true   // if creating a new profile; false for normal login
// }
const hasTurnstileSecret = Boolean(TURNSTILE_SECRET_KEY);
let missingSecretWarned = false;

export async function POST({ request }) {
	try {
		const { code, email, createProfile, returnTo, honeypot, turnstileToken } = await request.json();
		const requestUrl = request.url;
		const requestOrigin = new URL(requestUrl).origin;

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
			const connectingIp =
				request.headers.get('cf-connecting-ip') ||
				(request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim();
			if (connectingIp) {
				payload.append('remoteip', connectingIp);
			}
			const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				body: payload
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
		} else if (turnstileEnabled && !missingSecretWarned) {
			console.warn('TURNSTILE_SECRET_KEY is not configured; skipping verification.');
			missingSecretWarned = true;
		}

		// Build confirm URL with return_to so users land back where they started.
		const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/';
		const params = new URLSearchParams({ return_to: safeReturn });
		if (code) params.set('rid', code);
		const configuredBase = (PUBLIC_URL_BASE || '').trim();
		const baseUrl = configuredBase || requestOrigin;
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
			return json({ error: authError.message }, { status: 400 });
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
