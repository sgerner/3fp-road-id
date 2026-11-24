import { US_STATE_OPTIONS } from '#lib/geo/usStates.js';

export const LOCATION_HEADERS = {
	city: ['cf-ipcity', 'x-vercel-ip-city', 'x-azure-clientip-city', 'x-city'],
	region: [
		'cf-region-code',
		'cf-region',
		'x-vercel-ip-country-region',
		'x-azure-clientip-region',
		'x-region-code'
	],
	country: ['cf-ipcountry', 'x-vercel-ip-country', 'x-azure-clientip-country', 'x-country-code'],
	latitude: ['cf-iplatitude', 'x-vercel-ip-latitude', 'x-azure-clientip-latitude', 'x-latitude'],
	longitude: [
		'cf-iplongitude',
		'x-vercel-ip-longitude',
		'x-azure-clientip-longitude',
		'x-longitude'
	]
};

export const US_STATES = Object.fromEntries(US_STATE_OPTIONS.map(({ code, name }) => [code, name]));

export const CA_PROVINCES = {
	AB: 'Alberta',
	BC: 'British Columbia',
	MB: 'Manitoba',
	NB: 'New Brunswick',
	NL: 'Newfoundland and Labrador',
	NT: 'Northwest Territories',
	NS: 'Nova Scotia',
	NU: 'Nunavut',
	ON: 'Ontario',
	PE: 'Prince Edward Island',
	QC: 'Quebec',
	SK: 'Saskatchewan',
	YT: 'Yukon'
};

export const AU_STATES = {
	ACT: 'Australian Capital Territory',
	NSW: 'New South Wales',
	NT: 'Northern Territory',
	QLD: 'Queensland',
	SA: 'South Australia',
	TAS: 'Tasmania',
	VIC: 'Victoria',
	WA: 'Western Australia'
};

const COUNTRY_ALIASES = new Map([
	['US', 'US'],
	['USA', 'US'],
	['U S A', 'US'],
	['UNITED STATES', 'US'],
	['UNITED STATES OF AMERICA', 'US'],
	['CA', 'CA'],
	['CAN', 'CA'],
	['CANADA', 'CA'],
	['AU', 'AU'],
	['AUS', 'AU'],
	['AUSTRALIA', 'AU'],
	['GB', 'GB'],
	['GBR', 'GB'],
	['UK', 'GB'],
	['U K', 'GB'],
	['UNITED KINGDOM', 'GB'],
	['GREAT BRITAIN', 'GB'],
	['ENGLAND', 'GB'],
	['SCOTLAND', 'GB'],
	['WALES', 'GB'],
	['NORTHERN IRELAND', 'GB'],
	['MX', 'MX'],
	['MEX', 'MX'],
	['MEXICO', 'MX'],
	['MÉXICO', 'MX'],
	['NZ', 'NZ'],
	['NZL', 'NZ'],
	['NEW ZEALAND', 'NZ'],
	['ES', 'ES'],
	['ESP', 'ES'],
	['SPAIN', 'ES'],
	['ESPANA', 'ES'],
	['ESPAÑA', 'ES'],
	['FR', 'FR'],
	['FRA', 'FR'],
	['FRANCE', 'FR'],
	['IT', 'IT'],
	['ITA', 'IT'],
	['ITALY', 'IT'],
	['ITALIA', 'IT'],
	['PT', 'PT'],
	['PRT', 'PT'],
	['PORTUGAL', 'PT'],
	['DE', 'DE'],
	['DEU', 'DE'],
	['GERMANY', 'DE'],
	['DEUTSCHLAND', 'DE'],
	['IE', 'IE'],
	['IRL', 'IE'],
	['IRELAND', 'IE'],
	['NL', 'NL'],
	['NLD', 'NL'],
	['NETHERLANDS', 'NL'],
	['THE NETHERLANDS', 'NL'],
	['BE', 'BE'],
	['BEL', 'BE'],
	['BELGIUM', 'BE'],
	['CH', 'CH'],
	['CHE', 'CH'],
	['SWITZERLAND', 'CH'],
	['AT', 'AT'],
	['AUT', 'AT'],
	['AUSTRIA', 'AT'],
	['JP', 'JP'],
	['JPN', 'JP'],
	['JAPAN', 'JP'],
	['CO', 'CO'],
	['COL', 'CO'],
	['COLOMBIA', 'CO'],
	['ZA', 'ZA'],
	['ZAF', 'ZA'],
	['SOUTH AFRICA', 'ZA']
]);

