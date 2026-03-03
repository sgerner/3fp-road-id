import { json } from '@sveltejs/kit';
import { resolveTimezoneFromCoordinates } from '$lib/server/timezones';

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export async function GET({ url }) {
	const latitude = toFiniteNumber(url.searchParams.get('latitude'));
	const longitude = toFiniteNumber(url.searchParams.get('longitude'));

	if (latitude === null || longitude === null) {
		return json({ error: 'latitude and longitude are required.' }, { status: 400 });
	}

	const timezone = resolveTimezoneFromCoordinates(latitude, longitude);
	if (!timezone) {
		return json({ error: 'Unable to resolve timezone for these coordinates.' }, { status: 422 });
	}

	return json({ data: { timezone } });
}
