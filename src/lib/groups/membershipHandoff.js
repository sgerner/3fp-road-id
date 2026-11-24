import { isSafeInternalPath } from '#lib/security/navigation.js';

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeParamText(value, maxLength = 120) {
	if (value === null || value === undefined) return '';
	let cleaned = '';
	for (const ch of String(value)) {
		const code = ch.charCodeAt(0);
		if (ch === '\\' || code < 0x20 || code === 0x7f) continue;
		cleaned += ch;
	}
	cleaned = cleaned.trim();
	return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * @param {unknown} value
 * @returns {'' | 'month' | 'year'}
 */
export function normalizeHandoffInterval(value) {
	const raw = sanitizeParamText(value, 16).toLowerCase();
	if (raw === 'year' || raw === 'annual' || raw === 'yearly') return 'year';
	if (raw === 'month' || raw === 'monthly') return 'month';
	return '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeHandoffAmount(value) {
	if (value === null || value === undefined) return '';
	const raw = sanitizeParamText(value, 24);
	if (!raw) return '';
	if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return '';
	const parsed = Number.parseFloat(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return '';
	return raw;
}

export function buildMembershipReturnPath({
	slug = '',
	tierId = '',
	billingInterval = '',
	customAmount = '',
	fullName = '',
	email = '',
	phone = ''
} = {}) {
	const cleanSlug = sanitizeParamText(slug, 120);
	if (!cleanSlug) return '/';

	const basePath = `/groups/${encodeURIComponent(cleanSlug)}/membership`;
	if (!isSafeInternalPath(basePath)) return '/';

	const params = new URLSearchParams();
	const cleanTier = sanitizeParamText(tierId, 64);
	const cleanInterval = normalizeHandoffInterval(billingInterval);
	const cleanAmount = normalizeHandoffAmount(customAmount);
	const cleanName = sanitizeParamText(fullName, 120);
	const cleanEmail = sanitizeParamText(email, 254).toLowerCase();
	const cleanPhone = sanitizeParamText(phone, 40);

	if (cleanTier) params.set('tier', cleanTier);
	if (cleanInterval) params.set('interval', cleanInterval);
	if (cleanAmount) params.set('amount', cleanAmount);
	if (cleanName) params.set('name', cleanName);
	if (cleanEmail) params.set('email', cleanEmail);
	if (cleanPhone) params.set('phone', cleanPhone);

	const query = params.toString();
	const candidate = query ? `${basePath}?${query}` : basePath;
	return isSafeInternalPath(candidate) ? candidate : basePath;
}

/**
 * @param {unknown} input
 */
export function parseMembershipHandoffParams(input) {
	/** @type {{ get: (key: string) => string | null } | null} */
	let params = null;
	if (input instanceof URLSearchParams) {
		params = input;
	} else if (typeof input === 'string') {
		const trimmed = input.trim();
		const queryIndex = trimmed.indexOf('?');
		const query = queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : trimmed;
		params = new URLSearchParams(query);
	} else if (
		input &&
		typeof input === 'object' &&
		'get' in input &&
		typeof input.get === 'function'
	) {
		params = /** @type {{ get: (key: string) => string | null }} */ (input);
	}

	if (!params) {
		return {
			tier: '',
			interval: '',
			amount: '',
			name: '',
			email: '',
			phone: ''
		};
	}

	return {
		tier: sanitizeParamText(params.get('tier') || '', 64),
		interval: normalizeHandoffInterval(params.get('interval') || ''),
		amount: normalizeHandoffAmount(params.get('amount') ?? params.get('custom_amount') ?? ''),
		name: sanitizeParamText(params.get('name') || '', 120),
		email: sanitizeParamText(params.get('email') || '', 254),
		phone: sanitizeParamText(params.get('phone') || '', 40)
	};
}

/**
 * @param {unknown} value
 * @returns {'' | 'program' | 'members'}
 */
export function normalizeMembershipManageViewParam(value) {
	const raw = sanitizeParamText(value, 32).toLowerCase();
	if (raw === 'program' || raw === 'setup' || raw === 'tiers' || raw === 'program-and-tiers') {
		return 'program';
	}
	if (raw === 'members' || raw === 'roster') {
		return 'members';
	}
	return '';
}

/**
 * @param {{ requestedView?: unknown; tiers?: Array<Record<string, any>> }} [options]
 * @returns {'program' | 'members'}
 */
export function resolveInitialMembershipManageView({ requestedView = '', tiers = [] } = {}) {
	const explicit = normalizeMembershipManageViewParam(requestedView);
	if (explicit) return explicit;
	const activeTiers = (Array.isArray(tiers) ? tiers : []).filter(
		(tier) => tier && tier.is_active !== false
	);
	return activeTiers.length === 0 ? 'program' : 'members';
}
