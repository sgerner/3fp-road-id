const AMBIGUOUS_REGION_STOP_WORDS = new Set(['in', 'or', 'on']);

export const SEARCH_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'for',
	'from',
	'in',
	'is',
	'of',
	'on',
	'or',
	'the',
	'to',
	'with'
]);

export const SEARCH_SYNONYM_GROUPS = [
	['bike', 'bikes', 'bicycle', 'bicycles', 'biking', 'bicycling', 'cycling', 'cyclist', 'cyclists'],
	['ride', 'rides', 'riding', 'rider', 'riders', 'peloton'],
	[
		'club',
		'clubs',
		'group',
		'groups',
		'community',
		'communities',
		'team',
		'teams',
		'coalition',
		'alliance'
	],
	[
		'advocacy',
		'advocate',
		'advocates',
		'activism',
		'activist',
		'activists',
		'campaign',
		'campaigns',
		'coalition',
		'nonprofit'
	],
	['mountain', 'mtb', 'trail', 'trails', 'singletrack'],
	['commute', 'commuter', 'commuters', 'commuting', 'transportation', 'transit'],
	['gravel', 'bikepacking', 'adventure'],
	['road', 'touring', 'paceline'],
	['race', 'races', 'racing', 'racer', 'racers', 'competitive'],
	['social', 'casual', 'recreational', 'cruiser'],
	['women', 'womens', 'femme'],
	['youth', 'kids', 'family', 'families', 'junior', 'juniors'],
	['coop', 'cooperative', 'collective', 'workshop'],
	['st', 'saint']
];

export const US_STATES = {
	AL: 'Alabama',
	AK: 'Alaska',
	AZ: 'Arizona',
	AR: 'Arkansas',
	CA: 'California',
	CO: 'Colorado',
	CT: 'Connecticut',
	DE: 'Delaware',
	FL: 'Florida',
	GA: 'Georgia',
	HI: 'Hawaii',
	ID: 'Idaho',
	IL: 'Illinois',
	IN: 'Indiana',
	IA: 'Iowa',
	KS: 'Kansas',
	KY: 'Kentucky',
	LA: 'Louisiana',
	ME: 'Maine',
	MD: 'Maryland',
	MA: 'Massachusetts',
	MI: 'Michigan',
	MN: 'Minnesota',
	MS: 'Mississippi',
	MO: 'Missouri',
	MT: 'Montana',
	NE: 'Nebraska',
	NV: 'Nevada',
	NH: 'New Hampshire',
	NJ: 'New Jersey',
	NM: 'New Mexico',
	NY: 'New York',
	NC: 'North Carolina',
	ND: 'North Dakota',
	OH: 'Ohio',
	OK: 'Oklahoma',
	OR: 'Oregon',
	PA: 'Pennsylvania',
	RI: 'Rhode Island',
	SC: 'South Carolina',
	SD: 'South Dakota',
	TN: 'Tennessee',
	TX: 'Texas',
	UT: 'Utah',
	VT: 'Vermont',
	VA: 'Virginia',
	WA: 'Washington',
	WV: 'West Virginia',
	WI: 'Wisconsin',
	WY: 'Wyoming',
	DC: 'District of Columbia',
	PR: 'Puerto Rico'
};

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

export const DEFAULT_POSTAL_RADIUS_MILES = 25;
export const DEFAULT_POSTAL_GEOCODE_TIMEOUT_MS = 1800;

const MAX_TOKEN_VARIANTS = 12;

const US_ZIP_RE = /^(\d{5})(?:-(\d{4}))?$/;
const CA_POSTAL_RE = /^([a-z]\d[a-z])[ -]?(\d[a-z]\d)$/i;
const GB_POSTCODE_RE = /^([a-z]{1,2}\d[a-z\d]?)[ -]?(\d[a-z]{2})$/i;
const AU_NZ_POSTCODE_RE = /^\d{4}$/;

