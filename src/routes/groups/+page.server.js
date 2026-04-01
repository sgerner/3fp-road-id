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

function tokenizeSearch(text) {
	return normalizeSearchText(text)
		.split(' ')
		.map((token) => token.trim())
		.filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

function expandTokenVariants(token) {
	const normalized = normalizeSearchText(token);
	if (!normalized) return [];
	const out = new Set([normalized]);
	for (const key of [normalized]) {
		if (!key) continue;
		for (const synonym of SEARCH_SYNONYMS.get(key) || []) out.add(synonym);
	}
	return Array.from(out).filter(Boolean);
}

function buildSearchQueryText(input) {
	const tokens = tokenizeSearch(input);
	if (!tokens.length) return normalizeSearchText(input);
	const tokenExpressions = tokens.map((token) => {
		const variants = expandTokenVariants(token)
			.filter((value) => value.length >= 2)
			.slice(0, 8);
		if (!variants.length) return '';
		if (variants.length === 1) return variants[0];
		return `(${variants.join(' OR ')})`;
	});
	return tokenExpressions.filter(Boolean).join(' ');
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
	const filterRequests = [
		{
			table: 'group_x_skill_levels',
			column: 'skill_level_id',
			values: skill_level_ids
		},
		{
			table: 'group_x_group_types',
			column: 'group_type_id',
			values: group_type_ids
		},
		{
			table: 'group_x_audience_focuses',
			column: 'audience_focus_id',
			values: audience_focus_ids
		},
		{
			table: 'group_x_riding_disciplines',
			column: 'riding_discipline_id',
			values: riding_discipline_ids
		}
	].filter((entry) => entry.values.length > 0);

	if (filterRequests.length) {
		const filterResults = await Promise.all(
			filterRequests.map(async (entry) => {
				const { data, error } = await supabase
					.from(entry.table)
					.select('group_id')
					.in(entry.column, entry.values);
				return { data, error };
			})
		);

		for (const result of filterResults) {
			if (result.error) continue;
			const ids = Array.from(new Set((result.data || []).map((row) => row.group_id)));
			if (filterIds === null) {
				filterIds = ids;
			} else {
				const set = new Set(ids);
				filterIds = filterIds.filter((id) => set.has(id));
			}
		}
	}

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
		query = query.eq('is_published', true);
		if (includeSearch && q) {
			const searchQuery = buildSearchQueryText(q);
			if (searchQuery) {
				query = query.textSearch('search_document', searchQuery, { type: 'websearch' });
			}
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
