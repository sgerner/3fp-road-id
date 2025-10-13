import { redirect, fail } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import {
	shiftActionsHelpers,
	fetchList,
	fetchSingle,
	normalizeId,
	parseDate,
	isCancelled,
	isWaitlisted,
	isApproved
} from './shift-actions.server.js';

const {
	confirmShiftAction,
	cancelShiftAction,
	uncancelShiftAction,
	rescheduleShiftAction,
	CONFIRM_WINDOW_HOURS
} = shiftActionsHelpers;

function unique(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function toNumber(value) {
	if (value === null || value === undefined) return null;
	const num = Number(value);
	if (!Number.isFinite(num)) return null;
	return num;
}

function formatFeedback(notice, errorMessage) {
	if (!notice) return null;
	const key = notice.toLowerCase();
	switch (key) {
		case 'confirm_success':
			return { type: 'success', message: 'Shift confirmed. Thanks for being ready to help!' };
		case 'cancel_success':
			return { type: 'success', message: 'Shift cancelled. Your spot has been released.' };
		case 'uncancel_success':
			return { type: 'success', message: 'Shift re-activated. We look forward to seeing you!' };
		case 'reschedule_success':
			return { type: 'success', message: 'Shift updated. We saved your new time.' };
		case 'login_required':
			return { type: 'info', message: 'Please sign in to manage your volunteer shifts.' };
		case 'forbidden':
			return { type: 'error', message: 'We could not verify access to that shift.' };
		case 'not_found':
			return { type: 'error', message: 'That shift was not found or is no longer active.' };
		case 'confirm_window':
			return {
				type: 'error',
				message: `Shifts can only be confirmed within ${CONFIRM_WINDOW_HOURS} hours of the start time.`
			};
		case 'error':
			if (errorMessage) {
				return { type: 'error', message: errorMessage };
			}
			return { type: 'error', message: 'Something went wrong with your shift update.' };
		default:
			if (errorMessage) return { type: 'error', message: errorMessage };
			return null;
	}
}

function normalizeEvent(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: normalizeId(row.id),
		slug: row.slug ?? null,
		title: row.title ?? 'Untitled event',
		event_start: row.event_start ?? row.eventStart ?? null,
		event_end: row.event_end ?? row.eventEnd ?? null,
		timezone: row.timezone ?? null,
		location_name: row.location_name ?? row.locationName ?? null,
		location_address: row.location_address ?? row.locationAddress ?? null,
		status: row.status ?? null
	};
}

function normalizeOpportunity(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: normalizeId(row.id),
		event_id: normalizeId(row.event_id ?? row.eventId),
		title: row.title ?? 'Volunteer role',
		summary: row.summary ?? row.description ?? null
	};
}

function normalizeShift(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: normalizeId(row.id),
		opportunity_id: normalizeId(row.opportunity_id ?? row.opportunityId),
		starts_at: row.starts_at ?? row.startsAt ?? null,
		ends_at: row.ends_at ?? row.endsAt ?? null,
		timezone: row.timezone ?? null,
		location_name: row.location_name ?? row.locationName ?? null,
		location_address: row.location_address ?? row.locationAddress ?? null,
		notes: row.notes ?? null,
		capacity: row.capacity ?? null
	};
}

function normalizeAssignment(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: normalizeId(row.id),
		signup_id: normalizeId(row.signup_id ?? row.signupId),
		shift_id: normalizeId(row.shift_id ?? row.shiftId),
		status: row.status ?? null,
		confirmed_at: row.confirmed_at ?? row.confirmedAt ?? null,
		cancelled_at: row.cancelled_at ?? row.cancelledAt ?? null,
		created_at: row.created_at ?? row.createdAt ?? null,
		updated_at: row.updated_at ?? row.updatedAt ?? null
	};
}

function normalizeSignup(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: normalizeId(row.id),
		event_id: normalizeId(row.event_id ?? row.eventId),
		volunteer_user_id: normalizeId(
			row.volunteer_user_id ?? row.volunteerUserId ?? row.user_id ?? row.userId
		),
		volunteer_email: (row.volunteer_email ?? row.volunteerEmail ?? '').toLowerCase(),
		status: row.status ?? null
	};
}

