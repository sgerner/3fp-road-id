import { resolveSession } from '$lib/server/session';
import { fail } from '@sveltejs/kit';

const CONFIRM_WINDOW_HOURS = 48;
const CANCELLED_STATUSES = new Set(['cancelled', 'no_show', 'declined']);
const WAITLIST_STATUSES = new Set(['waitlisted']);

function buildQueryString(params) {
	if (!params) return '';
	if (typeof params === 'string') return params;
	if (params instanceof URLSearchParams) {
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	}
	const search = new URLSearchParams();
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
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

async function callApi(fetchImpl, resource, { id, params, method = 'GET', body } = {}) {
	if (!fetchImpl || typeof fetchImpl !== 'function') {
		throw new Error('A fetch implementation is required for volunteer shift actions.');
	}
	if (!resource) {
		throw new Error('A resource path is required for volunteer shift API calls.');
	}

	const qs = buildQueryString(params);
	const path = `/api/v1/${resource}${id ? `/${id}` : ''}${qs}`;
	const init = { method, headers: {} };
	if (body !== undefined) {
		init.body = typeof body === 'string' ? body : JSON.stringify(body);
		init.headers['Content-Type'] = 'application/json';
	}

	const response = await fetchImpl(path, init);
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
		const message =
			payload?.error || payload?.message || response.statusText || 'Volunteer API request failed';
		const error = new Error(message);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}

	return payload ?? null;
}

