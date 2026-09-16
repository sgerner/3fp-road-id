import { json } from '@sveltejs/kit';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

const MAX_ACCESS_TOKEN_LENGTH = 8 * 1024;
const MAX_SESSION_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_SESSION_AGE_SECONDS = 60 * 60;

function extractAccessToken(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
	const token =
		typeof value.access_token === 'string'
			? value.access_token
			: typeof value.session?.access_token === 'string'
				? value.session.access_token
				: '';
	return token.trim().slice(0, MAX_ACCESS_TOKEN_LENGTH);
}

function tokenMaxAge(accessToken) {
	try {
		const payload = accessToken.split('.')[1];
		if (!payload) return DEFAULT_SESSION_AGE_SECONDS;
		const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
		const remaining = Number(parsed?.exp) - Math.floor(Date.now() / 1000);
		if (!Number.isFinite(remaining)) return DEFAULT_SESSION_AGE_SECONDS;
		return Math.max(60, Math.min(MAX_SESSION_AGE_SECONDS, Math.floor(remaining)));
	} catch {
		return DEFAULT_SESSION_AGE_SECONDS;
	}
}

function isSecureRequest(event) {
	return event.url?.protocol === 'https:';
}

function setAccessTokenCookie(event, accessToken) {
	event.cookies.set('sb_session', JSON.stringify({ access_token: accessToken }), {
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecureRequest(event),
		path: '/',
		maxAge: tokenMaxAge(accessToken)
	});
}

export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'auth-session-sync',
		limit: 30,
		windowMs: 60 * 1000
	});
	if (limited) return limited;

	const parsedBody = await readJsonBody(event.request, { maxBytes: 12 * 1024 });
	if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
	const accessToken = extractAccessToken(parsedBody.value);
	if (!accessToken) return json({ error: 'Authentication session is required.' }, { status: 401 });

	try {
		const supabase = createRequestSupabaseClient(accessToken);
		const { data, error } = await supabase.auth.getUser(accessToken);
		if (error || !data?.user?.id) {
			return json({ error: 'Authentication session is invalid or expired.' }, { status: 401 });
		}
		setAccessTokenCookie(event, accessToken);
		return json({ ok: true });
	} catch (error) {
		console.error('Unable to sync authenticated session:', error);
		return json({ error: 'Unable to establish an authenticated session.' }, { status: 503 });
	}
}

export async function DELETE(event) {
	event.cookies.delete('sb_session', { path: '/' });
	return json({ ok: true });
}
