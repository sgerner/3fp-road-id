import { decryptSocialToken, encryptSocialToken } from '$lib/server/social/crypto';
import {
	computeTokenExpiryFromSeconds,
	exchangeForLongLivedMetaToken
} from '$lib/server/social/meta/oauth';

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function parseDate(value) {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldAttemptRefresh(expiresAtDate) {
	if (!expiresAtDate) return false;
	return expiresAtDate.getTime() <= Date.now() + REFRESH_BUFFER_MS;
}

export async function resolveMetaAccountAccessToken(supabase, account) {
	const encrypted = cleanText(account?.access_token_encrypted, 8000);
	if (!encrypted) throw new Error('Connected account token is missing.');
	const currentToken = decryptSocialToken(encrypted);
	const expiresAt = parseDate(account?.token_expires_at);

	if (!shouldAttemptRefresh(expiresAt)) {
		return {
			accessToken: currentToken,
			tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
			refreshed: false
		};
	}

	try {
		const refreshed = await exchangeForLongLivedMetaToken(currentToken);
		const nextToken = cleanText(refreshed?.accessToken, 5000) || currentToken;
		const nextTokenExpiresAt = computeTokenExpiryFromSeconds(refreshed?.expiresIn);
		if (nextToken !== currentToken || nextTokenExpiresAt) {
			await supabase
				.from('group_social_accounts')
				.update({
					access_token_encrypted: encryptSocialToken(nextToken),
					token_expires_at: nextTokenExpiresAt,
					status: 'active',
					last_error: null,
					updated_at: new Date().toISOString()
				})
				.eq('id', account.id);
		}
		return {
			accessToken: nextToken,
			tokenExpiresAt: nextTokenExpiresAt || (expiresAt ? expiresAt.toISOString() : null),
			refreshed: true
		};
	} catch (error) {
		if (expiresAt && expiresAt.getTime() <= Date.now()) {
			await supabase
				.from('group_social_accounts')
				.update({
					status: 'expired',
					last_error:
						cleanText(error?.message, 1000) || 'Token expired and automatic refresh failed.',
					updated_at: new Date().toISOString()
				})
				.eq('id', account.id);
			throw new Error('Connected account token expired. Reconnect is required.');
		}
		return {
			accessToken: currentToken,
			tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
			refreshed: false
		};
	}
}
