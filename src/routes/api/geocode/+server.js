import { json } from '@sveltejs/kit';

export async function GET({ url, fetch }) {
	const q = (url.searchParams.get('q') || '').trim();
	if (!q) return json({ data: [] });

	const target = new URL('https://nominatim.openstreetmap.org/search');
	target.searchParams.set('format', 'jsonv2');
	target.searchParams.set('limit', '5');
	target.searchParams.set('q', q);

	const response = await fetch(target.toString(), {
		headers: {
			accept: 'application/json',
			'user-agent': '3 Feet Please Ride Builder'
		}
	});

	if (!response.ok) {
		return json({ error: 'Unable to geocode location right now.' }, { status: 502 });
	}

	const payload = await response.json().catch(() => []);
	return json({
		data: (Array.isArray(payload) ? payload : []).map((entry) => ({
			label: entry.display_name,
			latitude: Number(entry.lat),
			longitude: Number(entry.lon)
		}))
	});
}
