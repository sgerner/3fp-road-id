import { supabase } from '$lib/supabaseClient';

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
		// Empty intersection, return 0 results
		const [levels, types, af, rd] = await Promise.all([
			supabase.from('skill_levels').select('id, name').order('name'),
			supabase.from('group_types').select('id, name').order('name'),
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

	function applyCommonFilters(qBuilder) {
		let query = qBuilder;
		if (q) {
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
		if (filterIds !== null) {
			query = query.in('id', filterIds);
		}
		// Assuming we only want published ones (or you could comment out if previously not used)
		// query = query.eq('is_published', true);
		return query;
	}

	let listQuery = supabase
		.from('groups')
		.select(
			'id, slug, name, tagline, description, membership_info, service_area_description, city, state_region, country, logo_url, cover_photo_url, latitude, longitude',
			{ count: 'exact' }
		)
		.order('name')
		.range((page - 1) * limit, page * limit - 1);

	listQuery = applyCommonFilters(listQuery);

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
		if (hasActiveFilters) query = applyCommonFilters(query);
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

	const [groupsRes, mapRes, levelsRes, typesAllRes, afRes, rdRes] = await Promise.all([
		listQuery,
		fetchAllMapPoints(),
		supabase.from('skill_levels').select('id, name').order('name'),
		supabase.from('group_types').select('id, name').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name')
	]);

	let groups = groupsRes.data || [];
	const totalGroups = groupsRes.count || 0;
	let mapPoints = mapRes.data || [];

	let group_types_map = {};
	if (groups.length) {
		const ids = groups.map((g) => g.id);
		const { data: gxRes } = await supabase
			.from('group_x_group_types')
			.select('group_id, group_type_id')
			.in('group_id', ids);
		const typeNameById = Object.fromEntries((typesAllRes.data || []).map((t) => [t.id, t.name]));
		const map = {};
		for (const row of gxRes || []) {
			const arr = map[row.group_id] || (map[row.group_id] = []);
			const nm = typeNameById[row.group_type_id];
			if (nm) arr.push(nm);
		}
		group_types_map = map;
	}

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
