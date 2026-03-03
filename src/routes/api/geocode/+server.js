import { json } from '@sveltejs/kit';
import { searchGeocode } from '$lib/server/geocoding';

export async function GET({ url, fetch }) {
	const q = (url.searchParams.get('q') || '').trim();
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
