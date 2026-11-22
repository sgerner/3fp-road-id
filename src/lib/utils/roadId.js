import { isSafeInternalPath } from '#lib/security/navigation.js';

export const ROAD_ID_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export const ALLERGY_OPTIONS = ['Latex', 'Penicillin', 'Sulfa', 'Iodine'];
export const MEDICATION_OPTIONS = ['Insulin', 'Blood Thinners', 'Albuterol', 'Aspirin'];
export const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * Normalize a user-supplied bracelet code or full /roadid/[code] scan URL
 * into a validated bracelet code. Returns '' if invalid.
 */
export function normalizeRoadIdCodeInput(rawValue) {
	if (typeof rawValue !== 'string') return '';
	let candidate = rawValue.trim();
	if (!candidate) return '';

	if (candidate.includes('/')) {
		try {
			const parsed =
				candidate.startsWith('http://') || candidate.startsWith('https://')
					? new URL(candidate)
					: new URL(
							candidate.startsWith('/') ? candidate : `https://${candidate}`,
							'https://3fp.org'
						);
			const segments = parsed.pathname.split('/').filter(Boolean);
			if (segments[0]?.toLowerCase() === 'roadid' && segments[1]) {
				candidate = decodeURIComponent(segments[1]).trim();
			} else if (segments.length === 1 && segments[0]) {
				candidate = decodeURIComponent(segments[0]).trim();
			}
		} catch {
			// Fall back to direct pattern test below.
		}
	}

	return ROAD_ID_CODE_PATTERN.test(candidate) ? candidate : '';
}

export function normalizeMedicationItem(medication) {
	const value = String(medication ?? '').trim();
	return value.toLowerCase() === 'asprin' ? 'Aspirin' : value;
}

export function splitCommaItems(rawValue, normalizer = (item) => String(item ?? '').trim()) {
	if (!rawValue || typeof rawValue !== 'string') return [];
	const items = [];
	for (const part of rawValue.split(',')) {
		const cleaned = normalizer(part);
		if (!cleaned) continue;
		if (items.some((existing) => existing.toLowerCase() === cleaned.toLowerCase())) continue;
		items.push(cleaned);
	}
	return items;
}

/**
 * Determine post-confirmation destination. When a bracelet code (`rid`) was
 * claimed during magic-link confirmation, open `/profile#road-id` unless
 * `returnTo` explicitly targets a separate workflow (such as group claims).
 */
export function resolveConfirmRedirectDestination({ rid = '', returnTo = '' } = {}) {
	const hasRid = Boolean(normalizeRoadIdCodeInput(rid));
	const safeReturn = isSafeInternalPath(returnTo) ? returnTo : '';

	if (hasRid) {
		if (
			!safeReturn ||
			safeReturn === '/' ||
			safeReturn === '/profile' ||
			safeReturn.startsWith('/profile#') ||
			safeReturn.startsWith('/roadid')
		) {
			return '/profile#road-id';
		}
		return safeReturn;
	}

	return safeReturn || '/';
}
