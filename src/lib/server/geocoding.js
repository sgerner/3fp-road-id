import { env } from '$env/dynamic/public';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export async function searchGeocode(query, { limit = 5, fetchImpl = fetch } = {}) {
	const trimmed = safeTrim(query);
	if (!trimmed) return [];

	const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
	nominatimUrl.searchParams.set('format', 'jsonv2');
	nominatimUrl.searchParams.set('limit', String(limit));
	nominatimUrl.searchParams.set('q', trimmed);

	const nominatimResponse = await fetchImpl(nominatimUrl.toString(), {
		headers: {
			accept: 'application/json',
			'user-agent': '3 Feet Please Ride Geocoder'
		}
	});

	if (nominatimResponse.ok) {
		const payload = await nominatimResponse.json().catch(() => []);
		const matches = (Array.isArray(payload) ? payload : [])
			.map((entry) => ({
				label: safeTrim(entry.display_name),
				latitude: toFiniteNumber(entry.lat),
				longitude: toFiniteNumber(entry.lon),
				source: 'nominatim'
			}))
			.filter((entry) => entry.label && entry.latitude !== null && entry.longitude !== null);
		if (matches.length) return matches;
	}

	const googleKey = safeTrim(env.PUBLIC_GOOGLE_MAPS_API_KEY);
	if (!googleKey) return [];

	const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
	googleUrl.searchParams.set('address', trimmed);
	googleUrl.searchParams.set('key', googleKey);

	const googleResponse = await fetchImpl(googleUrl.toString(), {
		headers: { accept: 'application/json' }
	});
	if (!googleResponse.ok) return [];

	const googlePayload = await googleResponse.json().catch(() => null);
	if (!googlePayload || !Array.isArray(googlePayload.results)) return [];
	if (!['OK', 'ZERO_RESULTS'].includes(googlePayload.status)) return [];

	return googlePayload.results
		.slice(0, limit)
		.map((entry) => ({
			label: safeTrim(entry.formatted_address),
			latitude: toFiniteNumber(entry.geometry?.location?.lat),
			longitude: toFiniteNumber(entry.geometry?.location?.lng),
			source: 'google'
		}))
		.filter((entry) => entry.label && entry.latitude !== null && entry.longitude !== null);
}
