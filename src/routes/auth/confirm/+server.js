import { redirect } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { isSafeInternalPath } from '$lib/security/navigation.js';

export const GET = async ({ url, cookies }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const authCode = url.searchParams.get('code');
	const roadIdCode = url.searchParams.get('rid') || '';
	const returnTo = url.searchParams.get('return_to') || '';

	if (!tokenHash && !authCode) {
		throw redirect(303, '/auth/error');
	}

	// Verify the OTP and retrieve session details
	const authClient = createRequestSupabaseClient();
	const { data, error } = tokenHash
		? await authClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
		: await authClient.auth.exchangeCodeForSession(authCode);

	if (error) {
		throw redirect(303, '/auth/error');
	}

	// Store the session in a cookie
	const session = data?.session;
	if (!session?.access_token || !data?.user?.id) {
		throw redirect(303, '/auth/error');
	}
	if (session.access_token) {
		cookies.set('sb_session', JSON.stringify({ access_token: session.access_token }), {
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			path: '/',
			maxAge: Math.max(60, Math.min(24 * 60 * 60, Number(session.expires_in) || 60 * 60))
		});
	}

	if (roadIdCode) {
		if (!/^[A-Za-z0-9_-]{4,64}$/.test(roadIdCode)) {
			throw redirect(303, '/auth/error');
		}

		// Claim an unclaimed Road ID atomically. The user identity comes from
		// the verified auth response; QR codes are not browser-writable.
		const serviceSupabase = createServiceSupabaseClient();
		if (!serviceSupabase) throw redirect(303, '/auth/error');
		const { error: claimError } = await serviceSupabase
			.from('qr_codes')
			.update({ profile_id: data.user.id })
			.eq('code', roadIdCode)
			.is('profile_id', null);
		if (claimError) throw redirect(303, '/auth/error');
	}

	const destination = isSafeInternalPath(returnTo)
		? returnTo
		: roadIdCode
			? `/roadid/${encodeURIComponent(roadIdCode)}`
			: '/';
	throw redirect(303, destination);
};