function assignmentStatusLabel(assignment) {
	if (!assignment) return 'Pending';
	if (assignment.cancelled_at || isCancelled(assignment.status)) return 'Cancelled';
	const status = (assignment.status ?? '').toLowerCase();
	if (status === 'confirmed' || assignment.confirmed_at) return 'Confirmed';
	if (status === 'approved') return 'Approved';
	if (status === 'pending') return 'Pending approval';
	if (status === 'waitlisted') return 'Waitlisted';
	if (status) return status.charAt(0).toUpperCase() + status.slice(1);
	return 'Pending';
}

function calculateEventAvailableShifts(
	event,
	opportunities,
	allShifts,
	signupCounts,
	now = new Date()
) {
	if (!event) return [];
	const eventId = event.id;
	const relevantOpportunities = opportunities.filter((op) => op.event_id === eventId);
	if (!relevantOpportunities.length) return [];
	const opportunityIds = new Set(relevantOpportunities.map((op) => op.id));
	return allShifts
		.filter((shift) => opportunityIds.has(shift.opportunity_id))
		.map((shift) => {
			const count = signupCounts.get(shift.id) ?? 0;
			const capacity =
				shift.capacity !== null && shift.capacity !== undefined ? toNumber(shift.capacity) : null;
			const remaining = capacity === null ? null : Math.max(0, capacity - count);
			const shiftStart = parseDate(shift.starts_at);
			const isFuture = shiftStart ? shiftStart.getTime() > now.getTime() : true;
			const isAvailable = capacity === null ? isFuture : isFuture && remaining > 0;
			const opportunity =
				relevantOpportunities.find((op) => op.id === shift.opportunity_id) ?? null;
			return {
				shift,
				opportunity,
				count,
				remaining,
				capacity,
				isAvailable
			};
		})
		.filter((entry) => entry.isAvailable)
		.sort((a, b) => {
			const aStart = parseDate(a.shift.starts_at)?.getTime() ?? Infinity;
			const bStart = parseDate(b.shift.starts_at)?.getTime() ?? Infinity;
			return aStart - bStart;
		});
}

function categorizeAssignments(
	assignments,
	shiftsById,
	opportunitiesById,
	eventsById,
	availableByEvent,
	now = new Date()
) {
	const upcoming = new Map();
	const past = new Map();

	for (const assignment of assignments) {
		const shift = shiftsById.get(assignment.shift_id);
		const opportunity = shift ? opportunitiesById.get(shift.opportunity_id) : null;
		const event = opportunity ? eventsById.get(opportunity.event_id) : null;
		if (!shift || !opportunity || !event) continue;

		const shiftStart = parseDate(shift.starts_at);
		const shiftEnd = parseDate(shift.ends_at);
		const eventEnd = parseDate(event.event_end);
		const eventStart = parseDate(event.event_start);
		const comparisonTime = shiftStart ?? shiftEnd ?? eventEnd ?? eventStart;
		const isUpcoming = comparisonTime ? comparisonTime.getTime() >= now.getTime() : true;
		const targetMap = isUpcoming ? upcoming : past;
		const entry = targetMap.get(event.id) ?? {
			event,
			assignments: [],
			availableShifts: availableByEvent.get(event.id) ?? [],
			earliest: null,
			latest: null
		};
		entry.assignments.push({
			assignment,
			shift,
			opportunity,
			statusLabel: assignmentStatusLabel(assignment),
			shiftStart: shiftStart ? shiftStart.toISOString() : null,
			shiftEnd: shiftEnd ? shiftEnd.toISOString() : null
		});
		const timeForSort = comparisonTime ? comparisonTime.getTime() : null;
		if (timeForSort !== null) {
			if (entry.earliest === null || timeForSort < entry.earliest) entry.earliest = timeForSort;
			if (entry.latest === null || timeForSort > entry.latest) entry.latest = timeForSort;
		}
		targetMap.set(event.id, entry);
	}

	const toArray = (map, sortFn) =>
		Array.from(map.values()).sort((a, b) => {
			if (a.earliest === null && b.earliest === null) return 0;
			if (a.earliest === null) return 1;
			if (b.earliest === null) return -1;
			return sortFn(a.earliest, b.earliest);
		});

	return {
		upcoming: toArray(upcoming, (a, b) => a - b),
		past: toArray(past, (a, b) => b - a)
	};
}

