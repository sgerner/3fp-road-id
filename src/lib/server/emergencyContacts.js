const CONTACT_FIELDS = {
	contact_name: 200,
	contact_phone: 64,
	contact_relationship: 120
};

export function pickEmergencyContactFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const result = {};
	for (const [field, maxLength] of Object.entries(CONTACT_FIELDS)) {
		if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
		if (typeof value[field] !== 'string' || value[field].length > maxLength) return null;
		result[field] = value[field].trim();
	}
	return Object.keys(result).length ? result : null;
}
