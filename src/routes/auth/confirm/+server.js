import { redirect } from '@sveltejs/kit';
import { claimBraceletForUser, isValidRoadIdCode } from '#lib/server/roadIdProfile';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { isSafeInternalPath } from '#lib/security/navigation.js';

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
		if (!isValidRoadIdCode(roadIdCode)) {
			throw redirect(303, '/auth/error');
		}

		const serviceSupabase = createServiceSupabaseClient();
		const userSupabase = createRequestSupabaseClient(session.access_token);
		if (!serviceSupabase) throw redirect(303, '/auth/error');

		const claimResult = await claimBraceletForUser({
			serviceSupabase,
			userSupabase,
			userId: data.user.id,
			code: roadIdCode
		});

		if (!claimResult.ok) {
			if (claimResult.reason === 'already_claimed' || claimResult.reason === 'not_found') {
				throw redirect(303, `/roadid/${encodeURIComponent(roadIdCode)}`);
			}
			throw redirect(303, '/auth/error');
		}

		const safetyDestination = `/profile?claimed=${encodeURIComponent(roadIdCode)}#safety`;
		const isLegacyScanReturn =
			!isSafeInternalPath(returnTo) ||
			returnTo === '/' ||
			returnTo.startsWith(`/roadid/${encodeURIComponent(roadIdCode)}`) ||
			returnTo.startsWith(`/roadid/${roadIdCode}`);
		throw redirect(303, isLegacyScanReturn ? safetyDestination : returnTo);
	}

	const destination = isSafeInternalPath(returnTo) ? returnTo : '/';
	throw redirect(303, destination);
};
