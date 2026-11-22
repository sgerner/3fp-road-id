const VIEW_OPTIONS = ['list', 'calendar', 'map'];
const THEME_OPTIONS = ['light', 'dark', 'auto'];
const DENSITY_OPTIONS = ['comfortable', 'compact'];
const MAX_TEXT_LENGTH = 240;
const MAX_ORGANIZATION_SLUG_LENGTH = 120;
const MAX_EXCLUDED_RIDES = 50;
const MAX_EXCLUDED_SLUG_LENGTH = 120;

export const DEFAULT_RIDE_WIDGET_CONFIG = Object.freeze({
	organizationSlug: '',
	location: '',
	city: '',
	state: '',
	near: '',
	radiusMiles: null,
	latitude: null,
	longitude: null,
	defaultTab: 'list',
	theme: 'auto',
	density: 'comfortable',
	showUserFilters: true,
	showAddButton: true,
	prefixCity: false,
	difficultyColors: true,
	excludeRideSlugs: []
});

function safeTrim(value, maxLength = MAX_TEXT_LENGTH) {
	if (value === null || value === undefined) return '';
	return String(value).trim().slice(0, maxLength);
}

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function normalizeBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
		if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	}
	return fallback;
}

function normalizeSlugList(value) {
	const source = Array.isArray(value)
		? value.slice(0, MAX_EXCLUDED_RIDES)
		: safeTrim(value, MAX_EXCLUDED_RIDES * (MAX_EXCLUDED_SLUG_LENGTH + 1)).split(',');
	return Array.from(
		new Set(
			source.map((entry) => safeTrim(entry, MAX_EXCLUDED_SLUG_LENGTH).toLowerCase()).filter(Boolean)
		)
	).slice(0, MAX_EXCLUDED_RIDES);
}

function normalizeChoice(value, allowed, fallback) {
	return allowed.includes(value) ? value : fallback;
}

function normalizeLatLng(value, min, max) {
	const numeric = toFiniteNumber(value);
	if (numeric === null) return null;
	if (numeric < min || numeric > max) return null;
	return numeric;
}

export function normalizeRideWidgetConfig(input = {}) {
	const radius = toFiniteNumber(input.radiusMiles);
	const locationFallback = [safeTrim(input.city), safeTrim(input.state)].filter(Boolean).join(' ');

	return {
		organizationSlug: safeTrim(input.organizationSlug, MAX_ORGANIZATION_SLUG_LENGTH).toLowerCase(),
		location: safeTrim(input.location || locationFallback),
		city: safeTrim(input.city),
		state: safeTrim(input.state, 80),
		near: safeTrim(input.near),
		radiusMiles:
			radius === null || radius <= 0 ? null : clamp(Math.round(radius * 10) / 10, 1, 500),
		latitude: normalizeLatLng(input.latitude, -90, 90),
		longitude: normalizeLatLng(input.longitude, -180, 180),
		defaultTab: normalizeChoice(safeTrim(input.defaultTab).toLowerCase(), VIEW_OPTIONS, 'list'),
		theme: normalizeChoice(safeTrim(input.theme).toLowerCase(), THEME_OPTIONS, 'auto'),
		density: normalizeChoice(safeTrim(input.density).toLowerCase(), DENSITY_OPTIONS, 'comfortable'),
		showUserFilters: normalizeBoolean(
			input.showUserFilters,
			DEFAULT_RIDE_WIDGET_CONFIG.showUserFilters
		),
		showAddButton: normalizeBoolean(input.showAddButton, DEFAULT_RIDE_WIDGET_CONFIG.showAddButton),
		prefixCity: normalizeBoolean(input.prefixCity, DEFAULT_RIDE_WIDGET_CONFIG.prefixCity),
		difficultyColors: normalizeBoolean(
			input.difficultyColors,
			DEFAULT_RIDE_WIDGET_CONFIG.difficultyColors
		),
		excludeRideSlugs: normalizeSlugList(input.excludeRideSlugs)
	};
}

