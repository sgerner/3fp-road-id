import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { fetchNearbyGroups, fetchNearbyRides, formatNearbyRideRow } from '#lib/server/proximity';
import { buildGroupsDirectoryHref, resolveVisitorLocation } from '#lib/server/visitorLocation';

const GROUP_COLUMNS = [
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
].join(',');

const FEATURED_RIDE_SELECT = `
	id,
	title,
	slug,
	summary,
	description,
	timezone,
	status,
	host_user_id,
	host_group_id,
	start_location_name,
	start_location_address,
	start_latitude,
	start_longitude,
	next_occurrence_start,
	next_occurrence_end,
	ride_details(image_urls),
	group:groups(id,slug,name,city,state_region,country)
`;

export const load = async (event) => {
	const { locals, setHeaders, url } = event;
	const visitorLocation =
		locals?.visitorLocation !== undefined
			? locals.visitorLocation
			: await resolveVisitorLocation(event);

	// This response varies by coarse request-region headers or profile preferences.
	// Do not cache a visitor's local feed.
	setHeaders({
		'cache-control': 'private, no-store',
		link: [
			`<${url.origin}/.well-known/api-catalog>; rel="api-catalog"`,
			`<${url.origin}/api>; rel="service-doc"`,
			`<${url.origin}/api/openapi.json>; rel="describedby"; type="application/vnd.oai.openapi+json"`,
			`<${url.origin}/api/health>; rel="status"`
		].join(', ')
	});

	const supabase = createRequestSupabaseClient(null);
	const nowIso = new Date().toISOString();
	const hasLocalScope = Boolean(visitorLocation?.hasLocalScope);

	const [nearbyGroupsRes, featuredGroupsRes, nearbyRidesRes, featuredRidesRes] = await Promise.all([
		hasLocalScope
			? fetchNearbyGroups(supabase, visitorLocation, { maxMiles: 250, limit: 3 })
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('groups')
			.select(GROUP_COLUMNS)
			.eq('is_published', true)
			.not('cover_photo_url', 'is', null)
			.order('name')
			.limit(3),
		hasLocalScope
			? fetchNearbyRides(supabase, visitorLocation, { maxMiles: 250, limit: 2 })
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('activity_events')
			.select(FEATURED_RIDE_SELECT)
			.eq('activity_type', 'ride')
			.eq('status', 'published')
			.gte('next_occurrence_start', nowIso)
			.order('next_occurrence_start', { ascending: true })
			.limit(2)
	]);

	const localGroups = Array.isArray(nearbyGroupsRes.data) ? nearbyGroupsRes.data : [];
	const featuredGroups = Array.isArray(featuredGroupsRes.data) ? featuredGroupsRes.data : [];
	const nearbyRides = Array.isArray(nearbyRidesRes.data) ? nearbyRidesRes.data : [];
	const fallbackRides = (Array.isArray(featuredRidesRes.data) ? featuredRidesRes.data : [])
		.map(formatNearbyRideRow)
		.filter(Boolean);

	const localRides = nearbyRides.length ? nearbyRides : fallbackRides;
	const rideSource = nearbyRides.length ? 'local' : localRides.length ? 'featured' : null;
	const locationSource = hasLocalScope ? visitorLocation.source : null;
	const area = locationSource ? visitorLocation.label || '' : '';
	const groupsHref = buildGroupsDirectoryHref(visitorLocation);

	return {
		area,
		locationSource,
		groupsHref,
		featuredGroups,
		localGroups,
		localRides,
		rideSource,
		siteOrigin: url.origin
	};
};
