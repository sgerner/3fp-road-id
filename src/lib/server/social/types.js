export const SOCIAL_PLATFORMS = ['facebook', 'instagram'];
export const SOCIAL_ACCOUNT_STATUSES = ['active', 'expired', 'revoked', 'error'];
export const SOCIAL_POST_STATUSES = [
	'draft',
	'scheduled',
	'queued',
	'publishing',
	'published',
	'failed',
	'cancelled'
];

export const SOCIAL_REPLY_STATUSES = ['draft', 'sending', 'sent', 'failed'];
export const SOCIAL_SCHEDULING_INTERVAL_MINUTES = 15;
export const SOCIAL_MAX_PUBLISH_ATTEMPTS = 3;

const PLATFORM_SET = new Set(SOCIAL_PLATFORMS);
const POST_STATUS_SET = new Set(SOCIAL_POST_STATUSES);

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function normalizePlatform(value) {
	const cleaned = cleanText(value).toLowerCase();
	return PLATFORM_SET.has(cleaned) ? cleaned : null;
}

export function normalizePlatforms(value) {
	if (!Array.isArray(value)) return [];
	const seen = new Set();
	const normalized = [];
	for (const entry of value) {
		const platform = normalizePlatform(entry);
		if (!platform || seen.has(platform)) continue;
		seen.add(platform);
		normalized.push(platform);
	}
	return normalized;
}

export function normalizePostStatus(value) {
	const cleaned = cleanText(value).toLowerCase();
	return POST_STATUS_SET.has(cleaned) ? cleaned : null;
}

export function safeCaption(value, maxLength = 4000) {
	return cleanText(value).slice(0, maxLength);
}

export function safePrompt(value, maxLength = 3000) {
	return cleanText(value).slice(0, maxLength);
}

export function safeTitle(value, maxLength = 200) {
	const cleaned = cleanText(value).slice(0, maxLength);
	return cleaned || null;
}

export function safeErrorMessage(value, maxLength = 1000) {
	const cleaned = cleanText(value).slice(0, maxLength);
	return cleaned || null;
}
