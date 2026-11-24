import { isSafeInternalPath } from '#lib/security/navigation.js';

export const MEMBERSHIP_CONTACT_HANDOFF_TTL_MS = 30 * 60 * 1000;
const MEMBERSHIP_CONTACT_STORAGE_PREFIX = '3fp:membership_handoff_contact:';

/**
 * @typedef {{
 *   getItem: (key: string) => string | null;
 *   setItem: (key: string, value: string) => void;
 *   removeItem: (key: string) => void;
 * }} StorageLike
 */

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
 * @param {StorageLike | null | undefined} [storageOverride]
 * @returns {StorageLike | null}
 */
function resolveSessionStorage(storageOverride) {
	if (storageOverride !== undefined) return storageOverride || null;
	if (typeof window === 'undefined') return null;
	try {
		return window.sessionStorage || null;
	} catch {
		return null;
	}
}

/**
 * @param {unknown} slug
 * @returns {string}
 */
export function buildMembershipContactStorageKey(slug) {
	const cleanSlug = sanitizeParamText(slug, 120);
	return cleanSlug ? `${MEMBERSHIP_CONTACT_STORAGE_PREFIX}${cleanSlug}` : '';
}

/**
 * @param {unknown} slug
 * @param {{
 *   fullName?: unknown;
 *   full_name?: unknown;
 *   email?: unknown;
 *   phone?: unknown;
 * }} [contact]
 * @param {{
 *   storage?: StorageLike | null;
 *   now?: number;
 *   ttlMs?: number;
 * }} [options]
 * @returns {boolean}
 */
export function stashMembershipContactHandoff(slug, contact = {}, options = {}) {
	const key = buildMembershipContactStorageKey(slug);
	const storage = resolveSessionStorage(options.storage);
	if (!key || !storage) return false;

	const full_name = sanitizeParamText(contact?.fullName ?? contact?.full_name ?? '', 120);
	const email = sanitizeParamText(contact?.email ?? '', 254).toLowerCase();
	const phone = sanitizeParamText(contact?.phone ?? '', 40);

	try {
		if (!full_name && !email && !phone) {
			storage.removeItem(key);
			return false;
		}
		const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
		const ttlMs =
			Number.isFinite(options.ttlMs) && Number(options.ttlMs) > 0
				? Number(options.ttlMs)
				: MEMBERSHIP_CONTACT_HANDOFF_TTL_MS;
		storage.setItem(
			key,
			JSON.stringify({
				full_name,
				email,
				phone,
				expires_at: now + ttlMs
			})
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {unknown} slug
 * @param {{
 *   storage?: StorageLike | null;
 *   now?: number;
 *   consume?: boolean;
 * }} [options]
 * @returns {{ full_name: string; email: string; phone: string } | null}
 */
export function consumeMembershipContactHandoff(slug, options = {}) {
	const key = buildMembershipContactStorageKey(slug);
	const storage = resolveSessionStorage(options.storage);
	if (!key || !storage) return null;

	try {
		const raw = storage.getItem(key);
		if (!raw) return null;

		const parsed = JSON.parse(raw);
		const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
		const expiresAt = Number(parsed?.expires_at || 0);
		if (!parsed || typeof parsed !== 'object' || !Number.isFinite(expiresAt) || expiresAt <= now) {
			storage.removeItem(key);
			return null;
		}

		if (options.consume !== false) {
			storage.removeItem(key);
		}

		const full_name = sanitizeParamText(parsed.full_name, 120);
		const email = sanitizeParamText(parsed.email, 254).toLowerCase();
		const phone = sanitizeParamText(parsed.phone, 40);
		if (!full_name && !email && !phone) return null;

		return { full_name, email, phone };
	} catch {
		try {
			storage.removeItem(key);
		} catch {
			// Ignore storage cleanup errors.
		}
		return null;
	}
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

/**
 * Builds the magic-link / sign-in return URL for a club membership page.
 * Intentionally includes ONLY non-PII selection params (`tier`, `interval`, `amount`);
 * contact details (`name`, `email`, `phone`) must never be placed in URL query strings.
 *
 * @param {{
 *   slug?: unknown;
 *   tierId?: unknown;
 *   billingInterval?: unknown;
 *   customAmount?: unknown;
 * }} [options]
 * @returns {string}
 */
export function buildMembershipReturnPath({
	slug = '',
	tierId = '',
	billingInterval = '',
	customAmount = ''
} = {}) {
	const cleanSlug = sanitizeParamText(slug, 120);
	if (!cleanSlug) return '/';

	const basePath = `/groups/${encodeURIComponent(cleanSlug)}/membership`;
	if (!isSafeInternalPath(basePath)) return '/';

	const params = new URLSearchParams();
	const cleanTier = sanitizeParamText(tierId, 64);
	const cleanInterval = normalizeHandoffInterval(billingInterval);
	const cleanAmount = normalizeHandoffAmount(customAmount);

	if (cleanTier) params.set('tier', cleanTier);
	if (cleanInterval) params.set('interval', cleanInterval);
	if (cleanAmount) params.set('amount', cleanAmount);

	const query = params.toString();
	const candidate = query ? `${basePath}?${query}` : basePath;
	return isSafeInternalPath(candidate) ? candidate : basePath;
}

/**
 * Parses non-PII membership selection query parameters (`tier`, `interval`, `amount`).
 *
 * @param {unknown} input
 * @returns {{ tier: string; interval: '' | 'month' | 'year'; amount: string }}
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
			amount: ''
		};
	}

	return {
		tier: sanitizeParamText(params.get('tier') || '', 64),
		interval: normalizeHandoffInterval(params.get('interval') || ''),
		amount: normalizeHandoffAmount(params.get('amount') ?? params.get('custom_amount') ?? '')
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
