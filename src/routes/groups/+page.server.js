import { supabase } from '#lib/supabaseClient';
import { searchGeocode } from '#lib/server/geocoding';
import {
	applyGroupSearchFilter,
	expandStateCandidates,
	isPostalCodeQuery,
	resolvePostalGeocodeBounds
} from '#lib/server/groupSearch';

const SEARCH_COLUMN_LIST =
	'id, slug, name, tagline, description, membership_info, service_area_description, city, state_region, country, logo_url, cover_photo_url, latitude, longitude';

export const load = async ({ url, fetch }) => {
	const q = (url.searchParams.get('q') || '').trim();
	const country = (url.searchParams.get('country') || '').trim().toUpperCase();
	const state_region = (url.searchParams.get('state_region') || '').trim();
	const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
	const limit = parseInt(url.searchParams.get('limit') || '24', 10) || 24;

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

	function applyCommonFilters(qBuilder, { includeSearch = true, postalBounds = null } = {}) {
		let query = qBuilder;
		if (includeSearch && q) {
			query = applyGroupSearchFilter(query, { q, country, postalBounds });
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

	function buildListQuery({ postalBounds = null } = {}) {
		const query = supabase
			.from('groups')
			.select(SEARCH_COLUMN_LIST, { count: 'exact' })
			.order('name')
			.range((page - 1) * limit, page * limit - 1);
		return applyCommonFilters(query, { includeSearch: true, postalBounds });
	}

	function buildMapChunkQuery(from, to, includeCount = false, postalBounds = null) {
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
		if (hasActiveFilters) {
			query = applyCommonFilters(query, { includeSearch: true, postalBounds });
		}
		return query;
	}

	async function fetchAllMapPoints(postalBounds = null) {
		const pageSize = 1000;
		let from = 0;
		let total = null;
		const points = [];
		while (true) {
			const includeCount = total === null;
			const { data, error, count } = await buildMapChunkQuery(
				from,
				from + pageSize - 1,
				includeCount,
				postalBounds
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

	let [groupsRes, mapRes, facetResults] = await Promise.all([
		buildListQuery(),
		fetchAllMapPoints(),
		fetchFacets()
	]);

	if (
		q &&
		!groupsRes.error &&
		(groupsRes.count ?? (groupsRes.data || []).length) === 0 &&
		isPostalCodeQuery(q, country)
	) {
		const postalBounds = await resolvePostalGeocodeBounds(q, {
			country,
			geocode: searchGeocode,
			fetchImpl: fetch
		});
		if (postalBounds) {
			[groupsRes, mapRes] = await Promise.all([
				buildListQuery({ postalBounds }),
				fetchAllMapPoints(postalBounds)
			]);
		}
	}

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
