import { supabase } from '#lib/supabaseClient';
import { searchGeocode } from '#lib/server/geocoding';
import {
	applyGroupSearchFilter,
	isPostalCodeQuery,
	resolvePostalGeocodeBounds
} from '#lib/server/groupSearch';
import { fetchNearbyGroups, resolveGroupsDirectoryScope } from '#lib/server/proximity';
import {
	AU_STATES,
	CA_PROVINCES,
	US_STATES,
	expandRegionCandidates,
	normalizeRegionCode
} from '#lib/server/visitorLocation';

const SEARCH_COLUMN_LIST =
	'id, slug, name, tagline, description, membership_info, service_area_description, city, state_region, country, logo_url, cover_photo_url, latitude, longitude';

function buildStateFilterClauses(country, stateRegion) {
	const trimmed = (stateRegion || '').trim();
	if (!trimmed) return [];

	const normalizedCode = normalizeRegionCode(country, trimmed);
	const isKnownSubdivision = Boolean(
		((!country || country === 'US') && US_STATES[normalizedCode]) ||
		((!country || country === 'CA') && CA_PROVINCES[normalizedCode]) ||
		((!country || country === 'AU') && AU_STATES[normalizedCode])
	);

	if (isKnownSubdivision) {
		// Exact case-insensitive matching for known codes and full names prevents
		// 2-letter codes like 'IA' from matching 'California' or 'VA' from matching 'West Virginia'.
		return expandRegionCandidates(country, trimmed).map(
			(candidate) => `state_region.ilike.${candidate}`
		);
	}

	return [`state_region.ilike.%${trimmed}%`];
}

export const load = async ({ url, fetch, locals, setHeaders }) => {
	const q = (url.searchParams.get('q') || '').trim();
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10) || 24);

	const visitorLocation = locals?.visitorLocation ?? null;
	const scope = resolveGroupsDirectoryScope({ url, visitorLocation });
	const { country, state_region, sort, proximityActive, proximityLabel, proximitySource } = scope;

	if (scope.shouldSetPrivateNoStore) {
		setHeaders({
			'cache-control': 'private, no-store'
		});
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
		sort,
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
			proximityActive,
			proximityLabel,
			proximitySource,
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
			const clauses = buildStateFilterClauses(country, state_region);
			if (clauses.length) {
				query = query.or(clauses.join(','));
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

	async function fetchCatalogOrderIds(postalBounds = null) {
		const pageSize = 1000;
		let from = 0;
		let total = null;
		const rows = [];
		while (true) {
			const includeCount = total === null;
			let query = supabase
				.from('groups')
				.select('id, name', includeCount ? { count: 'exact' } : undefined)
				.order('name')
				.range(from, from + pageSize - 1);
			if (hasActiveFilters) {
				query = applyCommonFilters(query, { includeSearch: true, postalBounds });
			}
			const { data, error, count } = await query;
			if (error) return { data: [], error };
			if (includeCount && Number.isFinite(count)) total = count;
			const chunk = data || [];
			rows.push(...chunk);
			if (chunk.length < pageSize) break;
			from += pageSize;
			if (Number.isFinite(total) && rows.length >= total) break;
		}
		return { data: rows, error: null };
	}

	let nearbyGroupsPromise = null;
	function getNearbyGroups() {
		if (!nearbyGroupsPromise) {
			nearbyGroupsPromise = fetchNearbyGroups(supabase, visitorLocation, {
				maxMiles: 250,
				limit: 5000
			});
		}
		return nearbyGroupsPromise;
	}

	let proximityFallbackToName = false;
	async function fetchProximityOrderedPage({ postalBounds = null } = {}) {
		const [nearbyRes, catalogRes] = await Promise.all([
			getNearbyGroups(),
			fetchCatalogOrderIds(postalBounds)
		]);
		if (nearbyRes.error) {
			proximityFallbackToName = true;
			return buildListQuery({ postalBounds });
		}
		if (catalogRes.error) {
			return { data: [], count: 0, error: catalogRes.error };
		}

		const catalogRows = catalogRes.data || [];
		const catalogIdSet = new Set(catalogRows.map((row) => row.id));
		const nearbyRows = (nearbyRes.data || []).filter((row) => catalogIdSet.has(row.id));
		const nearbyById = new Map(nearbyRows.map((row) => [row.id, row]));

		const orderedIds = [
			...nearbyRows.map((row) => row.id),
			...catalogRows.filter((row) => !nearbyById.has(row.id)).map((row) => row.id)
		];
		const totalCount = orderedIds.length;
		const pageIds = orderedIds.slice((page - 1) * limit, page * limit);
		if (!pageIds.length) {
			return { data: [], count: totalCount, error: null };
		}

		const missingIds = pageIds.filter((id) => !nearbyById.has(id));
		let fetchedById = new Map();
		if (missingIds.length) {
			const { data: missingRows, error: missingErr } = await supabase
				.from('groups')
				.select(SEARCH_COLUMN_LIST)
				.in('id', missingIds);
			if (missingErr) {
				return { data: [], count: totalCount, error: missingErr };
			}
			fetchedById = new Map((missingRows || []).map((row) => [row.id, row]));
		}

		const pageRows = pageIds.map((id) => nearbyById.get(id) || fetchedById.get(id)).filter(Boolean);
		return { data: pageRows, count: totalCount, error: null };
	}

	function fetchListPage({ postalBounds = null } = {}) {
		if (proximityActive) {
			return fetchProximityOrderedPage({ postalBounds });
		}
		return buildListQuery({ postalBounds });
	}

	let [groupsRes, mapRes, facetResults] = await Promise.all([
		fetchListPage(),
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
				fetchListPage({ postalBounds }),
				fetchAllMapPoints(postalBounds)
			]);
		}
	}

	const [levelsRes, typesAllRes, afRes, rdRes] = facetResults;

	const groups = groupsRes.data || [];
	const totalGroups = groupsRes.count || 0;
	const mapPoints = mapRes.data || [];
	const group_types_map = await fetchGroupTypesMap(groups, typesAllRes.data || []);
	const effectiveProximityActive = proximityActive && !proximityFallbackToName;
	const effectiveSort = effectiveProximityActive ? sort : 'name';

	return {
		groups,
		mapPoints,
		totalGroups,
		error: groupsRes.error?.message || mapRes.error?.message || null,
		filters: {
			...commonContext,
			sort: effectiveSort
		},
		proximityActive: effectiveProximityActive,
		proximityLabel: effectiveProximityActive ? proximityLabel : '',
		proximitySource: effectiveProximityActive ? proximitySource : null,
		skill_levels: levelsRes.data || [],
		group_types_map,
		group_types: typesAllRes.data || [],
		audience_focuses: afRes.data || [],
		riding_disciplines: rdRes.data || []
	};
};