export function parseRideWidgetConfigFromSearchParams(searchParams, { partial = false } = {}) {
	const parsed = {};
	const has = (key) => searchParams.has(key);
	const read = (key) => searchParams.get(key);

	if (has('org')) parsed.organizationSlug = read('org');
	if (has('location')) parsed.location = read('location');
	if (has('loc')) parsed.location = read('loc');
	if (has('city')) parsed.city = read('city');
	if (has('state')) parsed.state = read('state');
	if (has('near')) parsed.near = read('near');
	if (has('radius')) parsed.radiusMiles = read('radius');
	if (has('lat')) parsed.latitude = read('lat');
	if (has('lng')) parsed.longitude = read('lng');
	if (has('tab')) parsed.defaultTab = read('tab');
	if (has('theme')) parsed.theme = read('theme');
	if (has('density')) parsed.density = read('density');
	if (has('filters')) parsed.showUserFilters = read('filters');
	if (has('add')) parsed.showAddButton = read('add');
	if (has('prefixCity')) parsed.prefixCity = read('prefixCity');
	if (has('difficultyColors')) parsed.difficultyColors = read('difficultyColors');
	if (has('exclude')) parsed.excludeRideSlugs = read('exclude');

	if (partial) return parsed;
	return normalizeRideWidgetConfig(parsed);
}

function shouldWriteValue(value, defaultValue) {
	if (Array.isArray(value) && Array.isArray(defaultValue)) {
		return value.join(',') !== defaultValue.join(',');
	}
	return value !== defaultValue;
}

export function buildRideWidgetSearchParams(config, { includeDefaults = false } = {}) {
	const normalized = normalizeRideWidgetConfig(config);
	const params = new URLSearchParams();

	const setIfNeeded = (key, value, defaultValue) => {
		if (!includeDefaults && !shouldWriteValue(value, defaultValue)) return;
		if (value === null || value === undefined || value === '') return;
		params.set(key, String(value));
	};

	setIfNeeded('org', normalized.organizationSlug, DEFAULT_RIDE_WIDGET_CONFIG.organizationSlug);
	setIfNeeded('location', normalized.location, DEFAULT_RIDE_WIDGET_CONFIG.location);
	setIfNeeded('city', normalized.city, DEFAULT_RIDE_WIDGET_CONFIG.city);
	setIfNeeded('state', normalized.state, DEFAULT_RIDE_WIDGET_CONFIG.state);
	setIfNeeded('near', normalized.near, DEFAULT_RIDE_WIDGET_CONFIG.near);
	setIfNeeded('radius', normalized.radiusMiles, DEFAULT_RIDE_WIDGET_CONFIG.radiusMiles);
	setIfNeeded('lat', normalized.latitude, DEFAULT_RIDE_WIDGET_CONFIG.latitude);
	setIfNeeded('lng', normalized.longitude, DEFAULT_RIDE_WIDGET_CONFIG.longitude);
	setIfNeeded('tab', normalized.defaultTab, DEFAULT_RIDE_WIDGET_CONFIG.defaultTab);
	setIfNeeded('theme', normalized.theme, DEFAULT_RIDE_WIDGET_CONFIG.theme);
	setIfNeeded('density', normalized.density, DEFAULT_RIDE_WIDGET_CONFIG.density);
	setIfNeeded(
		'filters',
		normalized.showUserFilters ? 1 : 0,
		DEFAULT_RIDE_WIDGET_CONFIG.showUserFilters ? 1 : 0
	);
	setIfNeeded(
		'add',
		normalized.showAddButton ? 1 : 0,
		DEFAULT_RIDE_WIDGET_CONFIG.showAddButton ? 1 : 0
	);
	setIfNeeded(
		'prefixCity',
		normalized.prefixCity ? 1 : 0,
		DEFAULT_RIDE_WIDGET_CONFIG.prefixCity ? 1 : 0
	);
	setIfNeeded(
		'difficultyColors',
		normalized.difficultyColors ? 1 : 0,
		DEFAULT_RIDE_WIDGET_CONFIG.difficultyColors ? 1 : 0
	);
	setIfNeeded(
		'exclude',
		normalized.excludeRideSlugs.join(','),
		DEFAULT_RIDE_WIDGET_CONFIG.excludeRideSlugs.join(',')
	);

	return params;
}

