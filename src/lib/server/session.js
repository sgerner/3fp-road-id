import { Buffer } from 'node:buffer';

function parseSessionCookie(raw) {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch (err) {
		console.warn('Failed to parse session cookie', err);
		return null;
	}
}

function base64UrlDecode(value) {
	if (!value) return null;
	try {
		const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
		const padding = normalized.length % 4;
		const padded = normalized + '='.repeat(padding ? 4 - padding : 0);
		return Buffer.from(padded, 'base64').toString('utf8');
	} catch (err) {
		console.warn('Failed to decode base64 token payload', err);
		return null;
	}
}

function decodeAccessToken(token) {
	if (!token) return null;
	const parts = token.split('.');
	if (parts.length < 2) return null;
	const payload = base64UrlDecode(parts[1]);
	if (!payload) return null;
	try {
		return JSON.parse(payload);
	} catch (err) {
		console.warn('Failed to parse access token payload', err);
		return null;
	}
}

function extractSessionUser(parsedSession, tokenPayload) {
	const candidates = [
		parsedSession?.user,
		parsedSession?.session?.user,
		parsedSession?.currentSession?.user
	];
	for (const candidate of candidates) {
		if (candidate && typeof candidate === 'object') {
			const id = candidate.id ?? candidate.user_id ?? candidate.userId ?? candidate.sub ?? null;
			if (id) {
				return {
					...candidate,
					id,
					email:
						candidate.email ??
						candidate.user_email ??
						candidate.userEmail ??
						tokenPayload?.email ??
						tokenPayload?.user_email ??
						tokenPayload?.userEmail ??
						tokenPayload?.user_metadata?.email ??
						tokenPayload?.app_metadata?.email ??
						null
				};
			}
		}
	}
	if (tokenPayload && typeof tokenPayload === 'object') {
		const id = tokenPayload.sub ?? tokenPayload.user_id ?? tokenPayload.userId ?? null;
		if (id) {
			return {
				id,
				email:
					tokenPayload.email ??
					tokenPayload.user_email ??
					tokenPayload.userEmail ??
					tokenPayload?.user_metadata?.email ??
					tokenPayload?.app_metadata?.email ??
					null
			};
		}
	}
	return null;
}

export function resolveSession(cookies) {
	const rawSession = cookies.get('sb_session');
	if (!rawSession) {
		return { session: null, accessToken: null, user: null };
	}
	const parsedSession = parseSessionCookie(rawSession);
	const accessToken =
		parsedSession?.access_token ??
		parsedSession?.session?.access_token ??
		parsedSession?.accessToken ??
		parsedSession?.session?.accessToken ??
		null;
	const tokenPayload = decodeAccessToken(accessToken);
	const user = extractSessionUser(parsedSession, tokenPayload);
	return { session: parsedSession, accessToken, user };
}

export function getAccessToken(cookies) {
	const { accessToken } = resolveSession(cookies);
	return accessToken;
}

export function getSessionUser(cookies) {
	const { user } = resolveSession(cookies);
	return user;
}
