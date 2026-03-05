const VIEW_OPTIONS = ['list', 'calendar', 'map'];
const THEME_OPTIONS = ['light', 'dark', 'auto'];
const DENSITY_OPTIONS = ['comfortable', 'compact'];

export const DEFAULT_RIDE_WIDGET_CONFIG = Object.freeze({
	organizationSlug: '',
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
	const source = Array.isArray(value) ? value : safeTrim(value).split(',');
	return Array.from(new Set(source.map((entry) => safeTrim(entry).toLowerCase()).filter(Boolean)));
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

	return {
		organizationSlug: safeTrim(input.organizationSlug).toLowerCase(),
		city: safeTrim(input.city),
		state: safeTrim(input.state),
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

function parseAddressParts(address) {
	const parts = safeTrim(address)
		.split(',')
		.map((part) => safeTrim(part))
		.filter(Boolean);
	if (!parts.length) return { city: '', state: '' };
	const city = parts.length >= 2 ? parts[parts.length - 2] : '';
	const stateToken = parts[parts.length - 1];
	const state = safeTrim(stateToken.split(/\s+/)[0]).toUpperCase();
	return { city, state };
}

export function extractRideCity(ride) {
	const groupCity = safeTrim(ride?.group?.city);
	if (groupCity) return groupCity;
	return parseAddressParts(ride?.startLocationAddress).city;
}

export function extractRideState(ride) {
	const groupState = safeTrim(ride?.group?.state_region);
	if (groupState) return groupState;
	return parseAddressParts(ride?.startLocationAddress).state;
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

export function filterRidesForWidget(rides, config, { center = null } = {}) {
	const normalized = normalizeRideWidgetConfig(config);
	return (rides ?? []).filter((ride) => {
		return (
			matchesOrganization(ride, normalized.organizationSlug) &&
			matchesCity(ride, normalized.city) &&
			matchesState(ride, normalized.state) &&
			matchesExcludeList(ride, normalized.excludeRideSlugs) &&
			matchesRadius(ride, normalized.radiusMiles, center)
		);
	});
}
