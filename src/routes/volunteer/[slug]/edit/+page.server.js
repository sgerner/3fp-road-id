import { redirect, error } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import {
	listVolunteerEvents,
	listVolunteerOpportunities,
	listVolunteerShifts,
	listVolunteerCustomQuestions,
	listVolunteerEventEmails
} from '$lib';

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

function chunk(values, size) {
	if (!Array.isArray(values) || values.length === 0 || size <= 0) return [];
	const result = [];
	for (let i = 0; i < values.length; i += size) {
		result.push(values.slice(i, i + size));
	}
	return result;
}

function normalizeArray(value) {
	if (Array.isArray(value)) return value;
	if (value === null || value === undefined) return [];
	return [value];
}

export const load = async ({ params, cookies, fetch, url }) => {
	const slug = params.slug?.trim();
	if (!slug) throw error(404, 'Volunteer event not found');

	const { user: currentUser } = resolveSession(cookies);
	const userId = currentUser?.id ?? null;
	if (!userId) throw redirect(303, `/volunteer/${slug}?auth=required`);

	const eventResponse = await listVolunteerEvents({
		fetch,
		query: {
			slug: `eq.${slug}`,
			single: 'true'
		}
	});
	const eventRecord = eventResponse?.data ?? eventResponse ?? null;
	if (!eventRecord?.id) throw error(404, 'Volunteer event not found');

	const eventId = eventRecord.id;

	let isAdmin = false;
	try {
		const profileRow = await fetchSingle(fetch, 'profiles', {
			user_id: `eq.${userId}`,
			select: 'admin',
			single: 'true'
		});
		isAdmin = !!profileRow?.admin;
	} catch (err) {
		console.warn('Failed to load profile for volunteer edit permissions', err);
		isAdmin = false;
	}

	const hostUserId = eventRecord.host_user_id ?? eventRecord.hostUserId ?? null;
	const creatorId = eventRecord.created_by_user_id ?? eventRecord.createdByUserId ?? null;
	const hostGroupId = eventRecord.host_group_id ?? eventRecord.hostGroupId ?? null;

	const isHostUser = hostUserId && hostUserId === userId;
	const isCreator = creatorId && creatorId === userId;

	let canManage = isAdmin || isHostUser || isCreator;

	if (!canManage && eventId) {
		try {
			const eventHostRows = await fetchList(fetch, 'volunteer-event-hosts', {
				event_id: `eq.${eventId}`,
				user_id: `eq.${userId}`
			});
			if (eventHostRows.some((row) => row?.user_id === userId)) {
				canManage = true;
			}
		} catch (err) {
			console.warn('Failed to check volunteer event host permissions', err);
		}
	}

	if (!canManage && hostGroupId) {
		try {
			const membershipRows = await fetchList(fetch, 'group-members', {
				group_id: `eq.${hostGroupId}`,
				user_id: `eq.${userId}`,
				role: 'eq.owner'
			});
			if (membershipRows.some((row) => row?.user_id === userId)) {
				canManage = true;
			}
		} catch (err) {
			console.warn('Failed to check group ownership permissions', err);
		}
	}

	if (!canManage) {
		throw redirect(303, `/volunteer/${slug}?auth=forbidden`);
	}

	const opportunityResponse = await listVolunteerOpportunities({
		fetch,
		query: {
			event_id: `eq.${eventId}`,
			order: 'title.asc'
		}
	});
	const opportunityRows = normalizeArray(opportunityResponse?.data ?? opportunityResponse);

	const opportunityIds = opportunityRows
		.map((row) => row?.id)
		.filter((value) => value !== null && value !== undefined);

	let shiftRows = [];
	if (opportunityIds.length) {
		const batches = chunk(opportunityIds, 20);
		const shiftResponses = await Promise.all(
			batches.map((batch) =>
				listVolunteerShifts({
					fetch,
					query: {
						opportunity_id: `in.(${batch.join(',')})`,
						order: 'starts_at.asc'
					}
				})
			)
		);
		shiftRows = shiftResponses.flatMap((response) => normalizeArray(response?.data ?? response));
	}

	const customQuestionResponse = await listVolunteerCustomQuestions({
		fetch,
		query: {
			event_id: `eq.${eventId}`,
			order: 'position.asc'
		}
	});
	const customQuestions = normalizeArray(customQuestionResponse?.data ?? customQuestionResponse);

	const eventEmailResponse = await listVolunteerEventEmails({
		fetch,
		query: {
			event_id: `eq.${eventId}`,
			order: 'send_offset_minutes.asc'
		}
	}).catch(() => ({ data: [] }));
	const eventEmails = normalizeArray(eventEmailResponse?.data ?? eventEmailResponse);

	const shiftsByOpportunity = new Map();
	for (const shift of shiftRows) {
		const shiftId = shift?.opportunity_id ?? shift?.opportunityId;
		if (shiftId === null || shiftId === undefined) continue;
		const list = shiftsByOpportunity.get(shiftId) ?? [];
		list.push(shift);
		shiftsByOpportunity.set(shiftId, list);
	}

	const opportunities = opportunityRows.map((opportunity) => ({
		...opportunity,
		shifts: shiftsByOpportunity.get(opportunity.id) ?? []
	}));

	const [hostGroups, eventTypes, ownerMembershipRows] = await Promise.all([
		fetchList(fetch, 'groups', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load host groups for volunteer edit page', err);
			return [];
		}),
		fetchList(fetch, 'volunteer-event-types', {
			select: 'slug,event_type,description',
			order: 'event_type.asc'
		}).catch((err) => {
			console.warn('Failed to load volunteer event types for edit page', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'group_id',
			user_id: `eq.${userId}`,
			role: 'eq.owner'
		}).catch((err) => {
			console.warn('Failed to load group ownership for volunteer edit page', err);
			return [];
		})
	]);

	const ownerGroupIds = Array.isArray(ownerMembershipRows)
		? ownerMembershipRows.map((row) => row?.group_id).filter((value) => Boolean(value))
		: [];

	return {
		event: eventRecord,
		opportunities,
		customQuestions,
		eventEmails,
		hostGroups: hostGroups ?? [],
		eventTypes: eventTypes ?? [],
		ownerGroupIds,
		currentUser,
		returnTo: url.pathname + url.search
	};
};
