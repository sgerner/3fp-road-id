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
		const data = payload?.data ?? payload;
		if (data === null || data === undefined) return null;
		if (Array.isArray(data)) return data[0] ?? null;
		return data;
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

export const load = async ({ fetch, cookies }) => {
	const now = new Date();
	const horizon = new Date(now);
	horizon.setDate(horizon.getDate() - 7);
	const horizonIso = horizon.toISOString();

	let eventRows = [];
	try {
		eventRows = await fetchList(fetch, 'volunteer-events', {
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
				'host_group_id(id,slug,name,tagline,city,state_region,country,logo_url,cover_photo_url)',
				'host_user_id'
			].join(','),
			status: 'eq.published',
			event_start: `gte.${horizonIso}`,
			order: 'event_start.asc',
			limit: '500'
		});
	} catch (err) {
		console.warn('Failed to load volunteer events for volunteer groups page', err);
		eventRows = [];
	}

	const groupsById = new Map();
	const eventIds = [];
	const groupIds = new Set();

	for (const row of eventRows) {
		if (!row || typeof row !== 'object') continue;
		const hostGroup = row.host_group_id;
		const groupId = hostGroup?.id ?? row.host_group_id;
		if (!groupId) continue;

		const normalizedGroup = groupsById.get(groupId) ?? {
			id: hostGroup?.id ?? groupId,
			slug: hostGroup?.slug ?? null,
			name: hostGroup?.name ?? null,
			tagline: hostGroup?.tagline ?? null,
			city: hostGroup?.city ?? null,
			state_region: hostGroup?.state_region ?? null,
			country: hostGroup?.country ?? null,
			logo_url: hostGroup?.logo_url ?? null,
			cover_photo_url: hostGroup?.cover_photo_url ?? null,
			events: []
		};

		const normalizedEvent = {
			id: row.id,
			slug: row.slug,
			title: row.title,
			summary: row.summary,
			event_start: row.event_start,
			event_end: row.event_end,
			timezone: row.timezone,
			location_name: row.location_name,
			location_address: row.location_address,
			host_group_id: normalizedGroup.id,
			host_user_id: row.host_user_id ?? null
		};

		normalizedGroup.events.push(normalizedEvent);
		groupsById.set(normalizedGroup.id, normalizedGroup);
		eventIds.push(row.id);
		groupIds.add(normalizedGroup.id);
	}

	const grouped = Array.from(groupsById.values());

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
			console.warn('Failed to resolve session profile for volunteer groups page', err);
			sessionIsAdmin = false;
		}
	}

	const groupIdList = Array.from(groupIds);
	let ownerGroupIds = new Set();
	if (sessionUserId && groupIdList.length) {
		try {
			const ownerRows = await fetchList(fetch, 'group-members', {
				group_id: `in.(${groupIdList.join(',')})`,
				user_id: `eq.${sessionUserId}`,
				role: 'eq.owner',
				select: 'group_id'
			});
			ownerGroupIds = new Set(ownerRows.map((row) => row?.group_id).filter(Boolean));
		} catch (err) {
			console.warn('Failed to load group owner memberships for volunteer groups page', err);
			ownerGroupIds = new Set();
		}
	}

	let hostEventIds = new Set();
	if (sessionUserId && eventIds.length) {
		try {
			const hostRows = await fetchList(fetch, 'v-volunteer-event-hosts-with-profiles', {
				event_id: `in.(${eventIds.join(',')})`,
				user_id: `eq.${sessionUserId}`,
				select: 'event_id'
			});
			hostEventIds = new Set(hostRows.map((row) => row?.event_id).filter(Boolean));
		} catch (err) {
			console.warn(
				'Failed to load volunteer event host assignments for volunteer groups page',
				err
			);
			hostEventIds = new Set();
		}
	}

	const groups = grouped
		.map((group) => {
			const sortedEvents = [...group.events].sort((a, b) => {
				const aStart = a?.event_start ? Date.parse(a.event_start) : NaN;
				const bStart = b?.event_start ? Date.parse(b.event_start) : NaN;
				if (Number.isNaN(aStart) && Number.isNaN(bStart)) return 0;
				if (Number.isNaN(aStart)) return 1;
				if (Number.isNaN(bStart)) return -1;
				return aStart - bStart;
			});

			const limitedEvents = sortedEvents.slice(0, 3).map((event) => ({
				...event,
				can_manage:
					sessionIsAdmin ||
					ownerGroupIds.has(group.id) ||
					(sessionUserId && event.host_user_id && event.host_user_id === sessionUserId) ||
					hostEventIds.has(event.id)
			}));

			return {
				...group,
				events: limitedEvents
			};
		})
		.filter((group) => group.events.length > 0)
		.sort((a, b) => {
			const aStart = a.events[0]?.event_start ? Date.parse(a.events[0].event_start) : NaN;
			const bStart = b.events[0]?.event_start ? Date.parse(b.events[0].event_start) : NaN;
			if (Number.isNaN(aStart) && Number.isNaN(bStart))
				return (a.name || '').localeCompare(b.name || '');
			if (Number.isNaN(aStart)) return 1;
			if (Number.isNaN(bStart)) return -1;
			return aStart - bStart;
		});

	console.log(groups);

	return {
		groups,
		retrievedAt: now.toISOString()
	};
};
