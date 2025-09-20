import { redirect, error } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import {
	listVolunteerEvents,
	listVolunteerOpportunities,
	listVolunteerShifts,
	listVolunteerCustomQuestions,
	listVolunteerEventEmails
} from '$lib';

function parseSessionCookie(raw) {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async function resolveCurrentUser(cookies) {
	const session = parseSessionCookie(cookies.get('sb_session'));
	const accessToken = session?.access_token;
	if (!accessToken) return null;
	const { data: userResponse } = await supabase.auth.getUser(accessToken);
	return userResponse?.user ?? null;
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

	const currentUser = await resolveCurrentUser(cookies);
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
	const { data: profileRow } = await supabase
		.from('profiles')
		.select('admin')
		.eq('user_id', userId)
		.maybeSingle();
	isAdmin = !!profileRow?.admin;

	if (!isAdmin) {
		const hostUserId = eventRecord.host_user_id ?? eventRecord.hostUserId ?? null;
		const creatorId = eventRecord.created_by_user_id ?? eventRecord.createdByUserId ?? null;
		const hostGroupId = eventRecord.host_group_id ?? eventRecord.hostGroupId ?? null;

		const isHostUser = hostUserId && hostUserId === userId;
		const isCreator = creatorId && creatorId === userId;

		if (!isHostUser && !isCreator) {
			if (hostGroupId) {
				const { data: membershipRows, error: membershipError } = await supabase
					.from('group_members')
					.select('user_id')
					.eq('group_id', hostGroupId)
					.eq('user_id', userId)
					.eq('role', 'owner');
				if (membershipError) throw redirect(303, `/volunteer/${slug}`);
				if (!membershipRows || membershipRows.length === 0) {
					throw redirect(303, `/volunteer/${slug}?auth=forbidden`);
				}
			} else {
				throw redirect(303, `/volunteer/${slug}?auth=forbidden`);
			}
		}
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

	const [{ data: hostGroups }, { data: eventTypes }, ownerMembershipResponse] = await Promise.all([
		supabase.from('groups').select('id, name').order('name'),
		supabase
			.from('volunteer_event_types')
			.select('slug, event_type, description')
			.order('event_type'),
		supabase.from('group_members').select('group_id').eq('user_id', userId).eq('role', 'owner')
	]);

	const ownerGroupIds = Array.isArray(ownerMembershipResponse?.data)
		? ownerMembershipResponse.data.map((row) => row?.group_id).filter((value) => Boolean(value))
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