async function fetchSingle(fetchImpl, resource, options = {}) {
	try {
		const payload = await callApi(fetchImpl, resource, options);
		if (!payload) return null;
		const data = payload?.data ?? payload;
		if (!data) return null;
		if (Array.isArray(data)) return data[0] ?? null;
		return data;
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

async function fetchList(fetchImpl, resource, options = {}) {
	try {
		const payload = await callApi(fetchImpl, resource, options);
		const data = payload?.data ?? payload;
		if (Array.isArray(data)) return data;
		if (!data) return [];
		return [data];
	} catch (err) {
		if (err?.status === 404 || err?.status === 403) return [];
		throw err;
	}
}

function normalizeId(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const trimmed = String(value).trim();
	if (!trimmed) return null;
	const num = Number(trimmed);
	return Number.isFinite(num) ? num : trimmed;
}

function parseDate(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return null;
	return date;
}

function isCancelled(status) {
	if (!status) return false;
	return CANCELLED_STATUSES.has(String(status).toLowerCase());
}

function isWaitlisted(status) {
	if (!status) return false;
	return WAITLIST_STATUSES.has(String(status).toLowerCase());
}

function ownsSignup(identity, signup) {
	if (!identity) return false;
	if (!signup) return false;
	const signupUserId =
		signup?.volunteer_user_id ??
		signup?.volunteerUserId ??
		signup?.user_id ??
		signup?.userId ??
		null;
	const signupEmail = (signup?.volunteer_email ?? signup?.volunteerEmail ?? '').toLowerCase();
	if (identity.userId && signupUserId && String(identity.userId) === String(signupUserId))
		return true;
	if (identity.email && signupEmail && identity.email === signupEmail) return true;
	return false;
}

async function getIdentity(fetchImpl, cookies) {
	const { user } = resolveSession(cookies);
	let profile = null;
	let email = user?.email?.toLowerCase?.() ?? null;
	if (user?.id && !email) {
		try {
			profile = await fetchSingle(fetchImpl, 'profiles', {
				params: {
					user_id: `eq.${user.id}`,
					select: 'user_id,email',
					single: 'true'
				}
			});
			email = profile?.email?.toLowerCase?.() ?? null;
		} catch (err) {
			if (err?.status !== 404 && err?.status !== 403) throw err;
			profile = null;
		}
	}
	return {
		userId: user?.id ?? null,
		email,
		profile
	};
}

async function loadAssignmentContext(fetchImpl, assignmentId) {
	const assignment = await fetchSingle(fetchImpl, 'volunteer-signup-shifts', {
		id: assignmentId,
		params: {
			select: 'id,signup_id,shift_id,status,confirmed_at,cancelled_at'
		}
	});
	if (!assignment) {
		const notFound = new Error('Shift signup not found.');
		notFound.status = 404;
		throw notFound;
	}

	const signupId = normalizeId(assignment.signup_id ?? assignment.signupId);
	const shiftId = normalizeId(assignment.shift_id ?? assignment.shiftId);
	if (!signupId || !shiftId) {
		const invalid = new Error('Incomplete signup shift record.');
		invalid.status = 400;
		throw invalid;
	}

	const signup = await fetchSingle(fetchImpl, 'volunteer-signups', {
		id: signupId,
		params: {
			select: 'id,event_id,volunteer_user_id,volunteer_email,volunteer_name,volunteer_phone'
		}
	});
	if (!signup) {
		const missingSignup = new Error('Signup record not found.');
		missingSignup.status = 404;
		throw missingSignup;
	}

	const shift = await fetchSingle(fetchImpl, 'volunteer-opportunity-shifts', {
		id: shiftId,
		params: {
			select:
				'id,opportunity_id,starts_at,ends_at,timezone,location_name,location_address,capacity,notes'
		}
	});
	if (!shift) {
		const missingShift = new Error('Shift record not found.');
		missingShift.status = 404;
		throw missingShift;
	}

	const opportunityId = normalizeId(shift.opportunity_id ?? shift.opportunityId);
	const opportunity = opportunityId
		? await fetchSingle(fetchImpl, 'volunteer-opportunities', {
				id: opportunityId,
				params: {
					select: 'id,event_id,title,description'
				}
			})
		: null;

	const eventId = normalizeId(
		opportunity?.event_id ?? opportunity?.eventId ?? signup?.event_id ?? signup?.eventId ?? null
	);
	const event = eventId
		? await fetchSingle(fetchImpl, 'volunteer-events', {
				id: eventId,
				params: {
					select:
						'id,slug,title,event_start,event_end,timezone,location_name,location_address,status,host_user_id,host_group_id,contact_email,contact_phone,cancel_notifications,register_notifications'
				}
			})
		: null;

	return { assignment, signup, shift, opportunity, event };
}

function ensureWithinConfirmWindow(shift, now = new Date()) {
	const shiftStart = parseDate(shift?.starts_at ?? shift?.startsAt ?? null);
	if (!shiftStart) return { ok: false, reason: 'missing_start' };
	const diffMs = shiftStart.getTime() - now.getTime();
	const hoursUntil = diffMs / (1000 * 60 * 60);
	if (hoursUntil > CONFIRM_WINDOW_HOURS) {
		return { ok: false, reason: 'too_early', hoursUntil };
	}
	if (hoursUntil < 0) {
		return { ok: false, reason: 'already_started', hoursUntil };
	}
	return { ok: true, hoursUntil };
}

function canCancelShift(shift, assignment, now = new Date()) {
	if (isCancelled(assignment?.status) || assignment?.cancelled_at)
		return { ok: false, reason: 'already_cancelled' };
	const shiftEnd = parseDate(shift?.ends_at ?? shift?.endsAt ?? null);
	if (shiftEnd && shiftEnd.getTime() < now.getTime()) {
		return { ok: false, reason: 'completed' };
	}
	return { ok: true };
}

function normalizeCapacity(value) {
	if (value === null || value === undefined) return null;
	const num = Number(value);
	if (!Number.isFinite(num)) return null;
	return Math.max(0, Math.floor(num));
}

async function assertCapacityAvailable(fetchImpl, shift, { excludeAssignmentId } = {}) {
	const shiftId = normalizeId(shift?.id);
	if (!shiftId) {
		const invalid = new Error('Shift is missing an identifier.');
		invalid.status = 400;
		throw invalid;
	}
	const capacity = normalizeCapacity(shift?.capacity ?? shift?.max_volunteers ?? null);
	if (capacity === null) {
		return { capacity: null, remaining: null, count: null };
	}
	const rows = await fetchList(fetchImpl, 'volunteer-signup-shifts', {
		params: {
			shift_id: `eq.${shiftId}`,
			select: 'id,status,cancelled_at'
		}
	});
	let count = 0;
	for (const row of rows) {
		const rowId = normalizeId(row?.id);
		if (excludeAssignmentId && rowId && Number(rowId) === Number(excludeAssignmentId)) continue;
		const status = row?.status ?? null;
		if (isCancelled(status) || row?.cancelled_at) continue;
		if (isWaitlisted(status)) continue;
		count += 1;
	}
	const remaining = Math.max(0, capacity - count);
	if (remaining <= 0) {
		const full = new Error('This shift is already full.');
		full.status = 409;
		throw full;
	}
	return { capacity, remaining, count };
}

function buildActionResult({
	success,
	reason,
	message,
	assignmentId,
	event,
	shift,
	newAssignmentId
}) {
	return {
		success: success === true,
		reason: reason ?? null,
		message: message ?? null,
		assignmentId: assignmentId ?? null,
		event: event ?? null,
		shift: shift ?? null,
		newAssignmentId: newAssignmentId ?? null
	};
}

async function sendHostNotification(fetchImpl, assignmentId, type) {
	const normalizedId = normalizeId(assignmentId);
	const normalizedType = typeof type === 'string' ? type.toLowerCase() : '';
	if (!normalizedId) return;
	if (!['register', 'cancel'].includes(normalizedType)) return;
	try {
		await callApi(fetchImpl, 'volunteer-host-notifications', {
			method: 'POST',
			body: {
				assignment_id: normalizedId,
				type: normalizedType
			}
		});
	} catch (error) {
		console.warn('Failed to trigger volunteer host notification', error);
	}
}

export async function confirmShiftAction(event, assignmentId) {
	const { fetch, cookies } = event;
	const identity = await getIdentity(fetch, cookies);
	if (!identity.userId && !identity.email) {
		return buildActionResult({
			success: false,
			reason: 'login_required',
			message: 'Sign in to confirm shifts.'
		});
	}

	let context;
	try {
		context = await loadAssignmentContext(fetch, assignmentId);
	} catch (err) {
		if (err?.status === 404) {
			return buildActionResult({ success: false, reason: 'not_found', message: err.message });
		}
		throw err;
	}

	if (!ownsSignup(identity, context.signup)) {
		return buildActionResult({
			success: false,
			reason: 'forbidden',
			message: 'You do not have access to this shift.'
		});
	}

	if (isCancelled(context.assignment?.status) || context.assignment?.cancelled_at) {
		return buildActionResult({
			success: false,
			reason: 'cancelled',
			message: 'This shift has already been cancelled.'
		});
	}

	const confirmWindow = ensureWithinConfirmWindow(context.shift);
	if (!confirmWindow.ok) {
		return buildActionResult({
			success: false,
			reason: confirmWindow.reason,
			message: 'Shifts can only be confirmed within 48 hours of the start time.'
		});
	}

	const body = {
		confirmed_at: new Date().toISOString(),
		cancelled_at: null
	};

	await callApi(fetch, 'volunteer-signup-shifts', {
		id: assignmentId,
		method: 'PUT',
		body
	});

	await sendHostNotification(fetch, assignmentId, 'cancel');

	return buildActionResult({
		success: true,
		assignmentId,
		event: context.event,
		shift: context.shift
	});
}

export async function cancelShiftAction(event, assignmentId) {
	const { fetch, cookies } = event;
	const identity = await getIdentity(fetch, cookies);
	if (!identity.userId && !identity.email) {
		return buildActionResult({
			success: false,
			reason: 'login_required',
			message: 'Sign in to cancel shifts.'
		});
	}

	let context;
	try {
		context = await loadAssignmentContext(fetch, assignmentId);
	} catch (err) {
		if (err?.status === 404) {
			return buildActionResult({ success: false, reason: 'not_found', message: err.message });
		}
		throw err;
	}

	if (!ownsSignup(identity, context.signup)) {
		return buildActionResult({
			success: false,
			reason: 'forbidden',
			message: 'You do not have access to this shift.'
		});
	}

	const cancellation = canCancelShift(context.shift, context.assignment);
	if (!cancellation.ok) {
		return buildActionResult({
			success: false,
			reason: cancellation.reason,
			message: 'This shift can no longer be cancelled.'
		});
	}

	const body = {
		cancelled_at: new Date().toISOString(),
		status: 'cancelled',
		confirmed_at: null
	};

	await callApi(fetch, 'volunteer-signup-shifts', {
		id: assignmentId,
		method: 'PUT',
		body
	});

	await sendHostNotification(fetch, assignmentId, 'cancel');

	return buildActionResult({
		success: true,
		assignmentId,
		event: context.event,
		shift: context.shift
	});
}

export async function uncancelShiftAction(event, assignmentId) {
	const { fetch, cookies } = event;
	const identity = await getIdentity(fetch, cookies);
	if (!identity.userId && !identity.email) {
		return buildActionResult({
			success: false,
			reason: 'login_required',
			message: 'Sign in to manage shifts.'
		});
	}

	let context;
	try {
		context = await loadAssignmentContext(fetch, assignmentId);
	} catch (err) {
		if (err?.status === 404) {
			return buildActionResult({ success: false, reason: 'not_found', message: err.message });
		}
		throw err;
	}

	if (!ownsSignup(identity, context.signup)) {
		return buildActionResult({
			success: false,
			reason: 'forbidden',
			message: 'You do not have access to this shift.'
		});
	}

	const shiftStart = parseDate(context.shift?.starts_at ?? context.shift?.startsAt ?? null);
	if (!shiftStart || shiftStart.getTime() <= Date.now()) {
		return buildActionResult({
			success: false,
			reason: 'past_shift',
			message: 'This shift has already started and cannot be changed.'
		});
	}

	await assertCapacityAvailable(fetch, context.shift);

	const body = {
		cancelled_at: null,
		status: 'pending',
		confirmed_at: null
	};

	await callApi(fetch, 'volunteer-signup-shifts', {
		id: assignmentId,
		method: 'PUT',
		body
	});

	await sendHostNotification(fetch, assignmentId, 'register');

	return buildActionResult({
		success: true,
		assignmentId,
		event: context.event,
		shift: context.shift
	});
}

export async function rescheduleShiftAction(event, assignmentId, newShiftId) {
	const { fetch, cookies } = event;
	const identity = await getIdentity(fetch, cookies);
	if (!identity.userId && !identity.email) {
		return buildActionResult({
			success: false,
			reason: 'login_required',
			message: 'Sign in to manage shifts.'
		});
	}

	let context;
	try {
		context = await loadAssignmentContext(fetch, assignmentId);
	} catch (err) {
		if (err?.status === 404) {
			return buildActionResult({ success: false, reason: 'not_found', message: err.message });
		}
		throw err;
	}

	if (!ownsSignup(identity, context.signup)) {
		return buildActionResult({
			success: false,
			reason: 'forbidden',
			message: 'You do not have access to this shift.'
		});
	}

	if (!newShiftId) {
		throw fail(400, { error: 'Select a new shift to reschedule.' });
	}

	const targetShift = await fetchSingle(fetch, 'volunteer-opportunity-shifts', {
		id: newShiftId,
		params: {
			select:
				'id,opportunity_id,starts_at,ends_at,timezone,location_name,location_address,capacity,notes'
		}
	});
	if (!targetShift) {
		return buildActionResult({
			success: false,
			reason: 'not_found',
			message: 'The selected shift is unavailable.'
		});
	}

	const targetOppId = normalizeId(targetShift.opportunity_id ?? targetShift.opportunityId);
	const currentOppId = normalizeId(context.shift?.opportunity_id ?? context.shift?.opportunityId);
	if (!targetOppId) {
		return buildActionResult({
			success: false,
			reason: 'invalid_shift',
			message: 'Unable to reschedule to the selected shift.'
		});
	}

	const [targetOpportunity, currentOpportunity] = await Promise.all([
		fetchSingle(fetch, 'volunteer-opportunities', {
			id: targetOppId,
			params: {
				select: 'id,event_id,title'
			}
		}),
		currentOppId
			? fetchSingle(fetch, 'volunteer-opportunities', {
					id: currentOppId,
					params: {
						select: 'id,event_id,title'
					}
				})
			: Promise.resolve(null)
	]);

	const targetEventId = normalizeId(targetOpportunity?.event_id ?? targetOpportunity?.eventId);
	const currentEventId = normalizeId(
		currentOpportunity?.event_id ??
			currentOpportunity?.eventId ??
			context.signup?.event_id ??
			context.signup?.eventId ??
			null
	);

	if (!targetEventId || !currentEventId || String(targetEventId) !== String(currentEventId)) {
		return buildActionResult({
			success: false,
			reason: 'different_event',
			message: 'Choose a shift from the same event to reschedule.'
		});
	}

	const targetStart = parseDate(targetShift.starts_at ?? targetShift.startsAt ?? null);
	if (!targetStart || targetStart.getTime() <= Date.now()) {
		return buildActionResult({
			success: false,
			reason: 'past_shift',
			message: 'Select an upcoming shift to reschedule.'
		});
	}

	await assertCapacityAvailable(fetch, targetShift, { excludeAssignmentId: assignmentId });

	const existingAssignments = await fetchList(fetch, 'volunteer-signup-shifts', {
		params: {
			signup_id: `eq.${context.signup.id}`,
			shift_id: `eq.${targetShift.id}`,
			select: 'id,status,cancelled_at'
		}
	});

	const activeExisting = existingAssignments.find(
		(row) => !isCancelled(row?.status) && !row?.cancelled_at
	);
	if (activeExisting) {
		return buildActionResult({
			success: false,
			reason: 'duplicate',
			message: 'You are already signed up for that shift.'
		});
	}

	await callApi(fetch, 'volunteer-signup-shifts', {
		id: assignmentId,
		method: 'PUT',
		body: {
			cancelled_at: new Date().toISOString(),
			status: 'cancelled',
			confirmed_at: null
		}
	});

	await sendHostNotification(fetch, assignmentId, 'cancel');

	const createResponse = await callApi(fetch, 'volunteer-signup-shifts', {
		method: 'POST',
		body: {
			signup_id: context.signup.id,
			shift_id: targetShift.id,
			status: 'pending'
		}
	});

	const created = createResponse?.data ?? createResponse;
	const newAssignmentId = normalizeId(created?.id ?? null);

	if (newAssignmentId) {
		await sendHostNotification(fetch, newAssignmentId, 'register');
	}

	const targetEvent = targetEventId
		? await fetchSingle(fetch, 'volunteer-events', {
				id: targetEventId,
				params: {
					select:
						'id,slug,title,event_start,event_end,timezone,location_name,location_address,status'
				}
			})
		: context.event;

	return buildActionResult({
		success: true,
		assignmentId,
		newAssignmentId,
		event: targetEvent,
		shift: targetShift
	});
}

export const shiftActionsHelpers = {
	confirmShiftAction,
	cancelShiftAction,
	uncancelShiftAction,
	rescheduleShiftAction,
	CONFIRM_WINDOW_HOURS
};

export {
	callApi,
	fetchList,
	fetchSingle,
	normalizeId,
	parseDate,
	isCancelled,
	isWaitlisted,
	loadAssignmentContext
};