export const load = async ({ fetch, cookies, url }) => {
	const now = new Date();
	const notice = url.searchParams.get('notice');
	const errorMessage = url.searchParams.get('error');
	const highlightedShiftId = normalizeId(url.searchParams.get('shift'));

	const feedback = formatFeedback(notice, errorMessage);

	const { user } = resolveSession(cookies);
	let sessionEmail = user?.email?.toLowerCase?.() ?? null;
	if (user?.id && !sessionEmail) {
		const profile = await fetchSingle(fetch, 'profiles', {
			params: {
				user_id: `eq.${user.id}`,
				select: 'email',
				single: 'true'
			}
		}).catch(() => null);
		sessionEmail = profile?.email?.toLowerCase?.() ?? null;
	}

	if (!user?.id && !sessionEmail) {
		return {
			user: null,
			profile: null,
			feedback,
			highlightedShiftId,
			upcomingEvents: [],
			pastEvents: [],
			retrievedAt: now.toISOString(),
			confirmWindowHours: CONFIRM_WINDOW_HOURS
		};
	}

	const filters = [];
	if (user?.id) filters.push(`volunteer_user_id.eq.${user.id}`);
	if (sessionEmail) filters.push(`volunteer_email.eq.${sessionEmail}`);

	let signupRows = [];
	if (filters.length) {
		const params = new URLSearchParams();
		params.set('select', 'id,event_id,volunteer_user_id,volunteer_email');
		params.set('order', 'created_at.desc');
		params.set('limit', '200');
		params.set('or', `(${filters.join(',')})`);
		signupRows = await fetchList(fetch, 'volunteer-signups', { params });
	}

	const signups = signupRows.map(normalizeSignup).filter(Boolean);
	const signupIds = unique(signups.map((signup) => signup.id));
	if (!signupIds.length) {
		return {
			user,
			profile: null,
			feedback,
			highlightedShiftId,
			upcomingEvents: [],
			pastEvents: [],
			retrievedAt: now.toISOString(),
			confirmWindowHours: CONFIRM_WINDOW_HOURS
		};
	}

	const signupById = new Map(signups.map((signup) => [signup.id, signup]));
	const eventIds = unique(signups.map((signup) => signup.event_id));

	const [eventsRaw, opportunitiesRaw] = await Promise.all([
		eventIds.length
			? fetchList(fetch, 'volunteer-events', {
					params: {
						id: `in.(${eventIds.join(',')})`,
						select:
							'id,slug,title,event_start,event_end,timezone,location_name,location_address,status'
					}
				})
			: Promise.resolve([]),
		eventIds.length
			? fetchList(fetch, 'volunteer-opportunities', {
					params: {
						event_id: `in.(${eventIds.join(',')})`,
						select: 'id,event_id,title,description'
					}
				})
			: Promise.resolve([])
	]);

	const events = eventsRaw.map(normalizeEvent).filter(Boolean);
	const eventById = new Map(events.map((event) => [event.id, event]));
	const opportunities = opportunitiesRaw.map(normalizeOpportunity).filter(Boolean);
	const opportunitiesById = new Map(opportunities.map((op) => [op.id, op]));
	const opportunityIds = unique(opportunities.map((op) => op.id));

	const [shiftRows, assignmentRows] = await Promise.all([
		opportunityIds.length
			? fetchList(fetch, 'volunteer-opportunity-shifts', {
					params: {
						opportunity_id: `in.(${opportunityIds.join(',')})`,
						select:
							'id,opportunity_id,starts_at,ends_at,timezone,location_name,location_address,capacity,notes'
					}
				})
			: Promise.resolve([]),
		signupIds.length
			? fetchList(fetch, 'volunteer-signup-shifts', {
					params: {
						signup_id: `in.(${signupIds.join(',')})`,
						select: 'id,signup_id,shift_id,status,confirmed_at,cancelled_at'
					}
				})
			: Promise.resolve([])
	]);

	const allShifts = shiftRows.map(normalizeShift).filter(Boolean);
	const shiftsById = new Map(allShifts.map((shift) => [shift.id, shift]));
	const assignments = assignmentRows.map(normalizeAssignment).filter(Boolean);

	const shiftIds = unique(allShifts.map((shift) => shift.id));
	const signupCountRows = shiftIds.length
		? await fetchList(fetch, 'volunteer-signup-shifts', {
				params: {
					shift_id: `in.(${shiftIds.join(',')})`,
					select: 'id,shift_id,status,cancelled_at'
				}
			})
		: [];

	const signupCounts = new Map();
	for (const row of signupCountRows) {
		const shiftId = normalizeId(row?.shift_id ?? row?.shiftId);
		if (!shiftId) continue;
		const status = row?.status ?? null;
		if (isCancelled(status) || row?.cancelled_at) continue;
		if (isWaitlisted(status)) continue;
		const current = signupCounts.get(shiftId) ?? 0;
		signupCounts.set(shiftId, current + 1);
	}

	const availableByEvent = new Map();
	for (const event of events) {
		const available = calculateEventAvailableShifts(
			event,
			opportunities,
			allShifts,
			signupCounts,
			now
		);
		availableByEvent.set(event.id, available);
	}

	const categorized = categorizeAssignments(
		assignments,
		shiftsById,
		opportunitiesById,
		eventById,
		availableByEvent,
		now
	);

	const annotatedUpcoming = categorized.upcoming.map((entry) => ({
		...entry,
		assignments: entry.assignments.map((item) => {
			const shift = item.shift;
			const assignment = item.assignment;
			const shiftStart = parseDate(shift.starts_at);
			const hoursUntil = shiftStart
				? (shiftStart.getTime() - now.getTime()) / (1000 * 60 * 60)
				: null;
			const status = assignment.status ?? null;
			let confirmBlockedReason = null;
			if (assignment.cancelled_at || isCancelled(status)) {
				confirmBlockedReason = 'cancelled';
			} else if (isWaitlisted(status)) {
				confirmBlockedReason = 'waitlisted';
			} else if (!isApproved(status)) {
				confirmBlockedReason = 'not_approved';
			} else if (assignment.confirmed_at) {
				confirmBlockedReason = 'already_confirmed';
			} else if (!shiftStart) {
				confirmBlockedReason = 'missing_start';
			} else if (hoursUntil !== null && hoursUntil < 0) {
				confirmBlockedReason = 'already_started';
			} else if (hoursUntil !== null && hoursUntil > CONFIRM_WINDOW_HOURS) {
				confirmBlockedReason = 'too_early';
			}
			const canConfirm = !confirmBlockedReason;
			const shiftEnd = parseDate(shift.ends_at);
			const canCancel =
				!assignment.cancelled_at &&
				!isCancelled(assignment.status) &&
				(!shiftEnd || shiftEnd.getTime() > now.getTime());
			const canUncancel =
				(!!assignment.cancelled_at || isCancelled(assignment.status)) &&
				shiftStart &&
				shiftStart.getTime() > now.getTime();
			const eventAvailable = availableByEvent.get(entry.event.id) ?? [];
			const hasRescheduleOption = eventAvailable.some(
				(candidate) => candidate.shift.id !== assignment.shift_id
			);
			const shiftStartIso = shiftStart ? shiftStart.toISOString() : null;
			return {
				...item,
				id: assignment.id,
				canConfirm,
				canCancel,
				canUncancel,
				confirmBlockedReason,
				canReschedule: hasRescheduleOption && shiftStart && shiftStart.getTime() > now.getTime(),
				hoursUntilStart: hoursUntil,
				shiftStartIso
			};
		})
	}));

	const annotatedPast = categorized.past.map((entry) => ({
		...entry,
		assignments: entry.assignments.map((item) => ({
			...item,
			id: item.assignment?.id ?? null,
			canConfirm: false,
			canCancel: false,
			canReschedule: false,
			hoursUntilStart: null
		}))
	}));

	return {
		user,
		profile: null,
		feedback,
		highlightedShiftId,
		upcomingEvents: annotatedUpcoming,
		pastEvents: annotatedPast,
		retrievedAt: now.toISOString(),
		confirmWindowHours: CONFIRM_WINDOW_HOURS,
		signupById: Object.fromEntries(signupById.entries())
	};
};

