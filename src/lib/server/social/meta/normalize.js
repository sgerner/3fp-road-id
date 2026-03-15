import { normalizePlatform } from '$lib/server/social/types';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function toIso(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeMetaScopes(value) {
	if (Array.isArray(value)) {
		return value.map((entry) => cleanText(entry, 120)).filter(Boolean);
	}
	const cleaned = cleanText(value, 4000);
	if (!cleaned) return [];
	return cleaned
		.split(/[\s,]+/)
		.map((entry) => cleanText(entry, 120))
		.filter(Boolean);
}

export function normalizeMetaError(error, fallback = 'Meta request failed.') {
	if (!error) return fallback;
	if (typeof error === 'string') return cleanText(error, 1000) || fallback;
	if (typeof error?.message === 'string' && error.message) return cleanText(error.message, 1000);
	if (typeof error?.error_message === 'string' && error.error_message) {
		return cleanText(error.error_message, 1000);
	}
	if (typeof error?.error_description === 'string' && error.error_description) {
		return cleanText(error.error_description, 1000);
	}
	if (typeof error?.error_reason === 'string' && error.error_reason) {
		return cleanText(error.error_reason, 1000);
	}
	if (typeof error?.error?.message === 'string' && error.error.message) {
		return cleanText(error.error.message, 1000);
	}
	return fallback;
}

export function normalizeConnectedAccountSummary(raw, platform) {
	const normalizedPlatform = normalizePlatform(platform) || 'facebook';
	const accountName =
		cleanText(raw?.account_name || raw?.name || raw?.page_name || raw?.username, 240) ||
		'Connected account';

	return {
		platform: normalizedPlatform,
		meta_user_id: cleanText(raw?.meta_user_id || raw?.user_id || raw?.id, 120) || null,
		meta_page_id: cleanText(raw?.meta_page_id || raw?.page_id, 120) || null,
		meta_instagram_account_id:
			cleanText(raw?.meta_instagram_account_id || raw?.instagram_account_id || raw?.ig_id, 120) ||
			null,
		account_name: accountName,
		username: cleanText(raw?.username || raw?.ig_username, 120) || null,
		token_expires_at: toIso(raw?.token_expires_at || raw?.expires_at),
		scopes: normalizeMetaScopes(raw?.scopes),
		metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}
	};
}
