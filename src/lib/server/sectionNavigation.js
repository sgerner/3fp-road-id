import { fetchList } from '#lib/server/internalApi';

function uniqueBy(items, keyFn) {
	const seen = new Set();
	const result = [];
	for (const item of items) {
		const key = keyFn(item);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(item);
	}
	return result;
}

function sortEventsForManagement(events) {
	return [...events].sort((a, b) => {
		const aStart = a?.event_start ? new Date(a.event_start).getTime() : Number.NEGATIVE_INFINITY;
		const bStart = b?.event_start ? new Date(b.event_start).getTime() : Number.NEGATIVE_INFINITY;
		if (aStart !== bStart) return bStart - aStart;
		return String(a?.title ?? '').localeCompare(String(b?.title ?? ''));
	});
}

export async function loadOwnedGroups(fetchImpl, userId) {
	if (!userId) return [];
	const membershipRows = await fetchList(fetchImpl, 'group-members', {
		select: 'group_id',
		user_id: `eq.${userId}`,
		role: 'eq.owner'
	}).catch((err) => {
		console.warn('Failed to load owned groups for section nav', err);
		return [];
	});

	const groupIds = membershipRows
		.map((row) => row?.group_id)
		.filter((value) => value !== null && value !== undefined);
	if (!groupIds.length) return [];

	const groupRows = await fetchList(fetchImpl, 'groups', {
		select: 'id,slug,name',
		id: `in.(${groupIds.join(',')})`,
		order: 'name.asc'
	}).catch((err) => {
		console.warn('Failed to load group records for section nav', err);
		return [];
	});

	return uniqueBy(
		groupRows
			.map((row) => ({
				id: row?.id ?? null,
				slug: row?.slug ?? null,
				name: row?.name ?? 'Untitled group'
			}))
			.filter((row) => row.slug),
		(row) => row.id ?? row.slug
	);
}

export async function loadManagedVolunteerEvents(
	fetchImpl,
	userId,
	{ ownerGroupIds = [], limit = 100 } = {}
) {
	if (!userId) return [];

	const eventMap = new Map();

	const addEvents = (rows) => {
		for (const row of rows) {
			const id = row?.id ?? null;
			const slug = row?.slug ?? null;
			if (!id || !slug) continue;
			eventMap.set(String(id), {
				id,
				slug,
				title: row?.title ?? 'Untitled event',
				event_start: row?.event_start ?? null,
				event_end: row?.event_end ?? null,
				status: row?.status ?? null,
				host_group_id: row?.host_group_id ?? null
			});
		}
	};

	const directHostRows = await fetchList(fetchImpl, 'volunteer-events', {
		select: 'id,slug,title,event_start,event_end,status,host_group_id',
		host_user_id: `eq.${userId}`,
		order: 'event_start.desc',
		limit: String(limit)
	}).catch((err) => {
		console.warn('Failed to load directly hosted volunteer events for section nav', err);
		return [];
	});
	addEvents(directHostRows);

	if (ownerGroupIds.length) {
		const ownedGroupRows = await fetchList(fetchImpl, 'volunteer-events', {
			select: 'id,slug,title,event_start,event_end,status,host_group_id',
			host_group_id: `in.(${ownerGroupIds.join(',')})`,
			order: 'event_start.desc',
			limit: String(limit)
		}).catch((err) => {
			console.warn('Failed to load group-owned volunteer events for section nav', err);
			return [];
		});
		addEvents(ownedGroupRows);
	}

	const hostedAssignments = await fetchList(fetchImpl, 'v-volunteer-event-hosts-with-profiles', {
		select: 'event_id',
		user_id: `eq.${userId}`
	}).catch((err) => {
		console.warn('Failed to load volunteer host assignments for section nav', err);
		return [];
	});
	const assignedEventIds = uniqueBy(
		hostedAssignments
			.map((row) => row?.event_id)
			.filter((value) => value !== null && value !== undefined),
		(value) => value
	);

	if (assignedEventIds.length) {
		const assignedRows = await fetchList(fetchImpl, 'volunteer-events', {
			select: 'id,slug,title,event_start,event_end,status,host_group_id',
			id: `in.(${assignedEventIds.join(',')})`,
			order: 'event_start.desc',
			limit: String(limit)
		}).catch((err) => {
			console.warn('Failed to load assigned volunteer events for section nav', err);
			return [];
		});
		addEvents(assignedRows);
	}

	return sortEventsForManagement(Array.from(eventMap.values())).slice(0, limit);
}