function normalizeText(value) {
	return safeTrim(value).toLowerCase();
}

const US_STATE_CODES = new Set([
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
	'DC',
	'PR',
	'VI',
	'GU'
]);

const CA_PROVINCE_CODES = new Set([
	'AB',
	'BC',
	'MB',
	'NB',
	'NL',
	'NS',
	'NT',
	'NU',
	'ON',
	'PE',
	'QC',
	'SK',
	'YT'
]);

const AU_STATE_CODES = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);

const COUNTRY_NAME_TO_CODE = new Map([
	['united states', 'US'],
	['united states of america', 'US'],
	['usa', 'US'],
	['u.s.a.', 'US'],
	['u.s.', 'US'],
	['canada', 'CA'],
	['united kingdom', 'GB'],
	['uk', 'GB'],
	['great britain', 'GB'],
	['australia', 'AU'],
	['mexico', 'MX'],
	['spain', 'ES'],
	['españa', 'ES'],
	['italy', 'IT'],
	['italia', 'IT'],
	['france', 'FR'],
	['germany', 'DE'],
	['india', 'IN'],
	['indonesia', 'ID'],
	['oman', 'OM'],
	['thailand', 'TH'],
	['new zealand', 'NZ'],
	['ireland', 'IE'],
	['portugal', 'PT'],
	['netherlands', 'NL'],
	['belgium', 'BE'],
	['switzerland', 'CH'],
	['japan', 'JP'],
	['brazil', 'BR']
]);

const INTERNATIONAL_REGIONS = new Set([
	'kerala',
	'karnataka',
	'maharashtra',
	'tamil nadu',
	'telangana',
	'rajasthan',
	'gujarat',
	'goa',
	'west bengal',
	'uttar pradesh',
	'andalusia',
	'catalonia',
	'galicia',
	'valencia',
	'tuscany',
	'lombardy',
	'bavaria',
	'jalisco',
	'oaxaca',
	'baja california',
	'england',
	'scotland',
	'wales'
]);

