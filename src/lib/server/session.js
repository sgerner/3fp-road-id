import { Buffer } from 'node:buffer';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';

function readAccessToken(cookies) {
	const rawSession = cookies.get('sb_session');
	if (!rawSession) return null;

	try {
		const session = JSON.parse(rawSession);
		const token =
			session?.access_token ??
			session?.session?.access_token ??
			session?.accessToken ??
			session?.session?.accessToken;
		return typeof token === 'string' && token ? token : null;
	} catch {
		return null;
	}
}

function decodeAccessTokenPayload(token) {
	try {
		return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

/**
 * Use Supabase Auth as the authority for identity. Cookies supply only the
 * bearer credential, and callers receive it only after verification.
 */
export async function resolveVerifiedSession(cookies) {
	const unauthenticated = { accessToken: null, user: null, verified: false, tokenPayload: null };
	const accessToken = readAccessToken(cookies);
	if (!accessToken) return unauthenticated;

	try {
		const requestSupabase = createRequestSupabaseClient(accessToken);
		const { data, error } = await requestSupabase.auth.getUser(accessToken);
		if (error || !data?.user?.id) return unauthenticated;
		return {
			accessToken,
			user: data.user,
			verified: true,
			tokenPayload: decodeAccessTokenPayload(accessToken)
		};
	} catch {
		return unauthenticated;
	}
}
