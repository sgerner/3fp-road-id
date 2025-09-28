import { resolveSession } from '$lib/server/session';

function buildQuery(params) {
	const search = new URLSearchParams();
	if (params && typeof params === 'object') {
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item === null || item === undefined) continue;
					search.append(key, String(item));
				}
				continue;
			}
			search.set(key, String(value));
		}
	}
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

async function callApi(fetchImpl, resource, params) {
	const qs = buildQuery(params);
	const response = await fetchImpl(`/api/v1/${resource}${qs}`);
	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	if (!response.ok) {
		const message = payload?.error || payload?.message || `Failed to load ${resource}`;
		const apiError = new Error(message);
		apiError.status = response.status;
		apiError.payload = payload;
		throw apiError;
	}
	return payload ?? {};
}

async function fetchSingle(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		return payload?.data ?? payload ?? null;
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

async function fetchList(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		const data = payload?.data ?? payload;
		if (Array.isArray(data)) return data;
		if (data === null || data === undefined) return [];
		return [data];
	} catch (err) {
		if (err?.status === 403 || err?.status === 404) {
			return [];
		}
		throw err;
	}
}

export const load = async ({ params, cookies, fetch }) => {
	const slug = params.slug;

	let group = null;
	try {
		group = await fetchSingle(fetch, 'groups', {
			slug: `eq.${slug}`,
			single: 'true'
		});
	} catch (err) {
		console.warn('Failed to load group details', err);
		return { error: err?.message ?? 'Failed to load group' };
	}
	if (!group) {
		return { error: 'Group not found' };
	}

	const { user: sessionUser } = resolveSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;
	let sessionIsAdmin = false;
	if (sessionUserId) {
		try {
			const profileRow = await fetchSingle(fetch, 'profiles', {
				user_id: `eq.${sessionUserId}`,
				select: 'admin',
				single: 'true'
			});
			sessionIsAdmin = profileRow?.admin === true;
		} catch (err) {
			console.warn('Failed to resolve session profile for group page', err);
			sessionIsAdmin = false;
		}
	}

	const [
		groupTypes,
		audienceFocuses,
		ridingDisciplines,
		skillLevels,
		groupTypeSelections,
		audienceSelections,
		disciplineSelections,
		skillSelections,
		ownerRows
	] = await Promise.all([
		fetchList(fetch, 'group-types', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load group types', err);
			return [];
		}),
		fetchList(fetch, 'audience-focuses', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load audience focuses', err);
			return [];
		}),
		fetchList(fetch, 'riding-disciplines', { select: 'id,name', order: 'name.asc' }).catch(
			(err) => {
				console.warn('Failed to load riding disciplines', err);
				return [];
			}
		),
		fetchList(fetch, 'skill-levels', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load skill levels', err);
			return [];
		}),
		fetchList(fetch, 'group-x-group-types', {
			select: 'group_type_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load group type selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-audience-focuses', {
			select: 'audience_focus_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load audience focus selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-riding-disciplines', {
			select: 'riding_discipline_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load riding discipline selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-skill-levels', {
			select: 'skill_level_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load skill level selections', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'user_id',
			group_id: `eq.${group.id}`,
			role: 'eq.owner'
		}).catch((err) => {
			console.warn('Failed to load group owners', err);
			return [];
		})
	]);

	const ownerIds = ownerRows.map((row) => row?.user_id).filter(Boolean);
	const is_owner = sessionUserId ? ownerIds.includes(sessionUserId) : false;
	const can_edit = sessionIsAdmin || is_owner;

	const nowIso = new Date().toISOString();
	let volunteerEvents = [];
	let hostEventIds = new Set();
	try {
		const eventRows = await fetchList(fetch, 'volunteer-events', {
			select: [
				'id',
				'slug',
				'title',
				'summary',
				'event_start',
				'event_end',
				'timezone',
				'location_name',
				'location_address',
				'host_group_id',
				'host_user_id'
			].join(','),
			host_group_id: `eq.${group.id}`,
			status: 'eq.published',
			event_start: `gte.${nowIso}`,
			order: 'event_start.asc',
			limit: '3'
		});
		volunteerEvents = eventRows;

		if (sessionUserId && Array.isArray(eventRows) && eventRows.length) {
			const eventIds = eventRows
				.map((row) => row?.id)
				.filter((value) => value !== null && value !== undefined);
			if (eventIds.length) {
				try {
					const hostRows = await fetchList(fetch, 'v-volunteer-event-hosts-with-profiles', {
						event_id: `in.(${eventIds.join(',')})`,
						user_id: `eq.${sessionUserId}`
					});
					hostEventIds = new Set(hostRows.map((row) => row?.event_id).filter(Boolean));
				} catch (err) {
					console.warn('Failed to load volunteer event host assignments for group page', err);
				}
			}
		}

		volunteerEvents = Array.isArray(volunteerEvents)
			? volunteerEvents.map((row) => ({
					id: row.id,
					slug: row.slug,
					title: row.title,
					summary: row.summary,
					event_start: row.event_start,
					event_end: row.event_end,
					timezone: row.timezone,
					location_name: row.location_name,
					location_address: row.location_address,
					host_group_id: row.host_group_id,
					can_manage:
						sessionIsAdmin ||
						is_owner ||
						(sessionUserId && row.host_user_id && row.host_user_id === sessionUserId) ||
						(sessionUserId && hostEventIds.has(row.id))
				}))
			: [];
	} catch (err) {
		console.warn('Unexpected error loading volunteer events for group page', err);
		volunteerEvents = [];
	}

	return {
		group,
		group_types: groupTypes,
		audience_focuses: audienceFocuses,
		riding_disciplines: ridingDisciplines,
		skill_levels: skillLevels,
		selected: {
			group_type_ids: groupTypeSelections
				.map((r) => r?.group_type_id)
				.filter((value) => value !== null && value !== undefined),
			audience_focus_ids: audienceSelections
				.map((r) => r?.audience_focus_id)
				.filter((value) => value !== null && value !== undefined),
			riding_discipline_ids: disciplineSelections
				.map((r) => r?.riding_discipline_id)
				.filter((value) => value !== null && value !== undefined),
			skill_level_ids: skillSelections
				.map((r) => r?.skill_level_id)
				.filter((value) => value !== null && value !== undefined)
		},
		owners_count: ownerIds.length,
		is_owner,
		can_edit,
		volunteer_events: volunteerEvents
	};
};