function extractCityFromStreetAndCity(segment) {
	const trimmed = safeTrim(segment);
	if (!/^\d+\s+/.test(trimmed)) return trimmed;
	const match =
		/\b(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|ct|court|pkwy|parkway|pl|place|cir|circle|trl|trail|hwy|highway)\.?\s+([A-Za-z][A-Za-z\s.'-]+)$/i.exec(
			trimmed
		);
	return match ? safeTrim(match[1]) : trimmed;
}

function parseSubdivisionToken(segment) {
	const trimmed = safeTrim(segment);
	if (!trimmed) return null;

	const usMatch = /^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(trimmed);
	if (usMatch && US_STATE_CODES.has(usMatch[1].toUpperCase())) {
		return { code: usMatch[1].toUpperCase(), country: 'US' };
	}

	const caMatch = /^([A-Za-z]{2})(?:\s+[A-Za-z]\d[A-Za-z](?:\s?\d[A-Za-z]\d)?)?$/.exec(trimmed);
	if (caMatch && CA_PROVINCE_CODES.has(caMatch[1].toUpperCase())) {
		return { code: caMatch[1].toUpperCase(), country: 'CA' };
	}

	const auMatch = /^([A-Za-z]{2,3})(?:\s+\d{4})?$/.exec(trimmed);
	if (auMatch && AU_STATE_CODES.has(auMatch[1].toUpperCase())) {
		return { code: auMatch[1].toUpperCase(), country: 'AU' };
	}

	return null;
}

function collapseConsecutiveDuplicates(parts) {
	const result = [];
	for (const part of parts) {
		const prev = result[result.length - 1];
		if (prev && prev.toLowerCase() === part.toLowerCase()) continue;
		result.push(part);
	}
	return result;
}

export function parseAddressParts(address) {
	const rawParts = safeTrim(address)
		.split(',')
		.map((part) => safeTrim(part))
		.filter(Boolean);
	if (!rawParts.length || /^online\b/i.test(rawParts[0])) {
		return { city: '', state: '' };
	}

	const parts = collapseConsecutiveDuplicates(rawParts);
	if (parts.length === 1) {
		return { city: '', state: '' };
	}

	if (parts.length === 2) {
		const first = parts[0];
		const second = parts[1];
		const sub = parseSubdivisionToken(second);
		if (sub) {
			return { city: extractCityFromStreetAndCity(first), state: sub.code };
		}
		const mappedCountry = COUNTRY_NAME_TO_CODE.get(second.toLowerCase());
		if (mappedCountry) {
			return { city: first, state: mappedCountry };
		}
		if (/^[A-Za-z]{2}$/.test(second)) {
			return { city: first, state: second.toUpperCase() };
		}
		const strippedPostal = safeTrim(second.replace(/\b\d{4,6}(?:-\d{4})?\b/g, ''));
		return {
			city: extractCityFromStreetAndCity(first),
			state: strippedPostal.length <= 3 ? strippedPostal.toUpperCase() : strippedPostal
		};
	}

	const working = [...parts];
	const last = working[working.length - 1];
	let countryCode = COUNTRY_NAME_TO_CODE.get(last.toLowerCase()) || '';
	if (countryCode) {
		working.pop();
	} else if (/^[A-Za-z]{2}$/.test(last)) {
		countryCode = last.toUpperCase();
		working.pop();
	}

	if (countryCode) {
		if (!working.length) return { city: '', state: countryCode };
		if (countryCode === 'US' || countryCode === 'CA' || countryCode === 'AU') {
			const tail = working[working.length - 1];
			const sub = parseSubdivisionToken(tail);
			const state =
				sub?.code ||
				safeTrim(tail.replace(/\b\d{4,6}(?:-\d{4})?\b/g, '')).toUpperCase() ||
				countryCode;
			const city =
				working.length >= 2 ? extractCityFromStreetAndCity(working[working.length - 2]) : '';
			return { city, state };
		}

		let idx = working.length - 1;
		while (idx > 0) {
			const candidate = working[idx];
			const candidateCountry = COUNTRY_NAME_TO_CODE.get(candidate.toLowerCase());
			if (
				candidateCountry === countryCode ||
				(/^[A-Za-z0-9]{1,3}$/.test(candidate) && /\d/.test(candidate))
			) {
				idx -= 1;
				continue;
			}
			break;
		}

		const tail = working[idx];
		if (idx >= 1) {
			const prev = working[idx - 1];
			if (/^[A-Za-z]{2,3}$/.test(tail) && tail === tail.toUpperCase()) {
				return { city: prev, state: countryCode };
			}
			if (
				INTERNATIONAL_REGIONS.has(tail.toLowerCase()) &&
				!COUNTRY_NAME_TO_CODE.has(prev.toLowerCase()) &&
				prev.toLowerCase() !== tail.toLowerCase()
			) {
				return { city: prev, state: tail };
			}
		}

		return { city: tail, state: countryCode };
	}

	const tail = working[working.length - 1];
	const prev = working[working.length - 2];
	const sub = parseSubdivisionToken(tail);
	if (sub) {
		return { city: extractCityFromStreetAndCity(prev), state: sub.code };
	}
	const strippedState = safeTrim(tail.replace(/\b\d{4,6}(?:-\d{4})?\b/g, ''));
	return {
		city: extractCityFromStreetAndCity(prev),
		state: strippedState.length <= 3 ? strippedState.toUpperCase() : strippedState
	};
}

export function extractRideCity(ride) {
	const groupCity = safeTrim(ride?.group?.city);
	if (groupCity) return groupCity;
	return parseAddressParts(ride?.startLocationAddress ?? ride?.start_location_address).city;
}

export function extractRideState(ride) {
	const groupState = safeTrim(ride?.group?.state_region);
	if (groupState) return groupState;
	return parseAddressParts(ride?.startLocationAddress ?? ride?.start_location_address).state;
}

export function extractRideVenueName(ride) {
	const rawName = safeTrim(ride?.startLocationName ?? ride?.start_location_name);
	if (rawName && rawName.toLowerCase() !== 'meetup event') {
		return rawName;
	}
	const rawAddress = safeTrim(ride?.startLocationAddress ?? ride?.start_location_address);
	if (!rawAddress) return '';
	if (/^online\b/i.test(rawAddress)) return 'Online event';
	const firstSegment = rawAddress
		.split(',')
		.map((part) => safeTrim(part))
		.find(Boolean);
	return firstSegment || '';
}

export function formatRideCardLocation(ride) {
	const venue = extractRideVenueName(ride);
	const city = extractRideCity(ride);
	const state = extractRideState(ride);
	const cityState = [city, state].filter(Boolean).join(', ');

	if (!venue) return cityState || 'Location coming soon';
	if (!cityState) return venue;

	const venueLower = venue.toLowerCase();
	const cityLower = city.toLowerCase();
	const cityStateLower = cityState.toLowerCase();
	if (venueLower === cityLower || venueLower === cityStateLower) {
		return cityState;
	}
	if (venueLower.includes(cityStateLower)) {
		return venue;
	}
	return `${venue} · ${cityState}`;
}

export function formatRideWidgetTitle(ride, config = DEFAULT_RIDE_WIDGET_CONFIG) {
	const title = safeTrim(ride?.title) || 'Ride';
	if (!config?.prefixCity) return title;
	const city = extractRideCity(ride);
	if (!city) return title;
	const lowerTitle = title.toLowerCase();
	if (lowerTitle.startsWith(`${city.toLowerCase()}:`)) return title;
	return `${city}: ${title}`;
}

function toRadians(value) {
	return (value * Math.PI) / 180;
}

export function calculateDistanceMiles(latitudeA, longitudeA, latitudeB, longitudeB) {
	const latA = toFiniteNumber(latitudeA);
	const lngA = toFiniteNumber(longitudeA);
	const latB = toFiniteNumber(latitudeB);
	const lngB = toFiniteNumber(longitudeB);
	if ([latA, lngA, latB, lngB].some((value) => value === null)) return null;

	const earthRadiusMiles = 3958.7613;
	const dLat = toRadians(latB - latA);
	const dLng = toRadians(lngB - lngA);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earthRadiusMiles * c;
}

function matchesCity(ride, city) {
	if (!city) return true;
	return normalizeText(extractRideCity(ride)) === normalizeText(city);
}

function matchesState(ride, state) {
	if (!state) return true;
	return normalizeText(extractRideState(ride)) === normalizeText(state);
}

function matchesOrganization(ride, organizationSlug) {
	if (!organizationSlug) return true;
	return normalizeText(ride?.group?.slug) === normalizeText(organizationSlug);
}

function matchesExcludeList(ride, excludeRideSlugs) {
	if (!excludeRideSlugs.length) return true;
	return !excludeRideSlugs.includes(normalizeText(ride?.slug));
}

function matchesRadius(ride, radiusMiles, center) {
	if (!radiusMiles) return true;
	if (!center) return true;
	const distance = calculateDistanceMiles(
		center.latitude,
		center.longitude,
		ride?.startLatitude,
		ride?.startLongitude
	);
	if (distance === null) return false;
	return distance <= radiusMiles;
}

function matchesLocation(ride, locationQuery) {
	const query = normalizeText(locationQuery);
	if (!query) return true;
	const tokens = query
		.replace(/[^a-z0-9]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
	if (!tokens.length) return true;

	const haystack = [
		ride?.startLocationName,
		ride?.startLocationAddress,
		ride?.group?.name,
		ride?.group?.city,
		ride?.group?.state_region,
		ride?.group?.zip_code,
		extractRideCity(ride),
		extractRideState(ride)
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ');

	return tokens.every((token) => haystack.includes(token));
}

export function filterRidesForWidget(rides, config, { center = null } = {}) {
	const normalized = normalizeRideWidgetConfig(config);
	return (rides ?? []).filter((ride) => {
		const matchesLegacyCityState =
			!normalized.location &&
			matchesCity(ride, normalized.city) &&
			matchesState(ride, normalized.state);

		return (
			matchesOrganization(ride, normalized.organizationSlug) &&
			(matchesLocation(ride, normalized.location) || matchesLegacyCityState) &&
			matchesExcludeList(ride, normalized.excludeRideSlugs) &&
			matchesRadius(ride, normalized.radiusMiles, center)
		);
	});
}