function stripDiacritics(text) {
	return (text || '')
		.toString()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSearchText(text) {
	return stripDiacritics(text)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const SEARCH_SYNONYMS = (() => {
	const map = new Map();
	for (const group of SEARCH_SYNONYM_GROUPS) {
		const normalized = group.map((term) => normalizeSearchText(term)).filter(Boolean);
		for (const term of normalized) {
			if (!map.has(term)) map.set(term, new Set());
			const set = map.get(term);
			for (const candidate of normalized) set.add(candidate);
		}
	}
	return map;
})();

function getRegionMaps(country) {
	const cn = (country || '').toString().trim().toUpperCase();
	const maps = [];
	if (!cn || cn === 'US') maps.push(US_STATES);
	if (!cn || cn === 'CA') maps.push(CA_PROVINCES);
	if (!cn || cn === 'AU') maps.push(AU_STATES);
	return maps;
}

export function expandStateCandidates(country, input) {
	const val = (input || '').toString().trim();
	if (!val) return [];
	const up = val.toUpperCase();
	const list = [];
	function add(candidate) {
		if (candidate && !list.includes(candidate)) list.push(candidate);
	}
	add(val);
	add(up);
	const tcase = val.replace(
		/\w\S*/g,
		(word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
	);
	add(tcase);
	const maps = getRegionMaps(country);
	for (const map of maps) {
		if (map[up]) {
			add(map[up]);
			add(map[up].toUpperCase());
		}
		for (const [code, name] of Object.entries(map)) {
			if (name.toLowerCase() === val.toLowerCase()) {
				add(code);
				add(code.toUpperCase());
			}
		}
	}
	return list;
}

function dedupeCaseInsensitive(values) {
	const seen = new Set();
	const out = [];
	for (const value of values) {
		const trimmed = (value || '').toString().trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

function extractRawTokens(text) {
	return stripDiacritics(text)
		.replace(/[^A-Za-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function shouldKeepRawToken(rawToken, isStandalone) {
	const lower = rawToken.toLowerCase();
	if (AMBIGUOUS_REGION_STOP_WORDS.has(lower)) {
		return isStandalone || rawToken === rawToken.toUpperCase();
	}
	return !SEARCH_STOP_WORDS.has(lower);
}

export function tokenizeSearch(text) {
	const rawTokens = extractRawTokens(text);
	const isStandalone = rawTokens.length === 1;
	return rawTokens
		.filter((rawToken) => shouldKeepRawToken(rawToken, isStandalone))
		.map((rawToken) => rawToken.toLowerCase());
}

export function resolveStandaloneStateCandidates(country, input) {
	const rawTokens = extractRawTokens(input);
	if (rawTokens.length !== 1) return [];
	const code = rawTokens[0].toUpperCase();
	const maps = getRegionMaps(country);
	const isKnownCode = maps.some((map) => Object.prototype.hasOwnProperty.call(map, code));
	if (!isKnownCode) return [];
	return dedupeCaseInsensitive(expandStateCandidates(country, code));
}

function formatWebsearchTerm(term) {
	const cleaned = (term || '').toString().trim().toLowerCase();
	if (!cleaned) return '';
	if (cleaned === 'or' || /[\s-]/.test(cleaned)) {
		return `"${cleaned.replace(/"/g, '')}"`;
	}
	return cleaned;
}

function formatVariantExpression(variants) {
	const formatted = [];
	const seen = new Set();
	for (const variant of variants) {
		const normalized = (variant || '').toString().trim().toLowerCase();
		if (normalized.length < 2 || seen.has(normalized)) continue;
		seen.add(normalized);
		const term = formatWebsearchTerm(normalized);
		if (term) formatted.push(term);
		if (formatted.length >= MAX_TOKEN_VARIANTS) break;
	}
	if (!formatted.length) return '';
	if (formatted.length === 1) return formatted[0];
	return `(${formatted.join(' OR ')})`;
}

export function expandTokenVariants(token, { country = '' } = {}) {
	const normalized = normalizeSearchText(token);
	if (!normalized) return [];
	const out = new Set([normalized]);
	for (const synonym of SEARCH_SYNONYMS.get(normalized) || []) {
		out.add(synonym);
	}
	for (const stateCandidate of expandStateCandidates(country, normalized)) {
		const normalizedCandidate = normalizeSearchText(stateCandidate);
		if (normalizedCandidate) out.add(normalizedCandidate);
	}
	return Array.from(out).filter(Boolean);
}

function buildMultiWordRegionIndex(country) {
	const entries = new Map();
	for (const map of getRegionMaps(country)) {
		for (const [code, name] of Object.entries(map)) {
			const normalizedName = normalizeSearchText(name);
			if (!normalizedName.includes(' ')) continue;
			if (!entries.has(normalizedName)) {
				entries.set(normalizedName, new Set([normalizedName]));
			}
			entries.get(normalizedName).add(code.toLowerCase());
		}
	}
	return Array.from(entries.entries())
		.map(([phrase, variants]) => ({
			words: phrase.split(' '),
			variants: Array.from(variants)
		}))
		.sort((a, b) => b.words.length - a.words.length);
}

function buildPostalQueryExpression(input, country = '') {
	const trimmed = (input || '').toString().trim();
	if (!trimmed) return '';
	const cn = (country || '').toString().trim().toUpperCase();

	const usMatch = trimmed.match(US_ZIP_RE);
	if (usMatch && (!cn || cn === 'US' || cn === 'MX')) {
		const [, zip5, plus4] = usMatch;
		if (plus4) {
			return formatVariantExpression([`${zip5}-${plus4}`, zip5]);
		}
		return zip5;
	}

	const caMatch = trimmed.match(CA_POSTAL_RE);
	if (caMatch && (!cn || cn === 'CA')) {
		const part1 = caMatch[1].toLowerCase();
		const part2 = caMatch[2].toLowerCase();
		const compact = `${part1}${part2}`;
		const spaced = `${part1} ${part2}`;
		return trimmed.includes(' ') || trimmed.includes('-')
			? formatVariantExpression([spaced, compact])
			: formatVariantExpression([compact, spaced]);
	}

	const gbMatch = trimmed.match(GB_POSTCODE_RE);
	if (gbMatch && (!cn || cn === 'GB')) {
		const outward = gbMatch[1].toLowerCase();
		const inward = gbMatch[2].toLowerCase();
		const compact = `${outward}${inward}`;
		const spaced = `${outward} ${inward}`;
		return trimmed.includes(' ')
			? formatVariantExpression([spaced, compact])
			: formatVariantExpression([compact, spaced]);
	}

	return '';
}

export function buildSearchQueryText(input, { country = '' } = {}) {
	const postalExpression = buildPostalQueryExpression(input, country);
	if (postalExpression) return postalExpression;

	const rawTokens = extractRawTokens(input);
	if (!rawTokens.length) {
		const fallback = normalizeSearchText(input);
		return fallback ? formatWebsearchTerm(fallback) : '';
	}

	const isStandalone = rawTokens.length === 1;
	const lowerTokens = rawTokens.map((token) => token.toLowerCase());
	const multiWordRegions = rawTokens.length > 1 ? buildMultiWordRegionIndex(country) : [];

	const expressions = [];
	let index = 0;
	while (index < rawTokens.length) {
		let matchedPhrase = null;
		for (const entry of multiWordRegions) {
			if (index + entry.words.length > rawTokens.length) continue;
			let matches = true;
			for (let offset = 0; offset < entry.words.length; offset += 1) {
				if (lowerTokens[index + offset] !== entry.words[offset]) {
					matches = false;
					break;
				}
			}
			if (matches) {
				matchedPhrase = entry;
				break;
			}
		}

		if (matchedPhrase) {
			const expr = formatVariantExpression(matchedPhrase.variants);
			if (expr) expressions.push(expr);
			index += matchedPhrase.words.length;
			continue;
		}

		const rawToken = rawTokens[index];
		if (shouldKeepRawToken(rawToken, isStandalone)) {
			const variants = expandTokenVariants(rawToken, { country });
			const expr = formatVariantExpression(variants);
			if (expr) expressions.push(expr);
		}
		index += 1;
	}

	if (!expressions.length) {
		const fallback = normalizeSearchText(input);
		return fallback ? formatWebsearchTerm(fallback) : '';
	}
	return expressions.join(' ');
}

export function isPostalCodeQuery(query, country = '') {
	const trimmed = (query || '').toString().trim();
	if (!trimmed) return false;
	const cn = (country || '').toString().trim().toUpperCase();

	if (US_ZIP_RE.test(trimmed) && (!cn || cn === 'US' || cn === 'MX')) return true;
	if (CA_POSTAL_RE.test(trimmed) && (!cn || cn === 'CA')) return true;
	if (GB_POSTCODE_RE.test(trimmed) && (!cn || cn === 'GB')) return true;
	if (AU_NZ_POSTCODE_RE.test(trimmed) && (!cn || cn === 'AU' || cn === 'NZ')) return true;
	return false;
}

export function inferPostalCountryCodes(query, country = '') {
	const cn = (country || '').toString().trim().toUpperCase();
	if (cn && cn !== 'OTHER') return cn.toLowerCase();

	const trimmed = (query || '').toString().trim();
	if (US_ZIP_RE.test(trimmed)) return 'us';
	if (CA_POSTAL_RE.test(trimmed)) return 'ca';
	if (GB_POSTCODE_RE.test(trimmed)) return 'gb';
	return '';
}

export function buildCoordinateBounds(
	latitude,
	longitude,
	radiusMiles = DEFAULT_POSTAL_RADIUS_MILES
) {
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	const safeRadius = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 25;
	const latDelta = safeRadius / 69;
	const cosLat = Math.max(Math.abs(Math.cos((latitude * Math.PI) / 180)), 0.01);
	const lngDelta = safeRadius / (69 * cosLat);

	return {
		latitude,
		longitude,
		radiusMiles: safeRadius,
		minLat: Math.max(-90, latitude - latDelta),
		maxLat: Math.min(90, latitude + latDelta),
		minLng: Math.max(-180, longitude - lngDelta),
		maxLng: Math.min(180, longitude + lngDelta)
	};
}

export async function resolvePostalGeocodeBounds(
	query,
	{
		country = '',
		geocode = null,
		fetchImpl = fetch,
		timeoutMs = DEFAULT_POSTAL_GEOCODE_TIMEOUT_MS,
		radiusMiles = DEFAULT_POSTAL_RADIUS_MILES
	} = {}
) {
	const trimmed = (query || '').toString().trim();
	if (!isPostalCodeQuery(trimmed, country)) return null;

	const geocodeFn =
		typeof geocode === 'function'
			? geocode
			: await import('./geocoding.js').then((mod) => mod.searchGeocode).catch(() => null);
	if (typeof geocodeFn !== 'function') return null;

	const controller = new AbortController();
	let timer = null;
	const timedFetch = (input, init = {}) =>
		fetchImpl(input, {
			...init,
			signal: init.signal || controller.signal
		});

	const lookupPromise = (async () => {
		const countryCodes = inferPostalCountryCodes(trimmed, country);
		let matches = await geocodeFn(trimmed, {
			limit: 1,
			fetchImpl: timedFetch,
			countryCodes
		});
		if (
			(!Array.isArray(matches) || !matches.length) &&
			US_ZIP_RE.test(trimmed) &&
			(!country || country.toUpperCase() === 'US')
		) {
			const zip5 = trimmed.slice(0, 5);
			matches = await geocodeFn(`${zip5}, USA`, {
				limit: 1,
				fetchImpl: timedFetch,
				countryCodes: 'us'
			});
		}
		const first = Array.isArray(matches) ? matches[0] : null;
		if (
			!first ||
			typeof first.latitude !== 'number' ||
			!Number.isFinite(first.latitude) ||
			typeof first.longitude !== 'number' ||
			!Number.isFinite(first.longitude)
		) {
			return null;
		}
		return buildCoordinateBounds(first.latitude, first.longitude, radiusMiles);
	})().catch(() => null);

	const timeoutPromise = new Promise((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve(null);
		}, timeoutMs);
		timer?.unref?.();
	});

	try {
		return await Promise.race([lookupPromise, timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export function applyGroupSearchFilter(
	queryBuilder,
	{ q = '', country = '', postalBounds = null } = {}
) {
	let query = queryBuilder;
	const trimmed = (q || '').toString().trim();
	if (!trimmed) return query;

	if (postalBounds) {
		return query
			.not('latitude', 'is', null)
			.not('longitude', 'is', null)
			.gte('latitude', postalBounds.minLat)
			.lte('latitude', postalBounds.maxLat)
			.gte('longitude', postalBounds.minLng)
			.lte('longitude', postalBounds.maxLng);
	}

	const standaloneStateCandidates = resolveStandaloneStateCandidates(country, trimmed);
	if (standaloneStateCandidates.length) {
		const ors = standaloneStateCandidates
			.map((candidate) => `state_region.ilike.${candidate}`)
			.join(',');
		return query.or(ors);
	}

	const searchQuery = buildSearchQueryText(trimmed, { country });
	if (searchQuery) {
		query = query.textSearch('search_document', searchQuery, {
			type: 'websearch',
			config: 'simple'
		});
	}
	return query;
}
