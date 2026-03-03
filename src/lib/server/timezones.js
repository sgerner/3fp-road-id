import tzLookup from 'tz-lookup';

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function isSupportedTimezone(timezone) {
	if (!timezone) return false;
	try {
		return Intl.supportedValuesOf('timeZone').includes(timezone);
	} catch {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: timezone });
			return true;
		} catch {
			return false;
		}
	}
}

export function normalizeTimezone(timezone, fallback = 'UTC') {
	const value = typeof timezone === 'string' ? timezone.trim() : '';
	return isSupportedTimezone(value) ? value : fallback;
}

export function resolveTimezoneFromCoordinates(latitude, longitude) {
	const lat = toFiniteNumber(latitude);
	const lng = toFiniteNumber(longitude);
	if (lat === null || lng === null) return null;
	try {
		return normalizeTimezone(tzLookup(lat, lng), null);
	} catch {
		return null;
	}
}