const IGNORED_COUNTRY_VALUES = new Set(['', 'XX', 'T1', 'OTHER', 'UNKNOWN', 'N/A', 'NONE']);

const STATIC_ASSET_EXTENSIONS =
	/\.(?:avif|bmp|css|eot|gif|ico|jpeg|jpg|js|map|mjs|mp4|otf|pdf|png|svg|ttf|txt|wasm|webm|webmanifest|webp|woff|woff2|xml|zip)$/i;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeLookupKey(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\s.-]+/g, ' ')
		.trim();
}

export function readLocationHeader(headers, names) {
	if (!headers?.get) return '';
	for (const name of names) {
		const value = headers.get(name);
		if (!value) continue;
		try {
			const decoded = decodeURIComponent(value).trim();
			if (decoded) return decoded;
		} catch {
			const trimmed = value.trim();
			if (trimmed) return trimmed;
		}
	}
	return '';
}

export function parseCoordinates(rawLatitude, rawLongitude) {
	if (
		rawLatitude === null ||
		rawLatitude === undefined ||
		rawLatitude === '' ||
		rawLongitude === null ||
		rawLongitude === undefined ||
		rawLongitude === ''
	) {
		return { latitude: null, longitude: null };
	}
	const latitude = Number(rawLatitude);
	const longitude = Number(rawLongitude);
	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < -90 ||
		latitude > 90 ||
		longitude < -180 ||
		longitude > 180
	) {
		return { latitude: null, longitude: null };
	}
	return { latitude, longitude };
}

