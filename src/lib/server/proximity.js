import {
	CA_PROVINCES,
	US_STATES,
	buildGroupsDirectoryHref,
	expandRegionCandidates,
	normalizeCountryCode,
	normalizeRegionCode,
	parseCoordinates
} from './visitorLocation.js';

export const DEFAULT_PROXIMITY_RADIUS_MILES = 250;

export const HOMEPAGE_GROUP_COLUMNS = [
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

export const FALLBACK_GROUP_COLUMNS = [
	'id',
	'slug',
	'name',
	'tagline',
	'description',
	'membership_info',
	'service_area_description',
	'city',
	'state_region',
	'country',
	'logo_url',
	'cover_photo_url',
	'latitude',
	'longitude'
].join(', ');

export const HOMEPAGE_FEATURED_RIDE_SELECT = `
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

export const FALLBACK_RIDE_SELECT = `
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
	group:groups(id,slug,name,city,state_region,country,latitude,longitude,is_published)
`;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function distanceMiles(from, to) {
	const start = parseCoordinates(from?.latitude, from?.longitude);
	const end = parseCoordinates(to?.latitude, to?.longitude);
	if (start.latitude === null || end.latitude === null) return null;

	const radians = (degrees) => (degrees * Math.PI) / 180;
	const latDistance = radians(end.latitude - start.latitude);
	const lonDistance = radians(end.longitude - start.longitude);
	const a =
		Math.sin(latDistance / 2) ** 2 +
		Math.cos(radians(start.latitude)) *
			Math.cos(radians(end.latitude)) *
			Math.sin(lonDistance / 2) ** 2;
	const clamped = Math.min(1, Math.max(0, a));
	return 3958.8 * 2 * Math.asin(Math.sqrt(clamped));
}

export function containsWholeWord(haystack, needle) {
	let target = safeTrim(haystack).toLowerCase();
	const token = safeTrim(needle).toLowerCase();
	if (!target || !token) return false;

	if (token === 'virginia') {
		target = target.replace(/(^|[^\p{L}\p{N}])west\s+virginia($|[^\p{L}\p{N}])/gu, '$1$2');
	}

	const pattern = new RegExp(
		`(^|[^\\p{L}\\p{N}])${escapeRegex(token).replace(/\s+/g, '\\s+')}($|[^\\p{L}\\p{N}])`,
		'u'
	);
	return pattern.test(target);
}

export function matchesAnyWholeWord(haystack, needles = []) {
	for (const needle of needles) {
		if (containsWholeWord(haystack, needle)) return true;
	}
	return false;
}

function stripPostalCode(value) {
	return safeTrim(value)
		.replace(/\s+\d{5}(?:-\d{4})?$/, '')
		.replace(/\s+[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/, '')
		.trim();
}

export function inferRideCountry(ride) {
	const groupCountry = normalizeCountryCode(ride?.group?.country ?? ride?.group_country);
	if (groupCountry) return groupCountry;

	const sources = [
		ride?.startLocationAddress ?? ride?.start_location_address,
		ride?.startLocationName ?? ride?.start_location_name
	];

	for (const raw of sources) {
		const text = safeTrim(raw);
		if (!text) continue;
		const segments = text
			.split(',')
			.map((part) => safeTrim(part))
			.filter(Boolean);
		if (!segments.length) continue;

		const tail = stripPostalCode(segments[segments.length - 1]);
		const prev = segments.length >= 2 ? stripPostalCode(segments[segments.length - 2]) : '';

		if (tail.toUpperCase() === 'CA' && prev) {
			const caCode = normalizeRegionCode('CA', prev);
			return CA_PROVINCES[caCode] ? 'CA' : 'US';
		}

		if (
			['UNITED STATES', 'UNITED STATES OF AMERICA', 'USA', 'U.S.A.', 'U.S.', 'US'].includes(
				tail.toUpperCase()
			)
		) {
			return 'US';
		}

		const normalizedTailCountry = normalizeCountryCode(tail);
		if (normalizedTailCountry && tail.length > 2) {
			return normalizedTailCountry;
		}

		const usStateCode = normalizeRegionCode('US', tail);
		if (US_STATES[usStateCode]) {
			return 'US';
		}

		if (normalizedTailCountry) {
			return normalizedTailCountry;
		}
	}

	const coords = parseCoordinates(
		ride?.startLatitude ?? ride?.start_latitude,
		ride?.startLongitude ?? ride?.start_longitude
	);
	if (
		coords.latitude !== null &&
		coords.latitude >= 17.5 &&
		coords.latitude <= 72.0 &&
		coords.longitude >= -180.0 &&
		coords.longitude <= -64.0
	) {
		return 'US';
	}

	return '';
}

export function extractRideRegionText(ride) {
	const parts = [];
	const groupState = safeTrim(ride?.group?.state_region ?? ride?.group_state_region);
	if (groupState) parts.push(groupState);

	const sources = [
		ride?.startLocationAddress ?? ride?.start_location_address,
		ride?.startLocationName ?? ride?.start_location_name
	];
	for (const raw of sources) {
		const text = safeTrim(raw);
		if (!text) continue;
		const segments = text
			.split(',')
			.map((part) => safeTrim(part))
			.filter(Boolean);
		if (!segments.length) continue;
		if (segments.length === 1) {
			parts.push(segments[0]);
			continue;
		}
		const last = stripPostalCode(segments[segments.length - 1]);
		const lastIsCountry =
			(last.length > 2 && Boolean(normalizeCountryCode(last))) ||
			['US', 'USA', 'UK', 'GB', 'AU', 'NZ', 'MX', 'ES', 'FR', 'IT', 'PT'].includes(
				last.toUpperCase()
			) ||
			(last.toUpperCase() === 'CA' && segments.length >= 3);
		const regionSeg = stripPostalCode(
			lastIsCountry ? segments[segments.length - 2] : segments[segments.length - 1]
		);
		if (regionSeg) parts.push(regionSeg);
	}
	return parts.join(' | ');
}

export function extractRideCityText(ride) {
	const parts = [];
	const groupCity = safeTrim(ride?.group?.city ?? ride?.group_city);
	if (groupCity) parts.push(groupCity);

	const sources = [
		ride?.startLocationAddress ?? ride?.start_location_address,
		ride?.startLocationName ?? ride?.start_location_name
	];
	for (const raw of sources) {
		const text = safeTrim(raw);
		if (!text) continue;
		const segments = text
			.split(',')
			.map((part) => safeTrim(part))
			.filter(Boolean);
		if (segments.length === 1 || segments.length === 2) {
			parts.push(segments[0]);
		} else if (segments.length >= 3) {
			const last = stripPostalCode(segments[segments.length - 1]);
			const lastIsCountry =
				(last.length > 2 && Boolean(normalizeCountryCode(last))) ||
				['US', 'USA', 'UK', 'GB', 'AU', 'NZ', 'MX', 'ES', 'FR', 'IT', 'PT', 'CA'].includes(
					last.toUpperCase()
				);
			parts.push(segments.slice(0, lastIsCountry ? -2 : -1).join(', '));
		}
	}
	return parts.join(' | ');
}

function resolveFallbackTarget(location) {
	const city = safeTrim(location?.city);
	const rawRegion = safeTrim(location?.stateRegion || location?.region);
	let country = normalizeCountryCode(location?.country);

	if (!country && rawRegion) {
		const usCode = normalizeRegionCode('US', rawRegion);
		if (US_STATES[usCode]) country = 'US';
	}
	if (!country || (!city && !rawRegion)) return null;

	return {
		city,
		rawRegion,
		country,
		regionCode: normalizeRegionCode(country, rawRegion),
		regionCandidates: expandRegionCandidates(country, rawRegion)
	};
}

export function matchNearbyGroupsInMemory(
	groups,
	location,
	{ maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES, limit = 50 } = {}
) {
	const items = Array.isArray(groups) ? groups : [];
	const visitorCoords = parseCoordinates(location?.latitude, location?.longitude);
	const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : items.length;

	if (visitorCoords.latitude !== null) {
		return items
			.filter((group) => group?.is_published !== false)
			.map((group) => {
				const dist = distanceMiles(visitorCoords, {
					latitude: group?.latitude,
					longitude: group?.longitude
				});
				return dist !== null && dist <= maxMiles
					? {
							...group,
							distance_miles: dist,
							match_score: 30 - dist / 10
						}
					: null;
			})
			.filter(Boolean)
			.sort((a, b) => {
				if (a.distance_miles !== b.distance_miles) return a.distance_miles - b.distance_miles;
				const aMedia = Boolean(a.logo_url || a.cover_photo_url);
				const bMedia = Boolean(b.logo_url || b.cover_photo_url);
				if (aMedia !== bMedia) return bMedia ? 1 : -1;
				return String(a.name || '').localeCompare(String(b.name || ''));
			})
			.slice(0, safeLimit);
	}

	const target = resolveFallbackTarget(location);
	if (!target) return [];

	return items
		.filter(
			(group) =>
				group?.is_published !== false && normalizeCountryCode(group?.country) === target.country
		)
		.map((group) => {
			const cityMatched = Boolean(target.city && containsWholeWord(group?.city, target.city));
			const groupRegionCode = normalizeRegionCode(target.country, group?.state_region);
			const regionMatched = Boolean(
				target.rawRegion &&
				((['US', 'CA', 'AU'].includes(target.country) && groupRegionCode === target.regionCode) ||
					((!['US', 'CA', 'AU'].includes(target.country) ||
						groupRegionCode === target.regionCode ||
						groupRegionCode.length > 3) &&
						matchesAnyWholeWord(group?.state_region, target.regionCandidates)))
			);
			const qualifies = target.rawRegion ? regionMatched : cityMatched;
			if (!qualifies) return null;
			return {
				...group,
				distance_miles: null,
				match_score: (cityMatched ? 8 : 0) + (regionMatched ? 3 : 0)
			};
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (b.match_score !== a.match_score) return b.match_score - a.match_score;
			const aMedia = Boolean(a.logo_url || a.cover_photo_url);
			const bMedia = Boolean(b.logo_url || b.cover_photo_url);
			if (aMedia !== bMedia) return bMedia ? 1 : -1;
			return String(a.name || '').localeCompare(String(b.name || ''));
		})
		.slice(0, safeLimit);
}

export function matchNearbyRidesInMemory(
	rides,
	location,
	{ maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES, limit = 25 } = {}
) {
	const items = Array.isArray(rides) ? rides : [];
	const visitorCoords = parseCoordinates(location?.latitude, location?.longitude);
	const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : items.length;

	if (visitorCoords.latitude !== null) {
		return items
			.map((ride) => {
				const ownCoords = parseCoordinates(
					ride?.startLatitude ?? ride?.start_latitude,
					ride?.startLongitude ?? ride?.start_longitude
				);
				const targetCoords =
					ownCoords.latitude !== null
						? ownCoords
						: parseCoordinates(ride?.group?.latitude, ride?.group?.longitude);
				const dist = distanceMiles(visitorCoords, targetCoords);
				return dist !== null && dist <= maxMiles
					? {
							...ride,
							distanceMiles: dist,
							matchScore: 30 - dist / 10
						}
					: null;
			})
			.filter(Boolean)
			.sort((a, b) => {
				if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
				return String(a.nextOccurrenceStart || '').localeCompare(
					String(b.nextOccurrenceStart || '')
				);
			})
			.slice(0, safeLimit);
	}

	const target = resolveFallbackTarget(location);
	if (!target) return [];

	return items
		.filter((ride) => inferRideCountry(ride) === target.country)
		.map((ride) => {
			const cityMatched = Boolean(
				target.city && containsWholeWord(extractRideCityText(ride), target.city)
			);
			const regionMatched = Boolean(
				target.rawRegion &&
				matchesAnyWholeWord(extractRideRegionText(ride), target.regionCandidates)
			);
			const qualifies = target.rawRegion ? regionMatched : cityMatched;
			if (!qualifies) return null;
			return {
				...ride,
				distanceMiles: null,
				matchScore: (cityMatched ? 8 : 0) + (regionMatched ? 3 : 0)
			};
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
			return String(a.nextOccurrenceStart || '').localeCompare(String(b.nextOccurrenceStart || ''));
		})
		.slice(0, safeLimit);
}

export function formatNearbyRideRow(row) {
	if (!row) return null;
	const imageUrls = Array.isArray(row.image_urls)
		? row.image_urls
		: Array.isArray(row.imageUrls)
			? row.imageUrls
			: Array.isArray(row.ride_details)
				? (row.ride_details[0]?.image_urls ?? [])
				: (row.ride_details?.image_urls ?? []);

	const rawGroup = Array.isArray(row.group) ? row.group[0] : row.group;
	const group =
		rawGroup && rawGroup.is_published !== false
			? {
					id: rawGroup.id,
					slug: rawGroup.slug,
					name: rawGroup.name,
					city: rawGroup.city,
					state_region: rawGroup.state_region,
					country: rawGroup.country,
					...(rawGroup.latitude !== undefined ? { latitude: rawGroup.latitude } : {}),
					...(rawGroup.longitude !== undefined ? { longitude: rawGroup.longitude } : {})
				}
			: !rawGroup && row.group_id
				? {
						id: row.group_id,
						slug: row.group_slug,
						name: row.group_name,
						city: row.group_city,
						state_region: row.group_state_region,
						country: row.group_country
					}
				: null;

	return {
		id: row.id,
		title: row.title,
		slug: row.slug,
		summary: row.summary ?? null,
		description: row.description ?? null,
		timezone: row.timezone ?? 'UTC',
		status: row.status ?? 'published',
		hostUserId: row.host_user_id ?? row.hostUserId ?? null,
		hostGroupId: row.host_group_id ?? row.hostGroupId ?? null,
		startLocationName: row.start_location_name ?? row.startLocationName ?? '',
		startLocationAddress: row.start_location_address ?? row.startLocationAddress ?? null,
		startLatitude: row.start_latitude ?? row.startLatitude ?? null,
		startLongitude: row.start_longitude ?? row.startLongitude ?? null,
		nextOccurrenceStart: row.next_occurrence_start ?? row.nextOccurrenceStart ?? null,
		nextOccurrenceEnd: row.next_occurrence_end ?? row.nextOccurrenceEnd ?? null,
		imageUrls,
		group,
		distanceMiles: row.distance_miles ?? row.distanceMiles ?? null,
		matchScore: row.match_score ?? row.matchScore ?? null
	};
}

async function fetchNearbyGroupsFallback(
	supabase,
	location,
	{ maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES, limit = 50, columns = FALLBACK_GROUP_COLUMNS } = {}
) {
	const visitorCoords = parseCoordinates(location?.latitude, location?.longitude);
	if (visitorCoords.latitude === null && !resolveFallbackTarget(location)) {
		return { data: [], error: null };
	}

	const effectiveMaxMiles = maxMiles > 0 ? maxMiles : DEFAULT_PROXIMITY_RADIUS_MILES;
	const latDelta = effectiveMaxMiles / 68.0;
	const selectColumns = columns || FALLBACK_GROUP_COLUMNS;
	const pageSize = 1000;
	const rows = [];
	let from = 0;

	while (true) {
		let query = supabase.from('groups').select(selectColumns).eq('is_published', true);
		if (visitorCoords.latitude !== null) {
			query = query
				.not('latitude', 'is', null)
				.not('longitude', 'is', null)
				.gte('latitude', visitorCoords.latitude - latDelta)
				.lte('latitude', visitorCoords.latitude + latDelta);
		}
		const { data, error } = await query.order('id').range(from, from + pageSize - 1);
		if (error) return { data: [], error };
		const chunk = Array.isArray(data) ? data : [];
		rows.push(...chunk);
		if (chunk.length < pageSize) break;
		from += pageSize;
	}

	return {
		data: matchNearbyGroupsInMemory(rows, location, {
			maxMiles: effectiveMaxMiles,
			limit
		}),
		error: null
	};
}

async function fetchNearbyRidesFallback(
	supabase,
	location,
	{
		maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES,
		limit = 25,
		nowIso = /** @type {string | undefined} */ (undefined)
	} = {}
) {
	const visitorCoords = parseCoordinates(location?.latitude, location?.longitude);
	if (visitorCoords.latitude === null && !resolveFallbackTarget(location)) {
		return { data: [], error: null };
	}

	const effectiveMaxMiles = maxMiles > 0 ? maxMiles : DEFAULT_PROXIMITY_RADIUS_MILES;
	const cutoffIso = nowIso || new Date().toISOString();
	const pageSize = 1000;
	const rows = [];
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from('activity_events')
			.select(FALLBACK_RIDE_SELECT)
			.eq('activity_type', 'ride')
			.eq('status', 'published')
			.gte('next_occurrence_start', cutoffIso)
			.order('next_occurrence_start', { ascending: true })
			.order('id', { ascending: true })
			.range(from, from + pageSize - 1);

		if (error) return { data: [], error };
		const chunk = Array.isArray(data) ? data : [];
		rows.push(...chunk);
		if (chunk.length < pageSize) break;
		from += pageSize;
	}

	const formatted = rows.map(formatNearbyRideRow).filter(Boolean);
	return {
		data: matchNearbyRidesInMemory(formatted, location, {
			maxMiles: effectiveMaxMiles,
			limit
		}),
		error: null
	};
}

export async function fetchNearbyGroups(
	supabase,
	location,
	{
		maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES,
		limit = 50,
		columns = /** @type {string | undefined} */ (undefined)
	} = {}
) {
	if (!supabase || !location?.hasLocalScope) return { data: [], error: null };

	const { data, error } = await supabase.rpc('match_nearby_groups', {
		p_lat: location.hasCoordinates ? location.latitude : null,
		p_lon: location.hasCoordinates ? location.longitude : null,
		p_city: safeTrim(location.city) || null,
		p_region: safeTrim(location.stateRegion || location.region) || null,
		p_country: safeTrim(location.country) || null,
		p_max_miles: maxMiles,
		p_limit: limit
	});

	if (error) {
		if (typeof supabase.from === 'function') {
			const fallback = await fetchNearbyGroupsFallback(supabase, location, {
				maxMiles,
				limit,
				columns
			});
			if (!fallback.error) return fallback;
			return { data: [], error: fallback.error || error };
		}
		return { data: [], error };
	}
	return { data: Array.isArray(data) ? data : [], error: null };
}

export async function fetchNearbyRides(
	supabase,
	location,
	{
		maxMiles = DEFAULT_PROXIMITY_RADIUS_MILES,
		limit = 25,
		nowIso = /** @type {string | undefined} */ (undefined)
	} = {}
) {
	if (!supabase || !location?.hasLocalScope) return { data: [], error: null };

	const { data, error } = await supabase.rpc('match_nearby_rides', {
		p_lat: location.hasCoordinates ? location.latitude : null,
		p_lon: location.hasCoordinates ? location.longitude : null,
		p_city: safeTrim(location.city) || null,
		p_region: safeTrim(location.stateRegion || location.region) || null,
		p_country: safeTrim(location.country) || null,
		p_max_miles: maxMiles,
		p_limit: limit
	});

	if (error) {
		if (typeof supabase.from === 'function') {
			const fallback = await fetchNearbyRidesFallback(supabase, location, {
				maxMiles,
				limit,
				nowIso
			});
			if (!fallback.error) return fallback;
			return { data: [], error: fallback.error || error };
		}
		return { data: [], error };
	}
	return {
		data: (Array.isArray(data) ? data : []).map(formatNearbyRideRow).filter(Boolean),
		error: null
	};
}

export async function loadHomepageDiscoveryData({
	supabase,
	visitorLocation,
	siteOrigin = '',
	nowIso = new Date().toISOString()
}) {
	const hasLocalScope = Boolean(visitorLocation?.hasLocalScope);

	const [nearbyGroupsRes, featuredGroupsRes, nearbyRidesRes, featuredRidesRes] = await Promise.all([
		hasLocalScope
			? fetchNearbyGroups(supabase, visitorLocation, {
					maxMiles: DEFAULT_PROXIMITY_RADIUS_MILES,
					limit: 3,
					columns: HOMEPAGE_GROUP_COLUMNS
				})
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('groups')
			.select(HOMEPAGE_GROUP_COLUMNS)
			.eq('is_published', true)
			.not('cover_photo_url', 'is', null)
			.order('name')
			.limit(3),
		hasLocalScope
			? fetchNearbyRides(supabase, visitorLocation, {
					maxMiles: DEFAULT_PROXIMITY_RADIUS_MILES,
					limit: 2,
					nowIso
				})
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('activity_events')
			.select(HOMEPAGE_FEATURED_RIDE_SELECT)
			.eq('activity_type', 'ride')
			.eq('status', 'published')
			.gte('next_occurrence_start', nowIso)
			.order('next_occurrence_start', { ascending: true })
			.limit(2)
	]);

	const localGroupsAvailable = hasLocalScope && !nearbyGroupsRes.error;
	const localGroups =
		localGroupsAvailable && Array.isArray(nearbyGroupsRes.data) ? nearbyGroupsRes.data : [];
	const featuredGroups = Array.isArray(featuredGroupsRes.data) ? featuredGroupsRes.data : [];
	const nearbyRides =
		!nearbyRidesRes.error && Array.isArray(nearbyRidesRes.data) ? nearbyRidesRes.data : [];
	const fallbackRides = (Array.isArray(featuredRidesRes.data) ? featuredRidesRes.data : [])
		.map(formatNearbyRideRow)
		.filter(Boolean);

	const localRides = nearbyRides.length ? nearbyRides : fallbackRides;
	const rideSource = nearbyRides.length ? 'local' : localRides.length ? 'featured' : null;
	const locationSource = localGroupsAvailable ? visitorLocation.source : null;
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
		siteOrigin
	};
}

export function resolveGroupsDirectoryScope({ url, visitorLocation }) {
	const searchParams = url?.searchParams;
	const country = safeTrim(searchParams?.get('country')).toUpperCase();
	const state_region = safeTrim(searchParams?.get('state_region'));
	const explicitSortRaw = safeTrim(searchParams?.get('sort')).toLowerCase();
	const hasExplicitLocationParams = Boolean(
		searchParams?.has('country') || searchParams?.has('state_region')
	);
	const hasLocalVisitor = Boolean(visitorLocation?.hasLocalScope);

	const explicitSort =
		explicitSortRaw === 'name' || explicitSortRaw === 'proximity' ? explicitSortRaw : '';

	const proximityActive =
		hasLocalVisitor &&
		!country &&
		!state_region &&
		!hasExplicitLocationParams &&
		explicitSort !== 'name';

	const sort = proximityActive ? 'proximity' : 'name';
	const shouldSetPrivateNoStore = proximityActive;

	return {
		country,
		state_region,
		sort,
		proximityActive,
		proximityLabel: proximityActive ? safeTrim(visitorLocation?.label) : '',
		proximitySource: proximityActive ? (visitorLocation?.source ?? null) : null,
		shouldSetPrivateNoStore
	};
}
