import { getActivityClient } from '$lib/server/activities';

const LOCATION_HEADERS = {
	city: ['cf-ipcity', 'x-vercel-ip-city', 'x-azure-clientip-city'],
	region: ['cf-region-code', 'x-vercel-ip-country-region', 'x-azure-clientip-region'],
	country: ['cf-ipcountry', 'x-vercel-ip-country', 'x-azure-clientip-country']
};

function readHeader(headers, names) {
	for (const name of names) {
		const value = headers.get(name);
		if (!value) continue;
		try {
			return decodeURIComponent(value).trim();
		} catch {
			return value.trim();
		}
	}
	return '';
}

function compact(value) {
	return (value || '').trim().toLocaleLowerCase();
}

function finiteCoordinate(value) {
	if (value === null || value === undefined || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function distanceMiles(from, to) {
	if (
		from.latitude === null ||
		from.longitude === null ||
		to.latitude === null ||
		to.longitude === null
	) {
		return null;
	}
	const radians = (degrees) => (degrees * Math.PI) / 180;
	const latDistance = radians(to.latitude - from.latitude);
	const longDistance = radians(to.longitude - from.longitude);
	const a =
		Math.sin(latDistance / 2) ** 2 +
		Math.cos(radians(from.latitude)) *
			Math.cos(radians(to.latitude)) *
			Math.sin(longDistance / 2) ** 2;
	return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function includesLocation(value, needle) {
	return Boolean(needle && compact(value).includes(compact(needle)));
}

function scoreLocation(item, location, fields) {
	const distance = distanceMiles(location, {
		latitude: finiteCoordinate(fields.latitude(item)),
		longitude: finiteCoordinate(fields.longitude(item))
	});
	if (distance !== null) return distance <= 250 ? 30 - distance / 10 : 0;

	let score = 0;
	if (includesLocation(fields.city(item), location.city)) score += 8;
	if (includesLocation(fields.region(item), location.region)) score += 3;
	if (compact(fields.country(item)) === compact(location.country)) score += 1;
	return score;
}

function sortByLocation(items, location, fields) {
	return items
		.map((item) => ({ item, score: scoreLocation(item, location, fields) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)
		.map(({ item }) => item);
}

function locationLabel(location) {
	return [location.city, location.region].filter(Boolean).join(', ') || location.country || '';
}

function profileLocation(metadata) {
	const context = metadata?.recommendation_context;
	if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
	const saved = context.home_location;
	const label = String(saved?.label || context.location || '').trim();
	if (!label) return null;
	const [city = '', region = ''] = label.split(',').map((part) => part.trim());
	return {
		city,
		region,
		country: '',
		label,
		latitude: finiteCoordinate(saved?.latitude),
		longitude: finiteCoordinate(saved?.longitude)
	};
}

export const load = async ({ cookies, fetch, request, setHeaders, url }) => {
	const headers = request.headers;
	const networkLocation = {
		city: readHeader(headers, LOCATION_HEADERS.city),
		region: readHeader(headers, LOCATION_HEADERS.region),
		country: readHeader(headers, LOCATION_HEADERS.country),
		latitude: null,
		longitude: null
	};
	const { user, supabase } = getActivityClient(cookies);
	const profileResult = user?.id
		? await supabase.from('profiles').select('metadata').eq('user_id', user.id).maybeSingle()
		: { data: null };
	const savedLocation = profileLocation(profileResult.data?.metadata);
	const location = savedLocation || networkLocation;
	const locationSource = savedLocation
		? 'profile'
		: locationLabel(networkLocation)
			? 'approximate'
			: null;

	// This response varies by coarse request-region headers. Do not cache a visitor's local feed.
	setHeaders({
		'cache-control': 'private, no-store',
		link: [
			`<${url.origin}/.well-known/api-catalog>; rel="api-catalog"`,
			`<${url.origin}/api>; rel="service-doc"`,
			`<${url.origin}/api/openapi.json>; rel="describedby"; type="application/vnd.oai.openapi+json"`,
			`<${url.origin}/api/health>; rel="status"`
		].join(', ')
	});

	const groupColumns = [
		'id',
		'slug',
		'name',
		'tagline',
		'city',
		'state_region',
		'country',
		'logo_url',
		'cover_photo_url',
		'latitude',
		'longitude'
	];
	const [groupsResponse, ridesResponse] = await Promise.all([
		fetch(`/api/v1/groups?select=${groupColumns.join(',')}&limit=200`),
		fetch('/api/rides')
	]);

	const groupsPayload = groupsResponse.ok ? await groupsResponse.json() : { data: [] };
	const ridesPayload = ridesResponse.ok ? await ridesResponse.json() : { data: [] };
	const groups = (Array.isArray(groupsPayload?.data) ? groupsPayload.data : []).filter(
		(group) => group.logo_url || group.cover_photo_url
	);
	const rides = (Array.isArray(ridesPayload?.data) ? ridesPayload.data : []).filter((ride) =>
		(ride.imageUrls ?? []).some(Boolean)
	);

	const localGroups = sortByLocation(groups, location, {
		city: (group) => group.city,
		region: (group) => group.state_region,
		country: (group) => group.country,
		latitude: (group) => group.latitude,
		longitude: (group) => group.longitude
	}).slice(0, 3);
	const nearbyRides = sortByLocation(rides, location, {
		city: (ride) =>
			`${ride.startLocationName || ''} ${ride.startLocationAddress || ''} ${ride.group?.city || ''}`,
		region: (ride) => `${ride.startLocationAddress || ''} ${ride.group?.state_region || ''}`,
		country: () => '',
		latitude: (ride) => ride.startLatitude,
		longitude: (ride) => ride.startLongitude
	}).slice(0, 2);
	const localRides = nearbyRides.length ? nearbyRides : rides.slice(0, 2);
	const rideSource = nearbyRides.length ? 'local' : localRides.length ? 'featured' : null;
	const featuredGroups = groups.filter((group) => group.cover_photo_url).slice(0, 3);

	return {
		area: savedLocation?.label || locationLabel(location),
		locationSource,
		featuredGroups,
		localGroups,
		localRides,
		rideSource,
		siteOrigin: url.origin
	};
};
