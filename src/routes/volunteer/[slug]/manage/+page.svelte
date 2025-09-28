<script>
	import EventSummary from '$lib/components/volunteer/manage/EventSummary.svelte';
	import AnalyticsOverview from '$lib/components/volunteer/manage/AnalyticsOverview.svelte';
	import SignupManagement from '$lib/components/volunteer/manage/SignupManagement.svelte';
	import ApprovedRoster from '$lib/components/volunteer/manage/ApprovedRoster.svelte';
	import ActivityLog from '$lib/components/volunteer/manage/ActivityLog.svelte';
	import EventHostManagement from '$lib/components/volunteer/manage/EventHostManagement.svelte';
	import CommunicationsStep from '$lib/components/volunteer/CommunicationsStep.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		createVolunteerEventEmail,
		updateVolunteerEventEmail,
		deleteVolunteerEventEmail,
		createVolunteerSignupShift,
		deleteVolunteerSignupShift,
		updateVolunteerSignupShift
	} from '$lib/services/volunteers.js';

	const { data } = $props();

	const event = data?.event ?? {};
	const opportunitiesRaw = data?.opportunities ?? [];
	const signupsRaw = data?.signups ?? [];
	const signupShiftsRaw = data?.signupShifts ?? [];
	const signupResponsesRaw = data?.signupResponses ?? [];
	const customQuestionsRaw = data?.customQuestions ?? [];
	const eventEmailsRaw = data?.eventEmails ?? [];
	let profileRecords = $state(data?.profiles ?? []);
	const eventHosts = data?.eventHosts ?? [];
	const groupOwners = data?.groupOwners ?? [];
	const primaryHost =
		data?.primaryHost ?? (event?.host_user_id ? { user_id: event.host_user_id } : null);

	function toNumber(value) {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : 0;
	}

	function coerceArray(value) {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		return [value];
	}

	const eventTimezone =
		event.timezone || event.timezone_name || event.timezoneName || event.time_zone || 'UTC';

	function formatDate(value, timezone, options = {}) {
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
		try {
			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone || eventTimezone,
				...options
			});
			return formatter.format(date);
		} catch {
			return null;
		}
	}

	function formatShiftRange({ startsAt, endsAt, timezone }, { includeDay = false } = {}) {
		if (!startsAt && !endsAt) return '';
		const baseOptions = includeDay
			? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
			: { hour: 'numeric', minute: '2-digit' };
		const startLabel = startsAt ? formatDate(startsAt, timezone, baseOptions) : null;
		const endLabel = endsAt
			? formatDate(endsAt, timezone, { hour: 'numeric', minute: '2-digit' })
			: null;
		if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
		return startLabel || endLabel || '';
	}

	function formatEventWindow(details) {
		if (!details) return 'Schedule coming soon';
		const start = formatDate(
			details.eventStart || details.starts_at || details.startsAt,
			eventTimezone,
			{
				dateStyle: 'medium',
				timeStyle: 'short'
			}
		);
		const end = formatDate(details.eventEnd || details.ends_at || details.endsAt, eventTimezone, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
		if (start && end) return `${start} → ${end}`;
		return start || end || 'Schedule coming soon';
	}

	const eventWindowLabel = formatEventWindow({
		eventStart: event.event_start || event.starts_at || event.eventStart,
		eventEnd: event.event_end || event.ends_at || event.eventEnd
	});

	const eventLocationLabel =
		event?.location_name?.trim() ||
		event?.location_address?.trim() ||
		event?.meeting_location?.trim() ||
		event?.meeting_address?.trim() ||
		'Location to be announced';

	const eventStatusLabel = (() => {
		const raw =
			event?.status || event?.volunteer_event_status || event?.event_status || event?.state || '';
		if (!raw) return 'Active';
		return String(raw)
			.replace(/[_-]+/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	})();

	const eventDescription =
		event?.summary?.trim() ||
		event?.short_description?.trim() ||
		event?.description?.trim() ||
		event?.details?.trim() ||
		'';

	function normalizeShift(opportunity, shift) {
		if (!shift) return null;
		const id = shift.id ? String(shift.id) : null;
		if (!id) return null;
		const timezone = shift.timezone || shift.time_zone || opportunity?.timezone || eventTimezone;
		const startsAt = shift.starts_at || shift.startsAt || shift.begin_at || null;
		const endsAt = shift.ends_at || shift.endsAt || shift.finish_at || null;
		const windowLabel = formatShiftRange({ startsAt, endsAt, timezone });
		const optionLabel = formatShiftRange({ startsAt, endsAt, timezone }, { includeDay: true });
		const capacity = toNumber(shift.capacity ?? shift.max_volunteers ?? shift.max_signups);
		const durationMinutes = toNumber(
			shift.duration_minutes ?? shift.durationMinutes ?? shift.duration ?? shift.minutes
		);
		const expectedHoursRaw = toNumber(
			shift.expected_hours ?? shift.expectedHours ?? shift.hours ?? durationMinutes / 60
		);
		return {
			id,
			opportunityId: opportunity?.id ? String(opportunity.id) : null,
			opportunityTitle: opportunity?.title || 'Volunteer activity',
			timezone,
			startsAt,
			endsAt,
			windowLabel,
			optionLabel,
			capacity: capacity > 0 ? capacity : null,
			expectedHours: expectedHoursRaw > 0 ? expectedHoursRaw : null
		};
	}

	const opportunityGroups = opportunitiesRaw.map((opportunity) => {
		const id = opportunity?.id ? String(opportunity.id) : null;
		const title = opportunity?.title?.trim() || 'Volunteer activity';
		const shifts = coerceArray(opportunity?.shifts)
			.map((shift) => normalizeShift(opportunity, shift))
			.filter(Boolean);
		return { id, title, shifts };
	});

	const shiftMap = new SvelteMap(
		opportunityGroups
			.flatMap((group) => group.shifts.map((shift) => [shift.id, { ...shift, groupId: group.id }]))
			.filter(([key]) => key)
	);

	const profilesByUserId = $derived(
		new SvelteMap(
			profileRecords
				.filter((profile) => profile?.user_id || profile?.userId)
				.map((profile) => [String(profile.user_id ?? profile.userId), profile])
		)
	);

	const profilesById = $derived(
		new SvelteMap(
			profileRecords
				.filter((profile) => profile?.id)
				.map((profile) => [String(profile.id), profile])
		)
	);

	const responsesBySignupId = new SvelteMap();
	for (const row of signupResponsesRaw ?? []) {
		const signupId = row?.signup_id ?? row?.volunteer_signup_id ?? row?.signupId;
		if (!signupId) continue;
		const key = String(signupId);
		if (!responsesBySignupId.has(key)) responsesBySignupId.set(key, []);
		responsesBySignupId.get(key)?.push({
			id: row?.id ? String(row.id) : undefined,
			questionId: row?.question_id ?? row?.custom_question_id ?? null,
			response:
				row?.response ??
				row?.answer ??
				row?.value ??
				row?.text ??
				row?.freeform_response ??
				row?.selection ??
				'',
			createdAt: row?.created_at ?? row?.createdAt ?? null
		});
	}

	for (const entries of responsesBySignupId.values()) {
		entries.sort((a, b) => {
			const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
			const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
			return timeA - timeB;
		});
	}

	function normalizeAssignment(row) {
		if (!row) return null;
		const id = row?.id ? String(row.id) : null;
		const signupId = row?.signup_id ?? row?.volunteer_signup_id ?? row?.signupId;
		const shiftId = row?.shift_id ?? row?.volunteer_shift_id ?? row?.shiftId ?? null;
		const status = row?.status || row?.attendance_status || 'pending';
		const attendanceStatus = status.toLowerCase();
		const attended =
			row?.attended === true ||
			['checked_in', 'present', 'attended', 'complete', 'confirmed'].includes(attendanceStatus);

		const recordedHours = toNumber(
			row?.hours_recorded ?? row?.hours_logged ?? row?.confirmed_hours ?? row?.hours
		);
		return {
			id,
			signupId: signupId ? String(signupId) : null,
			shiftId: shiftId ? String(shiftId) : null,
			status,
			attendanceStatus,
			attended,
			recordedHours: recordedHours > 0 ? recordedHours : 0
		};
	}

	const assignmentsBySignupId = new SvelteMap();
	for (const row of signupShiftsRaw ?? []) {
		const assignment = normalizeAssignment(row);
		if (!assignment?.signupId) continue;
		const key = assignment.signupId;
		if (!assignmentsBySignupId.has(key)) assignmentsBySignupId.set(key, []);
		assignmentsBySignupId.get(key)?.push(assignment);
	}

	for (const assignments of assignmentsBySignupId.values()) {
		assignments.sort((a, b) => {
			const shiftA = shiftMap.get(a.shiftId ?? '') ?? {};
			const shiftB = shiftMap.get(b.shiftId ?? '') ?? {};
			const startA = shiftA.startsAt ? new Date(shiftA.startsAt).getTime() : 0;
			const startB = shiftB.startsAt ? new Date(shiftB.startsAt).getTime() : 0;
			return startA - startB;
		});
	}

	function deriveAttendance(assignments = []) {
		let attended = false;
		let checkIn = null;
		for (const assignment of assignments) {
			if (assignment.attended) attended = true;
			if (
				['no_show', 'no-show', 'noshow', 'absent', 'missing'].includes(assignment.attendanceStatus)
			) {
				attended = false;
			}
			if (!checkIn && assignment.checkedInAt) {
				const shift = shiftMap.get(assignment.shiftId ?? '') ?? {};
				checkIn = formatDate(assignment.checkedInAt, shift.timezone, {
					hour: 'numeric',
					minute: '2-digit'
				});
			}
		}
		return { attended, checkIn };
	}

	function calculateScheduledHours(assignments = []) {
		if (!assignments.length) return 0;
		let total = 0;
		for (const assignment of assignments) {
			if (assignment.recordedHours > 0) {
				total += assignment.recordedHours;
				continue;
			}
			const shift = shiftMap.get(assignment.shiftId ?? '') ?? null;
			if (shift?.expectedHours) {
				total += shift.expectedHours;
			}
		}
		return total;
	}

	function findProfileForSignup(signup) {
		const userId =
			signup?.volunteer_user_id ?? signup?.volunteerUserId ?? signup?.user_id ?? signup?.userId;
		const profileId =
			signup?.volunteer_profile_id ??
			signup?.volunteerProfileId ??
			signup?.profile_id ??
			signup?.profileId;

		return (
			profileRecords.find((p) => {
				if (userId && String(p.user_id) === String(userId)) return true;
				if (profileId && String(p.id) === String(profileId)) return true;
				return false;
			}) ?? null
		);
	}

	function normalizeVolunteer(signup, assignments, responses, profile) {
		const statuses = assignments.map((a) => a.status);
		let status = 'pending';
		if (statuses.includes('approved')) {
			status = 'approved';
		} else if (statuses.includes('waitlisted')) {
			status = 'waitlisted';
		} else if (statuses.includes('declined')) {
			status = 'declined';
		} else if (statuses.includes('cancelled')) {
			status = 'cancelled';
		}

		const waitlisted = status === 'waitlisted';
		const attendance = deriveAttendance(assignments);
		let shiftIds = assignments
			.map((assignment) => assignment.shiftId)
			.filter((value) => value !== null && value !== undefined);

		if (shiftIds.length === 0 && signup.opportunity_id) {
			const opportunityId = String(signup.opportunity_id);
			const opportunity = opportunityGroups.find((group) => group.id === opportunityId);
			if (opportunity) {
				shiftIds = opportunity.shifts.map((shift) => shift.id);
			}
		}

		const primaryShiftId = shiftIds[0] ?? null;
		const scheduledHours = calculateScheduledHours(assignments);
		const nameSource =
			profile?.full_name ||
			signup?.volunteer_name ||
			signup?.full_name ||
			signup?.volunteer_email ||
			'Volunteer';

		return {
			id: signup?.id ? String(signup.id) : undefined,
			signupId: signup?.id ? String(signup.id) : undefined,
			signup,
			assignments,
			responses,
			profile,
			name: nameSource,
			email: signup?.volunteer_email || signup?.email || profile?.email || '',
			phone: signup?.volunteer_phone || signup?.phone || profile?.phone || '',
			status,
			waitlisted,
			attended: attendance.attended,
			checkIn: attendance.checkIn,
			shiftIds,
			primaryShiftId,
			scheduledHours,
			emergencyContactName: profile?.emergency_contact_name || '',
			emergencyContactPhone: profile?.emergency_contact_phone || '',
			notes: signup?.host_notes || signup?.notes || signup?.internal_notes || '',
			displayShifts: shiftIds.map((id) => shiftMap.get(id)?.windowLabel).filter(Boolean)
		};
	}

	const initialVolunteers = signupsRaw.map((signup) => {
		const assignments = assignmentsBySignupId.get(String(signup.id)) ?? [];
		const responses = responsesBySignupId.get(String(signup.id)) ?? [];
		const profile = findProfileForSignup(signup);
		return normalizeVolunteer(signup, assignments, responses, profile);
	});

	let volunteers = $state(initialVolunteers);
	let activityLog = $state([]);

	function updateVolunteerState(id, updates) {
		volunteers = volunteers.map((volunteer) => {
			if (volunteer.id !== id) return volunteer;
			const nextSignup = updates.signup ?? volunteer.signup;
			const nextAssignments = updates.assignments ?? volunteer.assignments;
			const nextResponses = updates.responses ?? volunteer.responses;
			const nextProfile = updates.profile ?? volunteer.profile;
			return normalizeVolunteer(nextSignup, nextAssignments, nextResponses, nextProfile);
		});
	}

	function addActivityEntry(message) {
		if (!message) return;
		activityLog = [message, ...activityLog].slice(0, 50);
	}

	function volunteerById(id) {
		return volunteers.find((volunteer) => volunteer.id === id);
	}

	async function updateAssignmentStatus(assignmentId, status) {
		if (!assignmentId) return;
		let volunteerToUpdate = null;
		let assignmentToUpdate = null;

		for (const v of volunteers) {
			const found = v.assignments.find((a) => a.id === assignmentId);
			if (found) {
				volunteerToUpdate = v;
				assignmentToUpdate = found;
				break;
			}
		}

		if (!volunteerToUpdate || !assignmentToUpdate) return;

		try {
			const response = await updateVolunteerSignupShift(assignmentId, { status });
			const updatedAssignment = normalizeAssignment(
				response?.data ?? response ?? { ...assignmentToUpdate, status }
			);

			const nextAssignments = volunteerToUpdate.assignments.map((a) =>
				a.id === assignmentId ? updatedAssignment : a
			);
			updateVolunteerState(volunteerToUpdate.id, { assignments: nextAssignments });
			addActivityEntry(`Set status to ${status} for ${volunteerToUpdate.name}'s shift.`);
		} catch (error) {
			console.error(`Failed to set status to ${status}`, error);
			addActivityEntry(`Failed to update status for ${volunteerToUpdate.name}.`);
		}
	}

	function approveAssignment(assignmentId) {
		updateAssignmentStatus(assignmentId, 'approved');
	}

	function declineAssignment(assignmentId) {
		updateAssignmentStatus(assignmentId, 'declined');
	}

	function waitlistAssignment(assignmentId) {
		const volunteer = volunteers.find((v) => v.assignments.some((a) => a.id === assignmentId));
		if (!volunteer) return;
		const isWaitlisted = volunteer.status === 'waitlisted';
		updateAssignmentStatus(assignmentId, isWaitlisted ? 'pending' : 'waitlisted');
	}

	async function setAssignmentPresent(assignmentId, status) {
		if (!assignmentId) return;
		let volunteerToUpdate = null;
		let assignmentToUpdate = null;

		for (const v of volunteers) {
			const found = v.assignments.find((a) => a.id === assignmentId);
			if (found) {
				volunteerToUpdate = v;
				assignmentToUpdate = found;
				break;
			}
		}

		if (!volunteerToUpdate || !assignmentToUpdate) return;

		try {
			const response = await updateVolunteerSignupShift(assignmentId, { status });
			const updatedAssignment = normalizeAssignment(
				response?.data ?? response ?? { ...assignmentToUpdate, status }
			);

			const nextAssignments = volunteerToUpdate.assignments.map((a) =>
				a.id === assignmentId ? updatedAssignment : a
			);
			updateVolunteerState(volunteerToUpdate.id, { assignments: nextAssignments });
			addActivityEntry(`Set status to ${status} for ${volunteerToUpdate.name}'s shift.`);
		} catch (error) {
			console.error(`Failed to set status to ${status}`, error);
			addActivityEntry(`Failed to update status for ${volunteerToUpdate.name}.`);
		}
	}

	async function moveVolunteerToShift(id, shiftId) {
		const volunteer = volunteerById(id);
		if (!volunteer?.signupId) return;
		const normalizedShiftId = shiftId ? String(shiftId) : '';
		const assignments = volunteer.assignments ?? [];

		if (!normalizedShiftId) {
			try {
				for (const assignment of assignments) {
					if (!assignment?.id) continue;
					try {
						await deleteVolunteerSignupShift(assignment.id);
					} catch (error) {
						console.warn('Failed to clear shift assignment', error);
					}
				}

				updateVolunteerState(id, { assignments: [] });
				addActivityEntry(`Removed ${volunteer.name} from all shifts.`);
			} catch (error) {
				console.error('Failed to remove volunteer shift', error);
				addActivityEntry(`Failed to remove ${volunteer.name} from their shift.`);
			}
			return;
		}

		if (volunteer.primaryShiftId === normalizedShiftId) {
			return;
		}

		const shift = shiftMap.get(normalizedShiftId);
		if (!shift) return;

		const existingAssignment = assignments.find(
			(assignment) => assignment.shiftId === normalizedShiftId
		);
		if (existingAssignment) {
			const remaining = assignments.filter(
				(assignment) => assignment.id && assignment.id !== existingAssignment.id
			);
			for (const extra of remaining) {
				try {
					await deleteVolunteerSignupShift(extra.id);
				} catch (error) {
					console.warn('Failed to remove extra shift assignment', error);
				}
			}
			updateVolunteerState(id, { assignments: [existingAssignment] });
			addActivityEntry(`Confirmed ${volunteer.name}'s assignment for ${shift.optionLabel}.`);
			return;
		}

		try {
			let nextAssignments = [];
			if (assignments.length) {
				const [primary, ...rest] = assignments;
				if (primary?.id) {
					const response = await updateVolunteerSignupShift(primary.id, {
						shift_id: normalizedShiftId
					});
					const payload = response?.data ?? response ?? { ...primary, shift_id: normalizedShiftId };
					const updatedPrimary = normalizeAssignment({ ...payload, shift_id: normalizedShiftId });
					if (updatedPrimary) {
						nextAssignments = [updatedPrimary];
					}
				}
				for (const extra of rest) {
					if (!extra?.id) continue;
					try {
						await deleteVolunteerSignupShift(extra.id);
					} catch (error) {
						console.warn('Failed to remove extra shift assignment', error);
						nextAssignments.push(extra);
					}
				}
			}

			if (!nextAssignments.length) {
				const response = await createVolunteerSignupShift({
					signup_id: volunteer.signupId,
					shift_id: normalizedShiftId,
					status: 'pending'
				});
				const created = response?.data ??
					response ?? {
						signup_id: volunteer.signupId,
						shift_id: normalizedShiftId
					};
				const normalized = normalizeAssignment(created);
				if (normalized) {
					nextAssignments = [normalized];
				}
			}

			updateVolunteerState(id, { assignments: nextAssignments, signup: volunteer.signup });
			addActivityEntry(`Moved ${volunteer.name} to ${shift.optionLabel}.`);
		} catch (error) {
			console.error('Failed to move volunteer shift', error);
			addActivityEntry(`Failed to move ${volunteer.name} to the selected shift.`);
		}
	}

	function profileMatchesEmail(profile, email) {
		if (!profile) return false;
		const profileEmail = (profile?.email ?? '').trim().toLowerCase();
		return profileEmail && profileEmail === email;
	}

	function normalizeProfileForVolunteer(profile, details) {
		if (!profile) {
			return {
				email: details.email,
				full_name: details.name || null,
				phone: details.phone || null,
				emergency_contact_name: details.emergencyContactName || null,
				emergency_contact_phone: details.emergencyContactPhone || null
			};
		}

		return {
			...profile,
			email: details.email,
			full_name: details.name || profile.full_name || profile.name || null,
			phone: details.phone || profile.phone || null,
			emergency_contact_name:
				details.emergencyContactName || profile.emergency_contact_name || null,
			emergency_contact_phone:
				details.emergencyContactPhone || profile.emergency_contact_phone || null
		};
	}

	async function addVolunteerToShift(details) {
		const email = (details?.email ?? '').trim();
		const normalizedEmail = email.toLowerCase();
		if (!email) {
			return { ok: false, error: 'Email is required.' };
		}

		const shiftId = details?.shiftId ?? '';
		const shift = shiftMap.get(shiftId);
		if (!shift) {
			return { ok: false, error: 'Select a valid shift to assign the volunteer.' };
		}

		const duplicate = volunteers.find(
			(volunteer) =>
				volunteer.email?.toLowerCase() === normalizedEmail &&
				(volunteer.assignments ?? []).some((assignment) => assignment.shiftId === shiftId)
		);
		if (duplicate) {
			return {
				ok: false,
				error: 'That volunteer is already assigned to the selected shift.'
			};
		}

		const name = (details?.name ?? '').trim();
		const phone = (details?.phone ?? '').trim();
		const emergencyContactName = (details?.emergencyContactName ?? '').trim();
		const emergencyContactPhone = (details?.emergencyContactPhone ?? '').trim();
		const status = details?.status ?? 'approved';

		let profile = null;
		if (details?.profileId) {
			profile = profileRecords.find((p) => String(p.id) === String(details.profileId)) ?? null;
		}
		if (!profile) {
			profile = profileRecords.find((p) => profileMatchesEmail(p, normalizedEmail)) ?? null;
		}

		if (!profile) {
			try {
				const response = await fetch('/api/v1/profiles', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email,
						full_name: name || null,
						phone: phone || null,
						emergency_contact_name: emergencyContactName || null,
						emergency_contact_phone: emergencyContactPhone || null
					})
				});
				const payload = await response.json();
				if (!response.ok) {
					throw new Error(payload?.error || 'Unable to create profile.');
				}
				profile = payload?.data ?? payload ?? null;
				if (profile) {
					profileRecords = [profile, ...profileRecords];
				}
			} catch (error) {
				console.error('Failed to create volunteer profile', error);
				return {
					ok: false,
					error: error?.message || 'Unable to create volunteer profile.'
				};
			}
		} else if (profile?.id) {
			const updates = {};
			if (name && name !== (profile.full_name ?? profile.name ?? '')) {
				updates.full_name = name;
			}
			if (phone && phone !== (profile.phone ?? '')) {
				updates.phone = phone;
			}
			if (emergencyContactName && emergencyContactName !== (profile.emergency_contact_name ?? '')) {
				updates.emergency_contact_name = emergencyContactName;
			}
			if (
				emergencyContactPhone &&
				emergencyContactPhone !== (profile.emergency_contact_phone ?? '')
			) {
				updates.emergency_contact_phone = emergencyContactPhone;
			}

			if (Object.keys(updates).length > 0) {
				try {
					const response = await fetch(`/api/v1/profiles/${profile.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(updates)
					});
					const payload = await response.json();
					if (response.ok) {
						profile = payload?.data ?? payload ?? profile;
						profileRecords = profileRecords.map((row) =>
							String(row.id) === String(profile.id) ? profile : row
						);
					} else {
						console.warn('Unable to update profile details', payload?.error);
					}
				} catch (error) {
					console.warn('Failed to update volunteer profile details', error);
				}
			}
		}

		const volunteerUserId =
			details?.userId ?? profile?.user_id ?? profile?.userId ?? profile?.volunteer_user_id ?? null;
		const volunteerProfileId = profile?.id ?? null;
		const volunteerName = profile?.full_name || email;

		let signupRecord;
		try {
			const response = await createVolunteerSignup({
				event_id: event?.id ?? null,
				opportunity_id: shift?.opportunityId ?? shift?.groupId ?? null,
				volunteer_user_id: volunteerUserId,
				volunteer_profile_id: volunteerProfileId,
				volunteer_name: volunteerName,
				volunteer_email: email,
				volunteer_phone: phone || profile?.phone || null,
				emergency_contact_name: emergencyContactName || profile?.emergency_contact_name || null,
				emergency_contact_phone: emergencyContactPhone || profile?.emergency_contact_phone || null,
				signed_waiver: true,
				source: 'host-added'
			});
			signupRecord = response?.data ?? response;
			if (!signupRecord?.id) {
				throw new Error('Signup creation failed.');
			}
		} catch (error) {
			console.error('Failed to create volunteer signup', error);
			return {
				ok: false,
				error: error?.message || 'Unable to create the volunteer signup.'
			};
		}

		let assignment;
		try {
			const response = await createVolunteerSignupShift({
				signup_id: signupRecord.id,
				shift_id: shiftId,
				status
			});
			const created = response?.data ??
				response ?? {
					signup_id: signupRecord.id,
					shift_id: shiftId,
					status
				};
			assignment = normalizeAssignment(created);
		} catch (error) {
			console.error('Failed to create volunteer shift assignment', error);
			return {
				ok: false,
				error: error?.message || 'Unable to assign the volunteer to the shift.'
			};
		}

		const volunteerProfile = normalizeProfileForVolunteer(profile, {
			email,
			name,
			phone,
			emergencyContactName,
			emergencyContactPhone
		});
		const volunteerEntry = normalizeVolunteer(signupRecord, [assignment], [], volunteerProfile);
		volunteers = [volunteerEntry, ...volunteers];
		addActivityEntry(`Added ${volunteerEntry.name} to ${shift.optionLabel} as ${status}.`);

		return {
			ok: true,
			message: `${volunteerEntry.name} was added to ${shift.optionLabel}.`
		};
	}
	const statusFilters = [
		{ value: 'all', label: 'All statuses' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'waitlisted', label: 'Waitlisted' },
		{ value: 'declined', label: 'Declined' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	const activityFilterOptions = opportunityGroups
		.filter((group) => group.id && group.shifts.length)
		.map((group) => ({ value: group.id, label: group.title }));

	const initialActivity =
		activityFilterOptions.length === 1 ? activityFilterOptions[0].value : 'all';

	let selectedStatus = $state('all');
	let selectedActivityId = $state(initialActivity);
	let selectedShiftId = $state('all');
	let searchTerm = $state('');

	function handleActivityChange(value) {
		selectedActivityId = value;
		selectedShiftId = 'all';
	}

	const shiftFilterOptions = $derived.by(() => {
		if (selectedActivityId === 'all') return [];
		const group = opportunityGroups.find((item) => item.id === selectedActivityId);
		if (!group) return [];
		return group.shifts.map((shift) => ({ value: shift.id, label: shift.optionLabel }));
	});

	const filteredVolunteers = $derived.by(() => {
		const term = searchTerm.trim().toLowerCase();
		return volunteers.filter((volunteer) => {
			const matchesStatus = selectedStatus === 'all' ? true : volunteer.status === selectedStatus;
			const matchesActivity =
				selectedActivityId === 'all'
					? true
					: (volunteer.shiftIds ?? []).some(
							(id) => shiftMap.get(id)?.groupId === selectedActivityId
						);
			const matchesShift =
				selectedActivityId !== 'all' && selectedShiftId !== 'all'
					? (volunteer.shiftIds ?? []).includes(selectedShiftId)
					: true;
			const matchesSearch = term
				? `${volunteer.name} ${volunteer.email} ${volunteer.phone}`.toLowerCase().includes(term)
				: true;
			return matchesStatus && matchesActivity && matchesShift && matchesSearch;
		});
	});

	const volunteerCounts = $derived({
		total: volunteers.length,
		approved: volunteers.filter((v) => v.status === 'approved').length,
		pending: volunteers.filter((v) => v.status === 'pending').length,
		waitlisted: volunteers.filter((v) => v.status === 'waitlisted').length,
		declined: volunteers.filter((v) => v.status === 'declined').length,
		cancelled: volunteers.filter((v) => v.status === 'cancelled').length,
		attending: volunteers.filter((v) => v.attended).length,
		hours: volunteers.reduce((total, v) => total + toNumber(v.scheduledHours), 0)
	});

	const shiftOptions = Array.from(shiftMap.values());

	const shiftSummaries = $derived(
		opportunityGroups.map((group) => {
			if (group.shifts.length === 0) {
				const opportunityId = group.id;
				const opportunityDetails = opportunitiesRaw.find((o) => String(o.id) === opportunityId);
				const capacity = toNumber(
					opportunityDetails?.capacity ?? opportunityDetails?.max_volunteers ?? null
				);

				const assigned = volunteers.filter(
					(v) =>
						String(v.signup.opportunity_id) === opportunityId &&
						v.assignments.length === 0 &&
						v.status === 'approved'
				);
				const waitlisted = volunteers.filter(
					(v) =>
						String(v.signup.opportunity_id) === opportunityId &&
						v.assignments.length === 0 &&
						v.status === 'waitlisted'
				);
				const attending = assigned.filter((v) => v.attended);

				return {
					id: group.id,
					title: group.title,
					shifts: [
						{
							id: group.id,
							label: 'All participants',
							windowLabel: '',
							capacity: capacity > 0 ? capacity : null,
							approved: assigned.length,
							waitlisted: waitlisted.length,
							attending: attending.length
						}
					]
				};
			}

			return {
				id: group.id,
				title: group.title,
				shifts: group.shifts.map((shift) => {
					const assigned = volunteers.filter(
						(volunteer) =>
							(volunteer.assignments ?? []).some((a) => a.shiftId === shift.id) &&
							volunteer.status === 'approved'
					);
					const waitlisted = volunteers.filter(
						(volunteer) =>
							(volunteer.assignments ?? []).some((a) => a.shiftId === shift.id) &&
							volunteer.status === 'waitlisted'
					);
					const attending = assigned.filter((volunteer) => volunteer.attended);
					return {
						id: shift.id,
						label: shift.optionLabel,
						windowLabel: shift.windowLabel,
						capacity: shift.capacity,
						approved: assigned.length,
						waitlisted: waitlisted.length,
						attending: attending.length
					};
				})
			};
		})
	);

	function normalizeEmailRecord(row) {
		if (!row) return null;
		const sendOffsetMinutes = toNumber(
			row.send_offset_minutes ?? row.sendOffsetMinutes ?? row.schedule_offset_minutes
		);
		const rawType = (row.email_type ?? row.emailType ?? 'reminder').toLowerCase();
		const normalizedType = rawType === 'thank_you' ? 'thankyou' : rawType;
		return {
			id: row.id ? String(row.id) : null,
			eventId: row.event_id ? String(row.event_id) : event?.id ? String(event.id) : null,
			emailType: ['reminder', 'thankyou', 'custom'].includes(normalizedType)
				? normalizedType
				: 'reminder',
			subject: row.subject ?? '',
			body: row.body ?? '',
			sendOffsetMinutes: Number.isFinite(sendOffsetMinutes) ? sendOffsetMinutes : 1440,
			requireConfirmation: !!(row.require_confirmation ?? row.requireConfirmation),
			surveyUrl: row.survey_url ?? row.surveyUrl ?? '',
			createdAt: row.created_at ?? row.createdAt ?? null,
			updatedAt: row.updated_at ?? row.updatedAt ?? null
		};
	}

	let eventEmails = $state(
		eventEmailsRaw.map((record) => normalizeEmailRecord(record)).filter(Boolean)
	);

	function updateEmailLocal(id, patch) {
		eventEmails = eventEmails.map((email) => (email.id === id ? { ...email, ...patch } : email));
	}

	function upsertEmail(record) {
		const normalized = normalizeEmailRecord(record);
		if (!normalized) return;
		const index = eventEmails.findIndex((email) => email.id === normalized.id);
		if (index >= 0) {
			const next = [...eventEmails];
			next[index] = normalized;
			eventEmails = next;
		} else {
			eventEmails = [normalized, ...eventEmails];
		}
	}

	function buildEmailPayload(email) {
		const sendOffsetMinutes = Math.round(email.sendOffsetMinutes ?? 0);
		const emailType = email.emailType === 'thankyou' ? 'thank_you' : email.emailType;
		return {
			event_id: email.eventId ?? (event?.id ? String(event.id) : null),
			email_type: emailType,
			subject: email.subject ?? '',
			body: email.body ?? '',
			send_offset_minutes: Number.isFinite(sendOffsetMinutes) ? sendOffsetMinutes : 0,
			require_confirmation: email.requireConfirmation ?? false,
			survey_url: email.surveyUrl ?? ''
		};
	}

	async function addEmailTemplate() {
		if (!event?.id) return;
		const payload = {
			event_id: event.id,
			email_type: 'reminder',
			subject: '',
			body: '',
			send_offset_minutes: 1440,
			require_confirmation: false,
			survey_url: ''
		};
		try {
			const response = await createVolunteerEventEmail(payload);
			const created = response?.data ?? response;
			if (created) {
				upsertEmail(created);
			}
		} catch (error) {
			console.error('Failed to create volunteer email', error);
		}
	}

	async function removeEmailTemplate(id) {
		if (!id) return;
		try {
			await deleteVolunteerEventEmail(id);
			eventEmails = eventEmails.filter((email) => email.id !== id);
		} catch (error) {
			console.error('Failed to delete volunteer email', error);
		}
	}

	const persistableEmailFields = new Set([
		'emailType',
		'subject',
		'body',
		'sendOffsetMinutes',
		'requireConfirmation',
		'surveyUrl'
	]);

	async function updateEmailTemplate(id, patch) {
		updateEmailLocal(id, patch);
		const shouldPersist = Object.keys(patch).some((key) => persistableEmailFields.has(key));
		if (!shouldPersist) return;
		const current = eventEmails.find((email) => email.id === id);
		if (!current) return;
		try {
			const payload = buildEmailPayload(current);
			const response = await updateVolunteerEventEmail(id, payload);
			const updated = response?.data ?? response ?? current;
			upsertEmail(updated);
		} catch (error) {
			console.error('Failed to update volunteer email', error);
		}
	}

	const customQuestions = customQuestionsRaw ?? [];
	async function setAssignmentsPresent(assignmentIds, status) {
		for (const assignmentId of assignmentIds) {
			await setAssignmentPresent(assignmentId, status);
		}
		addActivityEntry(`Set status to ${status} for ${assignmentIds.length} volunteers.`);
	}
</script>

<svelte:head>
	<title>Volunteer Event Management</title>
</svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-8 px-2 py-10">
	<EventSummary
		title={event?.title || 'Volunteer Event Management'}
		status={eventStatusLabel}
		schedule={eventWindowLabel}
		location={eventLocationLabel}
		description={eventDescription}
		counts={volunteerCounts}
	/>

	<AnalyticsOverview counts={volunteerCounts} shiftGroups={shiftSummaries} />

	<SignupManagement
		volunteers={filteredVolunteers}
		{statusFilters}
		activityFilters={activityFilterOptions}
		shiftFilters={shiftFilterOptions}
		shifts={shiftOptions}
		profiles={profileRecords}
		{selectedStatus}
		selectedActivity={selectedActivityId}
		selectedShift={selectedShiftId}
		{searchTerm}
		onStatusChange={(value) => (selectedStatus = value)}
		onActivityChange={handleActivityChange}
		onShiftChange={(value) => (selectedShiftId = value)}
		onSearch={(value) => (searchTerm = value)}
		onApprove={approveAssignment}
		onDecline={declineAssignment}
		onWaitlist={waitlistAssignment}
		onMoveShift={moveVolunteerToShift}
		onPresent={setAssignmentPresent}
		onAddVolunteer={addVolunteerToShift}
	/>

	<ApprovedRoster
		{volunteers}
		{event}
		{shiftMap}
		onStatusChange={setAssignmentPresent}
		onBulkStatusChange={setAssignmentsPresent}
	/>

	<section
		class="border-surface-700 bg-surface-900/70 rounded-2xl border p-2 shadow-xl shadow-black/30"
	>
		<CommunicationsStep
			showAdvancedCommunications={true}
			showCustomQuestionsSection={false}
			{customQuestions}
			{eventEmails}
			eventDetails={{
				title: event?.title || 'Volunteer event',
				eventStart: event.event_start || event.starts_at || event.eventStart,
				eventEnd: event.event_end || event.ends_at || event.eventEnd,
				timezone: eventTimezone,
				locationName: event?.location_name,
				locationAddress: event?.location_address
			}}
			opportunities={opportunityGroups.map((group) => ({ id: group.id, title: group.title }))}
			onAddEmail={addEmailTemplate}
			onRemoveEmail={removeEmailTemplate}
			onUpdateEmail={updateEmailTemplate}
			onComposeEmail={() => {}}
			onToggleAdvanced={() => {}}
			emailTypeOptions={['reminder', 'thankyou', 'custom']}
			fieldTypeOptions={['short_text', 'long_text', 'select', 'checkbox']}
		/>
	</section>

	<EventHostManagement
		{event}
		{groupOwners}
		hosts={eventHosts}
		{primaryHost}
		currentUser={data.session?.user}
	/>

	<ActivityLog entries={activityLog} />
</div>