function buildRedirectParams(result, fallbackNotice) {
	const params = new URLSearchParams();
	if (result.success) {
		params.set('notice', fallbackNotice);
		if (result.newAssignmentId) {
			params.set('shift', String(result.newAssignmentId));
		} else if (result.assignmentId) {
			params.set('shift', String(result.assignmentId));
		}
		if (result.event?.slug) {
			params.set('event', result.event.slug);
		}
	} else {
		const noticeKey =
			result.reason === 'login_required'
				? 'login_required'
				: result.reason === 'not_found'
					? 'not_found'
					: result.reason === 'forbidden'
						? 'forbidden'
						: result.reason === 'too_early' || result.reason === 'already_started'
							? 'confirm_window'
							: result.reason
								? 'error'
								: 'error';
		params.set('notice', noticeKey);
		if (result.message) {
			params.set('error', result.message);
		}
		if (result.assignmentId) {
			params.set('shift', String(result.assignmentId));
		}
	}
	return params.toString();
}

export const actions = {
	confirm: async (event) => {
		const data = await event.request.formData();
		const assignmentId = data.get('assignment_id');
		if (!assignmentId) {
			return fail(400, { error: 'Missing shift reference.' });
		}
		const result = await confirmShiftAction(event, assignmentId);
		if (result.success) {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'confirm_success')}`);
		}
		if (result.reason === 'login_required') {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'login_required')}`);
		}
		return fail(400, {
			error: result.message ?? 'Unable to confirm shift.',
			assignmentId: normalizeId(assignmentId)
		});
	},
	cancel: async (event) => {
		const data = await event.request.formData();
		const assignmentId = data.get('assignment_id');
		if (!assignmentId) {
			return fail(400, { error: 'Missing shift reference.' });
		}
		const result = await cancelShiftAction(event, assignmentId);
		if (result.success) {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'cancel_success')}`);
		}
		if (result.reason === 'login_required') {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'login_required')}`);
		}
		return fail(400, {
			error: result.message ?? 'Unable to cancel shift.',
			assignmentId: normalizeId(assignmentId)
		});
	},
	uncancel: async (event) => {
		const data = await event.request.formData();
		const assignmentId = data.get('assignment_id');
		if (!assignmentId) {
			return fail(400, { error: 'Missing shift reference.' });
		}
		const result = await uncancelShiftAction(event, assignmentId);
		if (result.success) {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'uncancel_success')}`);
		}
		if (result.reason === 'login_required') {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'login_required')}`);
		}
		return fail(400, {
			error: result.message ?? 'Unable to un-cancel shift.',
			assignmentId: normalizeId(assignmentId)
		});
	},
	reschedule: async (event) => {
		const data = await event.request.formData();
		const assignmentId = data.get('assignment_id');
		const newShiftId = data.get('new_shift_id');
		if (!assignmentId || !newShiftId) {
			return fail(400, {
				error: 'Select a shift to reschedule into.',
				assignmentId: normalizeId(assignmentId)
			});
		}
		const result = await rescheduleShiftAction(event, assignmentId, newShiftId);
		if (result.success) {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'reschedule_success')}`);
		}
		if (result.reason === 'login_required') {
			throw redirect(303, `/volunteer/shifts?${buildRedirectParams(result, 'login_required')}`);
		}
		const message = result.message ?? 'Unable to reschedule this shift.';
		return fail(400, {
			error: message,
			assignmentId: normalizeId(assignmentId)
		});
	}
};