export function normalizeCountryCode(rawCountry) {
	const cleaned = safeTrim(rawCountry)
		.toUpperCase()
		.replace(/[.,]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (IGNORED_COUNTRY_VALUES.has(cleaned)) return '';
	if (COUNTRY_ALIASES.has(cleaned)) return COUNTRY_ALIASES.get(cleaned) || '';
	if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
	return '';
}

function findRegionInMap(map, rawValue) {
	const key = normalizeLookupKey(rawValue);
	if (!key) return null;
	for (const [code, name] of Object.entries(map)) {
		if (code.toLowerCase() === key || normalizeLookupKey(name) === key) {
			return { code, name };
		}
	}
	return null;
}

export function normalizeRegionCode(rawCountry, rawRegion) {
	let country = normalizeCountryCode(rawCountry);
	let region = safeTrim(rawRegion);
	if (!region) return '';

	const isoMatch = /^([a-z]{2})-([a-z0-9]{1,3})$/i.exec(region);
	if (isoMatch) {
		if (!country) country = normalizeCountryCode(isoMatch[1]);
		region = isoMatch[2];
	}

	if (!country || country === 'US') {
		const match = findRegionInMap(US_STATES, region);
		if (match) return match.code;
	}
	if (!country || country === 'CA') {
		const match = findRegionInMap(CA_PROVINCES, region);
		if (match) return match.code;
	}
	if (!country || country === 'AU') {
		const match = findRegionInMap(AU_STATES, region);
		if (match) return match.code;
	}

	if (/^[a-z]{2,3}$/i.test(region)) return region.toUpperCase();
	return region;
}

export function expandRegionCandidates(rawCountry, rawRegion) {
	const country = normalizeCountryCode(rawCountry);
	const region = safeTrim(rawRegion);
	if (!region) return [];

	const list = [];
	const add = (candidate) => {
		const trimmed = safeTrim(candidate);
		if (trimmed && !list.includes(trimmed)) list.push(trimmed);
	};

	const code = normalizeRegionCode(country, region);
	const maps = [];
	if (!country || country === 'US') maps.push(US_STATES);
	if (!country || country === 'CA') maps.push(CA_PROVINCES);
	if (!country || country === 'AU') maps.push(AU_STATES);

	for (const map of maps) {
		if (map[code]) {
			add(code);
			add(map[code]);
		}
	}

	if (!list.length) {
		add(code);
		add(region);
	}
	return list;
}

function stripPostalSuffix(segment) {
	return safeTrim(segment)
		.replace(/\s+\d{5}(?:-\d{4})?$/, '')
		.replace(/\s+[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/, '')
		.trim();
}

function parseAddressParts(text) {
	const segments = safeTrim(text)
		.split(',')
		.map((part) => safeTrim(part))
		.filter(Boolean);
	if (!segments.length) {
		return { city: '', region: '', country: '' };
	}
	if (segments.length === 1) {
		const only = stripPostalSuffix(segments[0]);
		const countryOnly = normalizeCountryCode(only);
		if (countryOnly && only.length > 2) {
			return { city: '', region: '', country: countryOnly };
		}
		return { city: only, region: '', country: '' };
	}

	let country = '';
	let working = segments.slice();
	const lastRaw = stripPostalSuffix(working[working.length - 1]);
	const prevRaw = working.length >= 2 ? stripPostalSuffix(working[working.length - 2]) : '';

	if (lastRaw.toUpperCase() === 'CA' && prevRaw) {
		if (findRegionInMap(CA_PROVINCES, prevRaw)) {
			country = 'CA';
			working.pop();
		} else {
			country = 'US';
		}
	} else if (COUNTRY_ALIASES.has(lastRaw.toUpperCase().replace(/[.,]+/g, ''))) {
		const mapped = COUNTRY_ALIASES.get(lastRaw.toUpperCase().replace(/[.,]+/g, '')) || '';
		if (lastRaw.length > 2 || !findRegionInMap(US_STATES, lastRaw)) {
			country = mapped;
			working.pop();
		}
	}

	// Remove standalone postal-code segments (e.g. Nominatim "... , Iowa, 51501, United States").
	working = working.filter((part, idx) => idx === 0 || !/^\d{4,6}(?:-\d{4})?$/.test(part));

	const city = working[0] || '';
	let region = '';

	for (let i = working.length - 1; i >= 1; i -= 1) {
		const candidate = stripPostalSuffix(working[i]);
		if (!candidate) continue;
		const usMatch = !country || country === 'US' ? findRegionInMap(US_STATES, candidate) : null;
		if (usMatch) {
			region = usMatch.code;
			if (!country) country = 'US';
			break;
		}
		const caMatch = !country || country === 'CA' ? findRegionInMap(CA_PROVINCES, candidate) : null;
		if (caMatch) {
			region = caMatch.code;
			if (!country) country = 'CA';
			break;
		}
		const auMatch = !country || country === 'AU' ? findRegionInMap(AU_STATES, candidate) : null;
		if (auMatch) {
			region = auMatch.code;
			if (!country) country = 'AU';
			break;
		}
		if (!region && !/county$/i.test(candidate)) {
			region = candidate;
		}
	}

	return { city, region, country };
}

export function formatVisitorAreaLabel({ city = '', stateRegion = '', region = '' } = {}) {
	return [safeTrim(city), safeTrim(stateRegion || region)].filter(Boolean).join(', ');
}

export function parseProfileLocation(metadata) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const context = metadata.recommendation_context;
	if (!context || typeof context !== 'object' || Array.isArray(context)) return null;

	const saved =
		context.home_location &&
		typeof context.home_location === 'object' &&
		!Array.isArray(context.home_location)
			? context.home_location
			: null;

	const typedLocation = safeTrim(context.location);
	const savedLabel = safeTrim(saved?.label);
	const label = savedLabel || typedLocation;
	const { latitude, longitude } = parseCoordinates(saved?.latitude, saved?.longitude);

	if (!label && latitude === null) return null;

	const fromTyped = parseAddressParts(typedLocation);
	const fromSaved = parseAddressParts(savedLabel);

	const country =
		normalizeCountryCode(saved?.country) || fromSaved.country || fromTyped.country || '';
	const rawRegion =
		safeTrim(saved?.state_region || saved?.region) || fromTyped.region || fromSaved.region || '';
	const stateRegion = normalizeRegionCode(country, rawRegion);
	const inferredCountry = country || (stateRegion && US_STATES[stateRegion] ? 'US' : '');
	const city = safeTrim(saved?.city) || fromTyped.city || fromSaved.city || '';
	const hasCoordinates = latitude !== null && longitude !== null;
	const hasLocalScope = hasCoordinates || Boolean(city || stateRegion);

	if (!hasLocalScope) return null;

	return {
		city,
		region: stateRegion || rawRegion,
		stateRegion,
		country: inferredCountry,
		label: label || formatVisitorAreaLabel({ city, stateRegion, region: rawRegion }),
		latitude,
		longitude,
		source: /** @type {'profile'} */ ('profile'),
		hasCoordinates,
		hasLocalScope
	};
}

export function readNetworkLocation(headers) {
	const rawCity = readLocationHeader(headers, LOCATION_HEADERS.city);
	const rawRegion = readLocationHeader(headers, LOCATION_HEADERS.region);
	const rawCountry = readLocationHeader(headers, LOCATION_HEADERS.country);
	const { latitude, longitude } = parseCoordinates(
		readLocationHeader(headers, LOCATION_HEADERS.latitude),
		readLocationHeader(headers, LOCATION_HEADERS.longitude)
	);

	let country = normalizeCountryCode(rawCountry);
	const stateRegion = normalizeRegionCode(country, rawRegion);
	if (!country && stateRegion && US_STATES[stateRegion]) {
		country = 'US';
	}

	const city = safeTrim(rawCity);
	const hasCoordinates = latitude !== null && longitude !== null;
	// Country-only headers (e.g. Cloudflare Free cf-ipcountry without coords/city/region)
	// must NOT count as a local recommendation area.
	const hasLocalScope = hasCoordinates || Boolean(country && (city || stateRegion));
	const label = hasLocalScope
		? formatVisitorAreaLabel({ city, stateRegion, region: rawRegion })
		: '';

	return {
		city,
		region: stateRegion || safeTrim(rawRegion),
		stateRegion,
		country,
		label,
		latitude,
		longitude,
		source: /** @type {'approximate' | null} */ (hasLocalScope ? 'approximate' : null),
		hasCoordinates,
		hasLocalScope
	};
}

export function shouldSkipVisitorLocation(event, { micrositeSlug = '' } = {}) {
	if (micrositeSlug || event?.locals?.micrositeSlug) return true;

	const routeId = safeTrim(event?.route?.id);
	if (routeId.startsWith('/[siteSlug]') || routeId.startsWith('/api/')) return true;

	const pathname = safeTrim(event?.url?.pathname) || '/';
	if (pathname === '/__data.json' || pathname.endsWith('/__data.json')) {
		return false;
	}
	if (
		pathname.startsWith('/api/') ||
		pathname.startsWith('/_app/') ||
		pathname === '/_app' ||
		pathname.startsWith('/site/') ||
		pathname.startsWith('/favicon') ||
		pathname.startsWith('/images/') ||
		pathname.startsWith('/.well-known/')
	) {
		return true;
	}
	if (STATIC_ASSET_EXTENSIONS.test(pathname)) return true;

	const method = safeTrim(event?.request?.method).toUpperCase();
	if (method && method !== 'GET' && method !== 'HEAD') return true;

	return false;
}

async function defaultLoadUserProfile(cookies) {
	if (!cookies?.get?.('sb_session')) return null;
	try {
		const { getActivityClient } = await import('#lib/server/activities');
		const { user, supabase } = await getActivityClient(cookies);
		if (!user?.id || !supabase) return null;
		const { data } = await supabase
			.from('profiles')
			.select('metadata')
			.eq('user_id', user.id)
			.maybeSingle();
		return data?.metadata ?? null;
	} catch {
		return null;
	}
}

export async function resolveVisitorLocation(
	event,
	{ loadUserProfile = /** @type {((cookies: any) => Promise<any>) | undefined} */ (undefined) } = {}
) {
	const profileLoader = loadUserProfile ?? defaultLoadUserProfile;
	const metadata = await profileLoader(event?.cookies);
	const savedLocation = parseProfileLocation(metadata);
	if (savedLocation) return savedLocation;

	return readNetworkLocation(event?.request?.headers);
}

export function buildGroupsDirectoryHref(visitorLocation) {
	if (!visitorLocation || typeof visitorLocation !== 'object') return '/groups';
	const country = normalizeCountryCode(visitorLocation.country);
	const stateRegion = normalizeRegionCode(
		country,
		visitorLocation.stateRegion || visitorLocation.region || ''
	);
	const params = new URLSearchParams();
	if (country) params.set('country', country);
	if (stateRegion) params.set('state_region', stateRegion);
	const qs = params.toString();
	return qs ? `/groups?${qs}` : '/groups';
}
