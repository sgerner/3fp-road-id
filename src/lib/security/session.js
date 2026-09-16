import { browser } from '$app/environment';

/**
 * Keep the server's authenticated view of the session in sync without
 * exposing the bearer token through document.cookie. The Supabase browser
 * client remains responsible for refresh-token storage and refreshes.
 */
export async function syncServerSession(session, fetchImpl = globalThis.fetch) {
	if (!browser || typeof fetchImpl !== 'function') return false;

	const accessToken = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
	const options = accessToken
		? {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ access_token: accessToken })
			}
		: {
				method: 'DELETE',
				credentials: 'same-origin'
			};

	try {
		const response = await fetchImpl('/api/auth/session', options);
		return response.ok;
	} catch {
		return false;
	}
}
