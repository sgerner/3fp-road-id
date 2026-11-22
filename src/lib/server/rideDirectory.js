export const RIDES_CHUNK_SIZE = 500;
export const RIDES_SAFETY_CEILING = 2000;
export const RECURRENCE_LOOKUP_BATCH_SIZE = 150;
const MAX_RELATED_SEARCH_IDS = 200;

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function coerceBoolean(value) {
	if (typeof value === 'boolean') return value;
	return TRUTHY_VALUES.has(safeTrim(value).toLowerCase());
}

export function chunkArray(items, chunkSize) {
	const size = Math.max(1, Number(chunkSize) || 1);
	const list = Array.isArray(items) ? items : [];
	const chunks = [];
	for (let index = 0; index < list.length; index += size) {
		chunks.push(list.slice(index, index + size));
	}
	return chunks;
}

export function sanitizeIlikeTerm(rawSearch) {
	return safeTrim(rawSearch)
		.replace(/\p{Cc}/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\\/g, '\\\\')
		.replace(/%/g, '\\%')
		.replace(/_/g, '\\_');
}

export function buildPostgrestQuotedIlikePattern(rawSearch) {
	const escaped = sanitizeIlikeTerm(rawSearch).replace(/"/g, '\\"');
	return `"%${escaped}%"`;
}

export function parseRideListParams(searchParamsInput) {
	const sp =
		searchParamsInput instanceof URLSearchParams
			? searchParamsInput
			: new URLSearchParams(searchParamsInput || '');

	const search = safeTrim(sp.get('search') ?? sp.get('q'));
	const rawDifficulty = safeTrim(sp.get('difficulty'));
	const difficulty = rawDifficulty && rawDifficulty.toLowerCase() !== 'all' ? rawDifficulty : '';
	const hostGroupId = safeTrim(sp.get('host_group_id') ?? sp.get('hostGroupId')) || null;
	const hostParam = safeTrim(sp.get('host')).toLowerCase();
	const needsHost =
		coerceBoolean(sp.get('needs_host') ?? sp.get('needsHost')) ||
		hostParam === 'unclaimed' ||
		hostParam === 'needed';

	const rawLimit = safeTrim(sp.get('limit'));
	let limit = RIDES_SAFETY_CEILING;
	if (rawLimit) {
		const parsed = Number.parseInt(rawLimit, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			limit = Math.min(parsed, RIDES_SAFETY_CEILING);
		}
	}

	return {
		search,
		difficulty,
		hostGroupId,
		needsHost,
		limit
	};
}

export function normalizeRideListRow(activity, recurringActivityIds) {
	const rideDetails = Array.isArray(activity.ride_details)
		? (activity.ride_details[0] ?? null)
		: (activity.ride_details ?? null);

	return {
		id: activity.id,
		title: activity.title,
		slug: activity.slug,
		summary: activity.summary,
		description: activity.description,
		timezone: activity.timezone,
		hostUserId: activity.host_user_id,
		hostGroupId: activity.host_group_id,
		startLocationName: activity.start_location_name,
		startLocationAddress: activity.start_location_address,
		startLatitude: activity.start_latitude,
		startLongitude: activity.start_longitude,
		nextOccurrenceStart: activity.next_occurrence_start,
		nextOccurrenceEnd: activity.next_occurrence_end,
		recurrenceEnabled: recurringActivityIds.has(activity.id),
		group: activity.group ?? null,
		rideDetails,
		imageUrls: rideDetails?.image_urls ?? [],
		difficultyLevels: (activity.difficulty_links ?? [])
			.map((entry) => entry?.level)
			.filter(Boolean),
		ridingDisciplines: (activity.discipline_links ?? [])
			.map((entry) => entry?.discipline)
			.filter(Boolean)
	};
}

function buildSelectColumns({ filterByDifficulty = false } = {}) {
	return `
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
		ride_details(*),
		group:groups(id,slug,name,city,state_region),
		difficulty_links:activity_x_ride_difficulty_levels(level:ride_difficulty_levels(*)),
		discipline_links:activity_x_riding_disciplines(discipline:riding_disciplines(*))${
			filterByDifficulty
				? ',\n\t\tdifficulty_filter:activity_x_ride_difficulty_levels!inner(difficulty_level_id)'
				: ''
		}
	`;
}

async function resolveDifficultyLevelIds(supabase, difficulty) {
	if (!difficulty) return null;
	const { data, error } = await supabase.from('ride_difficulty_levels').select('id,name,slug');
	if (error) throw error;
	const needle = difficulty.toLowerCase();
	return (data ?? [])
		.filter(
			(level) =>
				safeTrim(level?.name).toLowerCase() === needle ||
				safeTrim(level?.slug).toLowerCase() === needle
		)
		.map((level) => level.id)
		.filter((id) => id !== null && id !== undefined);
}

async function resolveSearchRelatedFilters(supabase, search, nowIso) {
	const needle = search.toLowerCase();
	const ilikePattern = `%${sanitizeIlikeTerm(search)}%`;

	const [groupsRes, levelsRes, disciplinesRes, detailsRes] = await Promise.all([
		supabase.from('groups').select('id').ilike('name', ilikePattern).limit(MAX_RELATED_SEARCH_IDS),
		supabase.from('ride_difficulty_levels').select('id,name'),
		supabase.from('riding_disciplines').select('id,name'),
		supabase
			.from('ride_details')
			.select('activity_event_id,activity_events!inner(id)')
			.ilike('pace_notes', ilikePattern)
			.eq('activity_events.activity_type', 'ride')
			.eq('activity_events.status', 'published')
			.gte('activity_events.next_occurrence_start', nowIso)
			.limit(MAX_RELATED_SEARCH_IDS)
	]);

	const matchingGroupIds = Array.from(
		new Set((groupsRes?.data ?? []).map((row) => row?.id).filter(Boolean))
	).slice(0, MAX_RELATED_SEARCH_IDS);

	const matchingDifficultyIds = (levelsRes?.data ?? [])
		.filter((row) => safeTrim(row?.name).toLowerCase().includes(needle))
		.map((row) => row.id)
		.filter((id) => id !== null && id !== undefined);

	const matchingDisciplineIds = (disciplinesRes?.data ?? [])
		.filter((row) => safeTrim(row?.name).toLowerCase().includes(needle))
		.map((row) => row.id)
		.filter((id) => id !== null && id !== undefined);

	const joinPromises = [];
	if (matchingDifficultyIds.length) {
		joinPromises.push(
			supabase
				.from('activity_x_ride_difficulty_levels')
				.select('activity_event_id,activity_events!inner(id)')
				.in('difficulty_level_id', matchingDifficultyIds)
				.eq('activity_events.activity_type', 'ride')
				.eq('activity_events.status', 'published')
				.gte('activity_events.next_occurrence_start', nowIso)
				.limit(MAX_RELATED_SEARCH_IDS)
		);
	}
	if (matchingDisciplineIds.length) {
		joinPromises.push(
			supabase
				.from('activity_x_riding_disciplines')
				.select('activity_event_id,activity_events!inner(id)')
				.in('riding_discipline_id', matchingDisciplineIds)
				.eq('activity_events.activity_type', 'ride')
				.eq('activity_events.status', 'published')
				.gte('activity_events.next_occurrence_start', nowIso)
				.limit(MAX_RELATED_SEARCH_IDS)
		);
	}

	const joinResults = joinPromises.length ? await Promise.all(joinPromises) : [];
	const relatedActivityIds = Array.from(
		new Set(
			[
				...(detailsRes?.data ?? []).map((row) => row?.activity_event_id),
				...joinResults.flatMap((res) => (res?.data ?? []).map((row) => row?.activity_event_id))
			].filter(Boolean)
		)
	).slice(0, MAX_RELATED_SEARCH_IDS);

	return {
		matchingGroupIds,
		relatedActivityIds
	};
}

function emptyResult(effectiveCeiling) {
	return {
		data: [],
		count: 0,
		meta: {
			total: 0,
			count: 0,
			returned: 0,
			limit: effectiveCeiling,
			safetyCeiling: RIDES_SAFETY_CEILING,
			truncated: false
		}
	};
}

export async function queryPublishedUpcomingRides(
	supabase,
	searchParamsInput,
	{
		nowIso = new Date().toISOString(),
		chunkSize = RIDES_CHUNK_SIZE,
		safetyCeiling = RIDES_SAFETY_CEILING,
		recurrenceBatchSize = RECURRENCE_LOOKUP_BATCH_SIZE
	} = {}
) {
	const params = parseRideListParams(searchParamsInput);
	const effectiveCeiling = Math.min(Math.max(1, params.limit), safetyCeiling);
	const safeChunkSize = Math.min(Math.max(1, chunkSize), effectiveCeiling);

	if (params.hostGroupId && params.needsHost) {
		return emptyResult(effectiveCeiling);
	}

	let difficultyLevelIds = null;
	if (params.difficulty) {
		difficultyLevelIds = await resolveDifficultyLevelIds(supabase, params.difficulty);
		if (!difficultyLevelIds.length) {
			return emptyResult(effectiveCeiling);
		}
	}

	let searchOrFilter = '';
	if (params.search) {
		const quotedPattern = buildPostgrestQuotedIlikePattern(params.search);
		const { matchingGroupIds, relatedActivityIds } = await resolveSearchRelatedFilters(
			supabase,
			params.search,
			nowIso
		);
		const orClauses = [
			`title.ilike.${quotedPattern}`,
			`summary.ilike.${quotedPattern}`,
			`description.ilike.${quotedPattern}`,
			`start_location_name.ilike.${quotedPattern}`,
			`start_location_address.ilike.${quotedPattern}`
		];
		if (matchingGroupIds.length) {
			orClauses.push(`host_group_id.in.(${matchingGroupIds.join(',')})`);
		}
		if (relatedActivityIds.length) {
			orClauses.push(`id.in.(${relatedActivityIds.join(',')})`);
		}
		searchOrFilter = orClauses.join(',');
	}

	const selectColumns = buildSelectColumns({
		filterByDifficulty: Boolean(difficultyLevelIds?.length)
	});

	function buildChunkQuery(from, to, includeCount) {
		let query = supabase
			.from('activity_events')
			.select(selectColumns, includeCount ? { count: 'exact' } : undefined)
			.eq('activity_type', 'ride')
			.eq('status', 'published')
			.gte('next_occurrence_start', nowIso);

		if (params.hostGroupId) {
			query = query.eq('host_group_id', params.hostGroupId);
		}
		if (params.needsHost) {
			query = query.is('host_user_id', null).is('host_group_id', null);
		}
		if (difficultyLevelIds?.length) {
			query = query.in('difficulty_filter.difficulty_level_id', difficultyLevelIds);
		}
		if (searchOrFilter) {
			query = query.or(searchOrFilter);
		}

		return query
			.order('next_occurrence_start', { ascending: true })
			.order('id', { ascending: true })
			.range(from, to);
	}

	const activities = [];
	const seenIds = new Set();
	let from = 0;
	let exactTotal = null;

	while (activities.length < effectiveCeiling) {
		const remaining = effectiveCeiling - activities.length;
		const windowSize = Math.min(safeChunkSize, remaining);
		const includeCount = exactTotal === null;
		const { data, error, count } = await buildChunkQuery(from, from + windowSize - 1, includeCount);
		if (error) throw error;
		if (includeCount && Number.isFinite(count)) {
			exactTotal = count;
		}
		const batch = Array.isArray(data) ? data : [];
		if (!batch.length) break;

		for (const row of batch) {
			if (!row?.id || seenIds.has(row.id)) continue;
			seenIds.add(row.id);
			activities.push(row);
		}

		from += batch.length;
		if (Number.isFinite(exactTotal) && from >= exactTotal) break;
		if (batch.length < windowSize) break;
	}

	const activityIds = activities.map((activity) => activity.id).filter(Boolean);
	const recurringActivityIds = new Set();
	if (activityIds.length) {
		const idBatches = chunkArray(activityIds, recurrenceBatchSize);
		const ruleResponses = await Promise.all(
			idBatches.map((batchIds) =>
				supabase
					.from('activity_recurrence_rules')
					.select('activity_event_id')
					.in('activity_event_id', batchIds)
			)
		);
		for (const response of ruleResponses) {
			if (response.error) throw response.error;
			for (const rule of response.data ?? []) {
				if (rule?.activity_event_id) recurringActivityIds.add(rule.activity_event_id);
			}
		}
	}

	const rows = activities.map((activity) => normalizeRideListRow(activity, recurringActivityIds));
	const total = Number.isFinite(exactTotal) ? exactTotal : rows.length;

	return {
		data: rows,
		count: total,
		meta: {
			total,
			count: total,
			returned: rows.length,
			limit: effectiveCeiling,
			safetyCeiling,
			truncated: total > rows.length
		}
	};
}
