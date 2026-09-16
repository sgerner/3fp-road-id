import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/services/email';

/**
 * Server-only email client. The public email route requires this capability
 * for jobs and server-side workflows that do not carry an end-user session.
 */
export function sendServerEmail(requestBody, { fetch } = {}) {
	const internalSecret = env.EMAIL_API_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
	if (!internalSecret) {
		throw new Error('Server email capability is not configured.');
	}
	return sendEmail(requestBody, { fetch, internalSecret });
}
