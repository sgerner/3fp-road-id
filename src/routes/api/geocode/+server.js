import { json } from '@sveltejs/kit';
import { searchGeocode } from '$lib/server/geocoding';
import { enforceRateLimit } from '$lib/server/security';

export async function GET(event) {
	const { url, fetch } = event;
	const limited = enforceRateLimit(event, {
		name: 'geocode',
		limit: 60,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;
	const q = (url.searchParams.get('q') || '').trim().slice(0, 240);
	if (!q) return json({ data: [] });
	const data = await searchGeocode(q, { limit: 5, fetchImpl: fetch }).catch(() => null);
	if (!data) {
		return json({ error: 'Unable to geocode location right now.' }, { status: 502 });
	}
	return json({
		data: data.map((entry) => ({
			label: entry.label,
			latitude: entry.latitude,
			longitude: entry.longitude
		}))
	});
}
