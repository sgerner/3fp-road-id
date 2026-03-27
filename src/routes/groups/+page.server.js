import { supabase } from '$lib/supabaseClient';

const SEARCH_STOP_WORDS = new Set([
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

const SEARCH_SYNONYM_GROUPS = [
	['bike', 'bikes', 'bicycle', 'bicycles', 'biking', 'cycling', 'cyclist', 'cyclists'],
	['ride', 'rides', 'riding', 'rider', 'riders', 'peloton'],
	['club', 'clubs', 'group', 'groups', 'community', 'communities', 'team', 'teams'],
	['advocacy', 'advocate', 'advocates', 'activism', 'campaign'],
	['mountain', 'mtb', 'trail'],
	['road', 'gravel', 'commute', 'commuter', 'commuting']
];

const SEARCH_TEXT_FIELDS = [
	'name',
	'tagline',
	'description',
	'membership_info',
	'service_area_description',
	'city',
	'state_region',
	'country'
];

const SEARCH_COLUMN_LIST =
	'id, slug, name, tagline, description, membership_info, service_area_description, city, state_region, country, logo_url, cover_photo_url, latitude, longitude';

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

function normalizeSearchText(text) {
	return (text || '')
		.toString()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function singularizeToken(token) {
	if (!token) return '';
	if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.length > 3 && token.endsWith('es')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
	return token;
}

function pluralizeToken(token) {
	if (!token) return '';
	if (token.endsWith('y') && token.length > 2) return `${token.slice(0, -1)}ies`;
	if (token.endsWith('s')) return token;
	return `${token}s`;
}

function tokenizeSearch(text) {
	return normalizeSearchText(text)
		.split(' ')
		.map((token) => token.trim())
		.filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

function expandTokenVariants(token) {
	const normalized = normalizeSearchText(token);
	if (!normalized) return [normalized];
	const out = new Set([normalized]);
	const singular = singularizeToken(normalized);
	const plural = pluralizeToken(normalized);
	if (singular) out.add(singular);
	if (plural) out.add(plural);
	for (const key of [normalized, singular, plural]) {
		if (!key) continue;
		for (const synonym of SEARCH_SYNONYMS.get(key) || []) out.add(synonym);
	}
	return Array.from(out).filter(Boolean);
}

function levenshteinDistance(a, b) {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const prev = new Array(b.length + 1);
	const curr = new Array(b.length + 1);
	for (let j = 0; j <= b.length; j += 1) prev[j] = j;
	for (let i = 1; i <= a.length; i += 1) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
	}
	return prev[b.length];
}

function fuzzySimilarity(a, b) {
	if (!a || !b) return 0;
	const maxLen = Math.max(a.length, b.length);
	if (!maxLen) return 0;
	const distance = levenshteinDistance(a, b);
	return 1 - distance / maxLen;
}

function bestFuzzyVariantScore(variants, targetTokens) {
	let best = 0;
	for (const variant of variants) {
		if (!variant || variant.length < 3) continue;
		for (const token of targetTokens) {
			if (!token || token.length < 3) continue;
			if (Math.abs(token.length - variant.length) > 2) continue;
			if (token[0] !== variant[0] && token.slice(0, 2) !== variant.slice(0, 2)) continue;
			const sim = fuzzySimilarity(variant, token);
			if (sim > best) best = sim;
			if (best >= 0.96) return best;
		}
	}
	return best;
}

function buildGroupSearchIndex(group) {
	const combined = normalizeSearchText(
		SEARCH_TEXT_FIELDS.map((field) => group?.[field] || '').join(' ')
	);
	const tokens = tokenizeSearch(combined);
	const tokenSet = new Set(tokens);
	const nameTokens = tokenizeSearch(group?.name || '');
	const nameTokenSet = new Set(nameTokens);
	return { group, combined, tokens, tokenSet, nameTokenSet };
}

function scoreGroupIndex(index, query) {
	if (!query.tokens.length) return 0;
	let score = 0;
	let matched = 0;
	let matchedInName = 0;

	if (query.normalizedPhrase && index.combined.includes(query.normalizedPhrase)) score += 1.25;

	for (let i = 0; i < query.tokens.length; i += 1) {
		const token = query.tokens[i];
		const variants = query.variantsByToken[i];
		const hasExactInName = index.nameTokenSet.has(token);
		const hasExact = index.tokenSet.has(token);
		const hasVariantInName = variants.some((value) => index.nameTokenSet.has(value));
		const hasVariant = variants.some((value) => index.tokenSet.has(value));

		if (hasExactInName) {
			score += 1.5;
			matched += 1;
			matchedInName += 1;
			continue;
		}
		if (hasExact) {
			score += 1.2;
			matched += 1;
			continue;
		}
		if (hasVariantInName) {
			score += 1.0;
			matched += 1;
			matchedInName += 1;
			continue;
		}
		if (hasVariant) {
			score += 0.85;
			matched += 1;
			continue;
		}

		const fuzzyScore = bestFuzzyVariantScore(variants, index.tokens);
		if (fuzzyScore >= 0.78) {
			score += 0.8 * fuzzyScore;
			matched += 1;
		}
	}

	if (matched < query.requiredMatches) return 0;
	if (matched === query.tokens.length) score += 1.1;
	if (matchedInName >= Math.min(query.tokens.length, query.requiredMatches)) score += 0.45;
	return score;
}

function buildFuzzyQuery(q) {
	const normalizedPhrase = normalizeSearchText(q);
	const tokens = tokenizeSearch(normalizedPhrase);
	const variantsByToken = tokens.map((token) => expandTokenVariants(token));
	const requiredMatches =
		tokens.length <= 2 ? tokens.length : Math.max(2, Math.ceil(tokens.length * 0.67));
	return { normalizedPhrase, tokens, variantsByToken, requiredMatches };
}

function fuzzySearchGroups(groups, q) {
	const query = buildFuzzyQuery(q);
	if (!query.tokens.length) {
		return (groups || []).map((group) => ({ group, score: 0 }));
	}
	const scored = [];
	for (const group of groups || []) {
		const index = buildGroupSearchIndex(group);
		const score = scoreGroupIndex(index, query);
		if (score <= 0) continue;
		scored.push({ group, score });
	}
	return scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return (a.group?.name || '').localeCompare(b.group?.name || '');
	});
}

export const load = async ({ url }) => {
	const q = (url.searchParams.get('q') || '').trim();
	const country = (url.searchParams.get('country') || '').trim().toUpperCase();
	const state_region = (url.searchParams.get('state_region') || '').trim();
	const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
	const limit = parseInt(url.searchParams.get('limit') || '24', 10) || 24;

	// Flexible state/region candidates (abbrev <-> full names)
	const US_STATES = {
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
		DC: 'District of Columbia'
	};
	const CA_PROVINCES = {
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
	const AU_STATES = {
		ACT: 'Australian Capital Territory',
		NSW: 'New South Wales',
		NT: 'Northern Territory',
		QLD: 'Queensland',
		SA: 'South Australia',
		TAS: 'Tasmania',
		VIC: 'Victoria',
		WA: 'Western Australia'
	};

	function expandStateCandidates(cn, input) {
		const val = (input || '').trim();
		if (!val) return [];
		const up = val.toUpperCase();
		const list = [];
		function add(x) {
			if (x && !list.includes(x)) list.push(x);
		}
		add(val);
		add(up);
		const tcase = val.replace(
			/\w\S*/g,
			(w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
		);
		add(tcase);
		const maps = [];
		if (!cn || cn === 'US') maps.push(US_STATES);
		if (!cn || cn === 'CA') maps.push(CA_PROVINCES);
		if (!cn || cn === 'AU') maps.push(AU_STATES);
		for (const MAP of maps) {
			if (MAP[up]) (add(MAP[up]), add(MAP[up].toUpperCase()));
			for (const [code, name] of Object.entries(MAP)) {
				if (name.toLowerCase() === val.toLowerCase()) (add(code), add(code.toUpperCase()));
			}
		}
		return list;
	}

	const skill_level_ids = url.searchParams
		.getAll('skill_level_ids')
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
	const audience_focus_ids = url.searchParams
		.getAll('audience_focus_ids')
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
	const riding_discipline_ids = url.searchParams
		.getAll('riding_discipline_ids')
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
	const group_type_ids = url.searchParams
		.getAll('group_type_ids')
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
	const hasSearchQuery = Boolean(q);
	const hasActiveFilters = Boolean(
		q ||
		country ||
		state_region ||
		skill_level_ids.length ||
		group_type_ids.length ||
		audience_focus_ids.length ||
		riding_discipline_ids.length
	);

	let filterIds = null;
	async function intersectFilter(table, col, vals) {
		if (!vals.length) return;
		const { data, error } = await supabase.from(table).select('group_id').in(col, vals);
		if (error) return;
		const ids = Array.from(new Set((data || []).map((m) => m.group_id)));
		if (filterIds === null) {
			filterIds = ids;
		} else {
			const set = new Set(ids);
			filterIds = filterIds.filter((id) => set.has(id));
		}
	}

	await intersectFilter('group_x_skill_levels', 'skill_level_id', skill_level_ids);
	await intersectFilter('group_x_group_types', 'group_type_id', group_type_ids);
	await intersectFilter('group_x_audience_focuses', 'audience_focus_id', audience_focus_ids);
	await intersectFilter(
		'group_x_riding_disciplines',
		'riding_discipline_id',
		riding_discipline_ids
	);

	const commonContext = {
		q,
		country,
		state_region,
		skill_level_ids,
		group_type_ids,
		audience_focus_ids,
		riding_discipline_ids,
		page,
		limit
	};

	if (filterIds !== null && filterIds.length === 0) {
		const [levels, types, af, rd] = await Promise.all([
			supabase.from('skill_levels').select('id, name').order('name'),
			supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
			supabase.from('audience_focuses').select('id, name').order('name'),
			supabase.from('riding_disciplines').select('id, name').order('name')
		]);
		return {
			groups: [],
			mapPoints: [],
			totalGroups: 0,
			error: null,
			filters: commonContext,
			skill_levels: levels.data || [],
			group_types: types.data || [],
			audience_focuses: af.data || [],
			riding_disciplines: rd.data || [],
			group_types_map: {}
		};
	}

	function applyCommonFilters(qBuilder, { includeSearch = true } = {}) {
		let query = qBuilder;
		if (includeSearch && q) {
			const like = `%${q}%`;
			query = query.or(
				[
					`name.ilike.${like}`,
					`tagline.ilike.${like}`,
					`description.ilike.${like}`,
					`membership_info.ilike.${like}`,
					`service_area_description.ilike.${like}`,
					`city.ilike.${like}`,
					`state_region.ilike.${like}`,
					`country.ilike.${like}`
				].join(',')
			);
		}
		if (country) query = query.eq('country', country);
		if (state_region) {
			const candidates = expandStateCandidates(country, state_region).map((t) => `%${t}%`);
			if (candidates.length) {
				const ors = candidates.map((c) => `state_region.ilike.${c}`).join(',');
				query = query.or(ors);
			}
		}
		if (filterIds !== null) query = query.in('id', filterIds);
		return query;
	}

	function fetchFacets() {
		return Promise.all([
			supabase.from('skill_levels').select('id, name').order('name'),
			supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
			supabase.from('audience_focuses').select('id, name').order('name'),
			supabase.from('riding_disciplines').select('id, name').order('name')
		]);
	}

	async function fetchGroupTypesMap(groups, allTypes) {
		if (!groups.length) return {};
		const ids = groups.map((g) => g.id);
		const { data: gxRes } = await supabase
			.from('group_x_group_types')
			.select('group_id, group_type_id')
			.in('group_id', ids);
		const typeNameById = Object.fromEntries((allTypes || []).map((t) => [t.id, t.name]));
		const map = {};
		for (const row of gxRes || []) {
			const arr = map[row.group_id] || (map[row.group_id] = []);
			const nm = typeNameById[row.group_type_id];
			if (nm) arr.push(nm);
		}
		return map;
	}

	if (hasSearchQuery) {
		function buildSearchChunkQuery(from, to) {
			let query = supabase.from('groups').select(SEARCH_COLUMN_LIST).order('id').range(from, to);
			query = applyCommonFilters(query, { includeSearch: false });
			return query;
		}

		async function fetchAllSearchCandidates() {
			const pageSize = 1000;
			let from = 0;
			const rows = [];
			while (true) {
				const { data, error } = await buildSearchChunkQuery(from, from + pageSize - 1);
				if (error) return { data: [], error };
				const chunk = data || [];
				rows.push(...chunk);
				if (chunk.length < pageSize) break;
				from += pageSize;
				if (rows.length >= 15000) break;
			}
			return { data: rows, error: null };
		}

		const [candidatesRes, facetResults] = await Promise.all([
			fetchAllSearchCandidates(),
			fetchFacets()
		]);
		const [levelsRes, typesAllRes, afRes, rdRes] = facetResults;

		const scored = fuzzySearchGroups(candidatesRes.data || [], q);
		const totalGroups = scored.length;
		const start = Math.max(0, (page - 1) * limit);
		const end = start + limit;
		const groups = scored.slice(start, end).map((entry) => entry.group);
		const mapPoints = scored
			.map((entry) => entry.group)
			.filter((group) => Number.isFinite(group.latitude) && Number.isFinite(group.longitude))
			.map((group) => ({
				id: group.id,
				slug: group.slug,
				name: group.name,
				latitude: group.latitude,
				longitude: group.longitude,
				city: group.city,
				state_region: group.state_region,
				country: group.country
			}));

		const group_types_map = await fetchGroupTypesMap(groups, typesAllRes.data || []);

		return {
			groups,
			mapPoints,
			totalGroups,
			error: candidatesRes.error?.message || null,
			filters: commonContext,
			skill_levels: levelsRes.data || [],
			group_types_map,
			group_types: typesAllRes.data || [],
			audience_focuses: afRes.data || [],
			riding_disciplines: rdRes.data || []
		};
	}

	let listQuery = supabase
		.from('groups')
		.select(SEARCH_COLUMN_LIST, { count: 'exact' })
		.order('name')
		.range((page - 1) * limit, page * limit - 1);

	listQuery = applyCommonFilters(listQuery, { includeSearch: true });

	function buildMapChunkQuery(from, to, includeCount = false) {
		let query = supabase
			.from('groups')
			.select(
				'id, slug, name, latitude, longitude, city, state_region, country',
				includeCount ? { count: 'exact' } : undefined
			)
			.not('latitude', 'is', null)
			.not('longitude', 'is', null)
			.order('id')
			.range(from, to);
		if (hasActiveFilters) query = applyCommonFilters(query, { includeSearch: true });
		return query;
	}

	async function fetchAllMapPoints() {
		const pageSize = 1000;
		let from = 0;
		let total = null;
		const points = [];
		while (true) {
			const includeCount = total === null;
			const { data, error, count } = await buildMapChunkQuery(
				from,
				from + pageSize - 1,
				includeCount
			);
			if (error) return { data: [], error, count: 0 };
			if (includeCount && Number.isFinite(count)) total = count;
			const chunk = data || [];
			points.push(...chunk);
			if (chunk.length < pageSize) break;
			from += pageSize;
			if (Number.isFinite(total) && points.length >= total) break;
		}
		return { data: points, error: null, count: Number.isFinite(total) ? total : points.length };
	}

	const [groupsRes, mapRes, facetResults] = await Promise.all([
		listQuery,
		fetchAllMapPoints(),
		fetchFacets()
	]);
	const [levelsRes, typesAllRes, afRes, rdRes] = facetResults;

	const groups = groupsRes.data || [];
	const totalGroups = groupsRes.count || 0;
	const mapPoints = mapRes.data || [];
	const group_types_map = await fetchGroupTypesMap(groups, typesAllRes.data || []);

	return {
		groups,
		mapPoints,
		totalGroups,
		error: groupsRes.error?.message || mapRes.error?.message || null,
		filters: commonContext,
		skill_levels: levelsRes.data || [],
		group_types_map,
		group_types: typesAllRes.data || [],
		audience_focuses: afRes.data || [],
		riding_disciplines: rdRes.data || []
	};
};
