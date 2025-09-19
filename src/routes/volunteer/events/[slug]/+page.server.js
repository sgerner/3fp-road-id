import { error } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

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

async function callApi(fetchFn, resource, params) {
	const qs = buildQuery(params);
	const res = await fetchFn(`/api/v1/${resource}${qs}`);
	let payload = null;
	try {
		payload = await res.json();
	} catch {
		payload = null;
	}
	if (!res.ok) {
		const message = payload?.error || `Failed to load ${resource}`;
		throw error(res.status || 500, message);
	}
	return payload ?? {};
}

async function fetchSingle(fetchFn, resource, params) {
	const response = await callApi(fetchFn, resource, params);
	return response?.data ?? null;
}

async function fetchList(fetchFn, resource, params) {
	const response = await callApi(fetchFn, resource, params);
	const data = response?.data;
	if (Array.isArray(data)) return data;
	if (data === null || data === undefined) return [];
	return [data];
}

function unique(array) {
	return Array.from(new Set(array.filter(Boolean)));
}

function chunk(array, size) {
	if (!Array.isArray(array) || size <= 0) return [array];
	const result = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

async function resolveSessionUser(cookies) {
	const session = cookies.get('sb_session');
	if (!session) return null;
	try {
		const parsed = JSON.parse(session);
		const accessToken = parsed?.access_token;
		if (!accessToken) return null;
		const { data: userRes } = await supabase.auth.getUser(accessToken);
		return userRes?.user ?? null;
	} catch {
		return null;
	}
}

export const load = async ({ params, fetch, cookies, url }) => {
	const slug = params.slug?.trim();
	if (!slug) throw error(404, 'Volunteer event not found');

	const event = await fetchSingle(fetch, 'volunteer-events', {
		slug: `eq.${slug}`,
		single: 'true'
	});

	if (!event) throw error(404, 'Volunteer event not found');

	const sessionUser = await resolveSessionUser(cookies);

	const eventStatus = event.status ?? event.volunteer_event_status ?? null;
	const isDraft = !eventStatus || eventStatus === 'draft';
	let authRequired = false;
	let draftForbidden = false;
	let canManageEvent = false;

	let hostGroup = null;

	if (event.host_group_id) {
		hostGroup = await fetchSingle(fetch, 'groups', {
			id: `eq.${event.host_group_id}`,
			single: 'true'
		}).catch((err) => {
			if (err?.status === 403) return null;
			throw err;
		});
	}

	let eventType = null;
	if (event.event_type_slug) {
		try {
			eventType = await fetchSingle(fetch, 'volunteer-event-types', {
				slug: `eq.${event.event_type_slug}`,
				single: 'true'
			});
		} catch (err) {
			if (err?.status !== 403 && err?.status !== 404) throw err;
			eventType = null;
		}
	}

	const [opportunityRecords, customQuestions] = await Promise.all([
		fetchList(fetch, 'volunteer-opportunities', {
			event_id: `eq.${event.id}`,
			order: 'title.asc'
		}),
		fetchList(fetch, 'volunteer-custom-questions', {
			event_id: `eq.${event.id}`,
			order: 'position.asc'
		})
	]);

	const opportunities = await Promise.all(
		opportunityRecords.map(async (opportunity) => {
			const shifts = await fetchList(fetch, 'volunteer-opportunity-shifts', {
				opportunity_id: `eq.${opportunity.id}`,
				order: 'starts_at.asc'
			});
			return { ...opportunity, shifts };
		})
	);

	let signups = [];
	try {
		signups = await fetchList(fetch, 'volunteer-signups', {
			event_id: `eq.${event.id}`,
			order: 'created_at.asc'
		});
	} catch (err) {
		if (err?.status !== 403) throw err;
		signups = [];
	}

	let signupIds = unique(signups.map((s) => s.id));
	let signupShifts = [];
	if (signupIds.length) {
		try {
			const batches = chunk(signupIds, 20);
			const responses = await Promise.all(
				batches.map((batch) =>
					fetchList(fetch, 'volunteer-signup-shifts', {
						signup_id: `in.(${batch.join(',')})`,
						order: 'created_at.asc'
					})
				)
			);
			signupShifts = responses.flat();
		} catch (err) {
			if (err?.status !== 403) throw err;
			signupShifts = [];
		}
	}

	const shiftSignupCounts = signupShifts.reduce((acc, row) => {
		const shiftId = row?.shift_id;
		if (!shiftId) return acc;
		acc[shiftId] = (acc[shiftId] || 0) + 1;
		return acc;
	}, {});

	const approvalCounts = signups.reduce(
		(acc, signup) => {
			if (signup?.status === 'approved' || signup?.status === 'confirmed') acc.confirmed += 1;
			if (signup?.status === 'pending') acc.pending += 1;
			return acc;
		},
		{ confirmed: 0, pending: 0 }
	);

	const sessionCookie = cookies.get('sb_session');
	let user = sessionUser;
	let profile = null;
	if (sessionCookie) {
		try {
			const parsed = JSON.parse(sessionCookie);
			const access_token = parsed?.access_token;
			if (access_token) {
				const { data: userRes } = await supabase.auth.getUser(access_token);
				user = userRes?.user ?? null;
				if (user?.id) {
					const { data: prof } = await supabase
						.from('profiles')
						.select(
							'user_id, full_name, email, phone, emergency_contact_name, emergency_contact_phone'
						)
						.eq('user_id', user.id)
						.maybeSingle();
					profile = prof ?? null;
				}
			}
		} catch (err) {
			console.warn('Failed to hydrate user profile for volunteer event', err);
			user = null;
			profile = null;
		}
	}

	if (user?.id) {
		if (event.host_user_id && user.id === event.host_user_id) {
			canManageEvent = true;
		}
		if (!canManageEvent && event.host_group_id) {
			try {
				const ownerRows = await fetchList(fetch, 'group-members', {
					group_id: `eq.${event.host_group_id}`,
					role: 'eq.owner',
					user_id: `eq.${user.id}`
				});
				if (Array.isArray(ownerRows) && ownerRows.some((row) => row?.user_id === user.id)) {
					canManageEvent = true;
				}
			} catch (err) {
				console.warn('Error checking group owner permissions', err);
			}
		}
	}

	if (isDraft) {
		if (!user?.id) {
			authRequired = true;
		} else if (!canManageEvent) {
			draftForbidden = true;
		}
	}

	const userSignups = user
		? signups.filter((signup) => {
				if (!signup) return false;
				if (signup.volunteer_user_id && signup.volunteer_user_id === user.id) return true;
				return signup.volunteer_email && signup.volunteer_email === user.email;
			})
		: [];

	return {
		event,
		hostGroup,
		eventType,
		opportunities,
		customQuestions,
		signups,
		signupShifts,
		shiftSignupCounts,
		approvalCounts,
		user,
		profile,
		userSignups,
		returnTo: url.pathname + url.search,
		authRequired,
		draftForbidden,
		canManageEvent
	};
};
