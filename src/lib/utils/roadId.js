export const ROAD_ID_STRING_FIELDS = [
	'full_name',
	'phone',
	'blood_type',
	'allergies',
	'medication'
];

export const ROAD_ID_EMAIL_REGEX = /^\S+@\S+\.[^\s@]+$/;

/**
 * @param {Record<string, any> | null | undefined} profile
 * @param {{ id?: string | null } | null} [user]
 */
export function normalizeRoadIdProfile(profile, user = null) {
	if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
		return {
			user_id: user?.id,
			claimed: Boolean(user?.id),
			is_owner: Boolean(user?.id),
			full_name: '',
			phone: '',
			blood_type: '',
			allergies: '',
			medication: ''
		};
	}

	const normalized = { ...profile };
	for (const field of ROAD_ID_STRING_FIELDS) {
		normalized[field] = typeof profile[field] === 'string' ? profile[field] : '';
	}
	return normalized;
}

export function hasBloodTypeChanged(currentBloodType, nextBloodType) {
	const current = typeof currentBloodType === 'string' ? currentBloodType.trim() : '';
	const next = typeof nextBloodType === 'string' ? nextBloodType.trim() : '';
	return current !== next;
}

export function isValidRoadIdEmail(email) {
	if (typeof email !== 'string') return false;
	const trimmed = email.trim();
	if (!trimmed || trimmed.length > 254) return false;
	return ROAD_ID_EMAIL_REGEX.test(trimmed) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
