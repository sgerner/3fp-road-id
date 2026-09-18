import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import {
	buildShiftCalendarBlocks,
	createMergeContext,
	renderEmailBody,
	renderSubject
} from '$lib/volunteer/merge-tags';
import { sendServerEmail as sendEmail } from '$lib/server/email';
import { timingSafeStringEqual } from '$lib/server/security';
import { getConfiguredPublicOrigin } from '$lib/server/publicOrigin';

const APPROVED_STATUSES = new Set(['approved', 'confirmed']);
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const DELIVERY_STALE_MS = 15 * 60 * 1000;

function enforceCronSecret(request) {
	const secret =
		env.CRON_SECRET || env.VOLUNTEER_EMAIL_CRON_SECRET || env.VERCEL_CRON_SECRET || null;
	if (!secret) return json({ error: 'Cron authentication is not configured.' }, { status: 503 });

	const headerSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret');

	if (!timingSafeStringEqual(headerSecret, secret)) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	return null;
}

function toNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function toStringId(value) {
	if (value === null || value === undefined) return null;
	const str = String(value).trim();
	return str ? str : null;
}

function parseTimestamp(value) {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : time;
}

function computeScheduledTime(eventStart, offsetMinutes) {
	const eventStartMs = parseTimestamp(eventStart);
	if (eventStartMs === null) return null;
	const offset = toNumber(offsetMinutes);
	if (offset === null) return null;
	return eventStartMs - offset * 60_000;
}

function deriveVolunteerStatus(assignments) {
	if (!assignments || assignments.length === 0) return 'pending';
	const statuses = assignments.map((assignment) => assignment.status);
	if (statuses.some((status) => status === 'approved')) return 'approved';
	if (statuses.some((status) => status === 'confirmed')) return 'confirmed';
	if (statuses.some((status) => status === 'waitlisted')) return 'waitlisted';
	if (statuses.some((status) => status === 'declined')) return 'declined';
	if (statuses.some((status) => status === 'cancelled')) return 'cancelled';
	return statuses[0] || 'pending';
}

function normalizeAssignment(row) {
	if (!row) return null;
	const id = toStringId(row.id);
	const signupId = toStringId(row.signup_id ?? row.volunteer_signup_id ?? row.signupId);
	const shiftId = toStringId(row.shift_id ?? row.volunteer_shift_id ?? row.shiftId);
	const statusRaw = row.status || row.attendance_status || '';
	const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : 'pending';
	if (!signupId || !shiftId) return null;
	return { id, signupId, shiftId, status };
}

function safeTrim(value, fallback = '') {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed ? trimmed : fallback;
	}
	return fallback;
}

function resolveVolunteerName(signup, profile) {
	return (
		safeTrim(signup?.volunteer_name) ||
		safeTrim(signup?.full_name) ||
		safeTrim(profile?.full_name) ||
		safeTrim(signup?.volunteer_email) ||
		safeTrim(signup?.email) ||
		safeTrim(profile?.email) ||
		'Volunteer'
	);
}

function resolveVolunteerEmail(signup, profile) {
	return (
		safeTrim(signup?.volunteer_email) || safeTrim(signup?.email) || safeTrim(profile?.email) || ''
	);
}

async function loadEventContext(supabase, eventRecord) {
	const eventId = toStringId(eventRecord?.id);
	if (!eventId) return null;

	const [opportunityRes, signupRes, hostGroupRes] = await Promise.all([
		supabase
			.from('volunteer_opportunities')
			.select(
				'id,title,location_name,locationNotes:location_notes,description,shifts:volunteer_opportunity_shifts(id,starts_at,ends_at,timezone,location_name,location_address,notes)'
			)
			.eq('event_id', eventId)
			.order('title', { ascending: true }),
		supabase
			.from('volunteer_signups')
			.select('id,volunteer_email,volunteer_name,volunteer_user_id')
			.eq('event_id', eventId),
		eventRecord?.host_group_id
			? supabase
					.from('groups')
					.select('id,name,website,website_url')
					.eq('id', eventRecord.host_group_id)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null })
	]);

	if (opportunityRes.error) throw opportunityRes.error;
	if (signupRes.error) throw signupRes.error;
	if (hostGroupRes.error) throw hostGroupRes.error;

	const opportunities = opportunityRes.data ?? [];
	const signups = signupRes.data ?? [];
	const hostGroup = hostGroupRes.data ?? null;

	const signupIds = signups
		.map((signup) => toStringId(signup.id))
		.filter((value) => value !== null);

	const assignmentsBySignup = new Map();
	if (signupIds.length) {
		const assignmentRes = await supabase
			.from('volunteer_signup_shifts')
			.select('id,signup_id,shift_id,status')
			.in('signup_id', signupIds);
		if (assignmentRes.error) throw assignmentRes.error;

		for (const row of assignmentRes.data ?? []) {
			const assignment = normalizeAssignment(row);
			if (!assignment) continue;
			if (!assignmentsBySignup.has(assignment.signupId)) {
				assignmentsBySignup.set(assignment.signupId, []);
			}
			assignmentsBySignup.get(assignment.signupId)?.push(assignment);
		}
	}

	const volunteerUserIds = new Set();
	const volunteerProfileIds = new Set();
	for (const signup of signups) {
		const userId = toStringId(signup.volunteer_user_id ?? signup.user_id);
		if (userId) volunteerUserIds.add(userId);
		const profileId = toStringId(signup.volunteer_profile_id ?? signup.profile_id);
		if (profileId) volunteerProfileIds.add(profileId);
	}

	const profilesByUserId = new Map();
	const profilesById = new Map();
	if (volunteerUserIds.size) {
		const profileRes = await supabase
			.from('profiles')
			.select('id,user_id,email,full_name,phone')
			.in('user_id', Array.from(volunteerUserIds));
		if (!profileRes.error && Array.isArray(profileRes.data)) {
			for (const profile of profileRes.data) {
				const userId = toStringId(profile.user_id);
				const profileId = toStringId(profile.id);
				if (userId) profilesByUserId.set(userId, profile);
				if (profileId) profilesById.set(profileId, profile);
			}
		}
	}
	if (volunteerProfileIds.size) {
		const profileRes = await supabase
			.from('profiles')
			.select('id,user_id,email,full_name,phone')
			.in('id', Array.from(volunteerProfileIds));
		if (!profileRes.error && Array.isArray(profileRes.data)) {
			for (const profile of profileRes.data) {
				const userId = toStringId(profile.user_id);
				const profileId = toStringId(profile.id);
				if (userId && !profilesByUserId.has(userId)) {
					profilesByUserId.set(userId, profile);
				}
				if (profileId) profilesById.set(profileId, profile);
			}
		}
	}

	const volunteers = signups
		.map((signup) => {
			const signupId = toStringId(signup.id);
			if (!signupId) return null;
			const assignments = assignmentsBySignup.get(signupId) ?? [];
			const normalizedAssignments = assignments.map((assignment) => ({
				id: assignment.id,
				shiftId: assignment.shiftId,
				status: assignment.status
			}));
			const status = deriveVolunteerStatus(normalizedAssignments);
			const profile =
				profilesByUserId.get(toStringId(signup.volunteer_user_id ?? signup.user_id)) ||
				profilesById.get(toStringId(signup.volunteer_profile_id ?? signup.profile_id)) ||
				null;
			const email = resolveVolunteerEmail(signup, profile);
			const name = resolveVolunteerName(signup, profile);
			return {
				id: signupId,
				email,
				name,
				status,
				assignments: normalizedAssignments
			};
		})
		.filter(Boolean);

	return { opportunities, volunteers, hostGroup };
}

async function claimVolunteerEmailDelivery(
	supabase,
	templateId,
	volunteerSignupId,
	recipientEmail
) {
	const now = new Date();
	const nowIso = now.toISOString();
	const { data: inserted, error: insertError } = await supabase
		.from('volunteer_event_email_deliveries')
		.insert({
			template_id: templateId,
			volunteer_signup_id: volunteerSignupId,
			recipient_email: recipientEmail,
			send_state: 'sending',
			updated_at: nowIso
		})
		.select('id')
		.maybeSingle();

	if (!insertError && inserted?.id) return { id: inserted.id, state: 'claimed' };
	if (insertError?.code !== '23505') {
		throw insertError || new Error('Unable to reserve volunteer email delivery.');
	}

	const { data: existing, error: existingError } = await supabase
		.from('volunteer_event_email_deliveries')
		.select('id,send_state,updated_at')
		.eq('template_id', templateId)
		.eq('volunteer_signup_id', volunteerSignupId)
		.maybeSingle();
	if (existingError) throw existingError;
	if (!existing) return { id: null, state: 'pending' };
	if (existing.send_state === 'sent') return { id: existing.id, state: 'sent' };
	if (existing.send_state === 'sending') {
		const updatedAt = parseTimestamp(existing.updated_at);
		if (updatedAt !== null && now.getTime() - updatedAt < DELIVERY_STALE_MS) {
			return { id: existing.id, state: 'pending' };
		}
	}

	const reclaim = supabase
		.from('volunteer_event_email_deliveries')
		.update({
			recipient_email: recipientEmail,
			send_state: 'sending',
			sent_at: null,
			error_text: null,
			updated_at: nowIso
		})
		.eq('id', existing.id);
	const reclaimQuery =
		existing.send_state === 'sending'
			? reclaim
					.eq('send_state', 'sending')
					.lte('updated_at', new Date(now.getTime() - DELIVERY_STALE_MS).toISOString())
			: reclaim.eq('send_state', 'failed');
	const { data: reclaimed, error: reclaimError } = await reclaimQuery.select('id').maybeSingle();
	if (reclaimError) throw reclaimError;
	return reclaimed?.id
		? { id: reclaimed.id, state: 'claimed' }
		: { id: existing.id, state: 'pending' };
}

async function updateVolunteerEmailDelivery(supabase, deliveryId, updates) {
	const { error } = await supabase
		.from('volunteer_event_email_deliveries')
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq('id', deliveryId);
	if (error) throw error;
}

async function processEmailTemplate({ supabase, template, eventRecord, origin, fetchFn, now }) {
	const contextData = await loadEventContext(supabase, eventRecord);
	if (!contextData) {
		return { templateId: template.id, sent: 0, skipped: true, reason: 'missing_context' };
	}

	const eventDetailsForContext = {
		title: eventRecord?.title ?? 'Volunteer event',
		event_start: eventRecord?.event_start ?? eventRecord?.eventStart ?? null,
		event_end: eventRecord?.event_end ?? eventRecord?.eventEnd ?? null,
		timezone: eventRecord?.timezone ?? null,
		location_name: eventRecord?.location_name ?? eventRecord?.locationName ?? '',
		location_address: eventRecord?.location_address ?? eventRecord?.locationAddress ?? ''
	};

	const hostName =
		safeTrim(eventRecord?.host_name) ||
		safeTrim(contextData.hostGroup?.name) ||
		safeTrim(eventRecord?.contact_name);

	const approvedVolunteers = contextData.volunteers.filter((volunteer) =>
		APPROVED_STATUSES.has(volunteer.status)
	);

	let sentCount = 0;
	let eligibleCount = 0;
	let pendingCount = 0;
	const errors = [];
	for (const volunteer of approvedVolunteers) {
		const to = safeTrim(volunteer.email);
		if (!to) continue;

		const assignments = volunteer.assignments.filter((assignment) =>
			APPROVED_STATUSES.has(assignment.status)
		);
		if (!assignments.length) continue;

		const mergeContext = createMergeContext({
			event: eventRecord,
			eventDetails: eventDetailsForContext,
			opportunities: contextData.opportunities,
			volunteer: { name: volunteer.name, email: to },
			assignments,
			host: {
				contactEmail:
					safeTrim(eventRecord?.contact_email) || safeTrim(eventRecord?.contactEmail) || '',
				contactPhone:
					safeTrim(eventRecord?.contact_phone) || safeTrim(eventRecord?.contactPhone) || '',
				hostName,
				website:
					safeTrim(contextData.hostGroup?.website_url) ||
					safeTrim(contextData.hostGroup?.website) ||
					''
			},
			origin,
			requireConfirmation: template.require_confirmation ?? template.requireConfirmation ?? false
		});

		const renderedSubject = renderSubject(template.subject ?? '', mergeContext);
		const subject = renderedSubject || template.subject || 'Volunteer update';
		const bodyOutput = renderEmailBody(template.body ?? '', mergeContext);
		const htmlBody = safeTrim(bodyOutput.html || '');
		const textBody = safeTrim(bodyOutput.text || '');
		if (!htmlBody && !textBody) continue;
		const calendarBlocks = buildShiftCalendarBlocks(mergeContext);
		const htmlWithCalendar = [htmlBody, calendarBlocks.html].filter(Boolean).join('\n\n');
		const textWithCalendar = [textBody, calendarBlocks.text].filter(Boolean).join('\n\n');
		eligibleCount += 1;

		let delivery;
		try {
			delivery = await claimVolunteerEmailDelivery(supabase, template.id, volunteer.id, to);
		} catch (error) {
			console.error('Unable to reserve scheduled volunteer email delivery', {
				templateId: template.id,
				volunteerId: volunteer.id,
				error
			});
			errors.push({ volunteerId: volunteer.id, message: 'Unable to reserve email delivery.' });
			continue;
		}

		if (delivery.state === 'sent') continue;
		if (delivery.state === 'pending' || !delivery.id) {
			pendingCount += 1;
			continue;
		}

		try {
			await sendEmail(
				{
					to,
					subject,
					html: htmlWithCalendar || undefined,
					text: textWithCalendar || undefined,
					replyTo:
						safeTrim(eventRecord?.contact_email) ||
						safeTrim(eventRecord?.contactEmail) ||
						undefined,
					tags: [
						{ Name: 'volunteer_event_id', Value: toStringId(eventRecord?.id) ?? 'unknown' },
						{ Name: 'volunteer_email_template_id', Value: toStringId(template.id) ?? 'unknown' },
						{
							Name: 'volunteer_email_type',
							Value:
								safeTrim(template.email_type ?? template.emailType ?? 'custom').toLowerCase() ||
								'custom'
						}
					]
				},
				{ fetch: fetchFn }
			);
			sentCount += 1;
		} catch (error) {
			try {
				await updateVolunteerEmailDelivery(supabase, delivery.id, {
					send_state: 'failed',
					sent_at: null,
					error_text: safeTrim(error?.message || 'send_failed').slice(0, 2000)
				});
			} catch (stateError) {
				console.error('Unable to store failed volunteer email delivery', {
					templateId: template.id,
					volunteerId: volunteer.id,
					error: stateError
				});
			}
			errors.push({ volunteerId: volunteer.id, message: error?.message || 'send_failed' });
			continue;
		}

		try {
			await updateVolunteerEmailDelivery(supabase, delivery.id, {
				send_state: 'sent',
				sent_at: new Date().toISOString(),
				error_text: null
			});
		} catch (stateError) {
			console.error('Email accepted but volunteer delivery status could not be stored', {
				templateId: template.id,
				volunteerId: volunteer.id,
				error: stateError
			});
			errors.push({
				volunteerId: volunteer.id,
				message: 'Email was accepted but its delivery status could not be recorded.'
			});
		}
	}

	const eventEndMs = parseTimestamp(eventRecord?.event_end ?? eventRecord?.eventEnd);
	const deliveryRoundComplete = eligibleCount > 0 && errors.length === 0 && pendingCount === 0;
	if (deliveryRoundComplete || (eventEndMs !== null && now.getTime() - eventEndMs > ONE_DAY_MS)) {
		await supabase
			.from('volunteer_event_emails')
			.update({ last_sent_at: new Date().toISOString() })
			.eq('id', template.id);
	}

	return {
		templateId: template.id,
		sent: sentCount,
		recipients: approvedVolunteers.length,
		pending: pendingCount,
		errors
	};
}

function filterDueTemplates(records, now) {
	const due = [];
	for (const template of records ?? []) {
		if (!template) continue;
		if (template.is_active === false) continue;
		if (!safeTrim(template.subject) || !safeTrim(template.body)) continue;
		const eventRecord = template.event;
		if (!eventRecord || !eventRecord.event_start) continue;
		const eventStatus = safeTrim(eventRecord.status || eventRecord.volunteer_event_status);
		if (eventStatus && eventStatus !== 'published') continue;

		const scheduledTime = computeScheduledTime(
			eventRecord.event_start,
			template.send_offset_minutes ?? template.sendOffsetMinutes ?? 0
		);
		if (scheduledTime === null) continue;
		if (scheduledTime > now.getTime()) continue;

		const lastSentAt = parseTimestamp(template.last_sent_at ?? template.lastSentAt);
		if (lastSentAt !== null && lastSentAt >= scheduledTime - ONE_HOUR_MS) continue;

		due.push({ template, event: eventRecord, scheduledTime });
	}
	return due;
}

async function handleCron(event) {
	const unauthorized = enforceCronSecret(event.request);
	if (unauthorized) return unauthorized;

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Supabase service role key is not configured.' }, { status: 500 });
	}

	const now = new Date();
	const emailQuery = await supabase
		.from('volunteer_event_emails')
		.select(
			`id,event_id,email_type,subject,body,send_offset_minutes,require_confirmation,last_sent_at,is_active,event:volunteer_events(id,title,slug,event_start,event_end,timezone,location_name,location_address,contact_email,contact_phone,host_group_id,status)`
		);

	if (emailQuery.error) {
		return json({ error: emailQuery.error.message }, { status: 500 });
	}

	const dueTemplates = filterDueTemplates(emailQuery.data, now);
	if (!dueTemplates.length) {
		return json({
			message: 'No scheduled volunteer emails due.',
			checked: emailQuery.data?.length ?? 0
		});
	}

	const origin = getConfiguredPublicOrigin();
	const results = [];
	for (const item of dueTemplates) {
		try {
			const result = await processEmailTemplate({
				supabase,
				template: item.template,
				eventRecord: item.event,
				origin,
				fetchFn: event.fetch,
				now
			});
			results.push(result);
		} catch (error) {
			results.push({
				templateId: item.template?.id,
				sent: 0,
				error: error?.message || 'processing_failed'
			});
		}
	}

	const hasDeliveryErrors = results.some((result) => result.errors?.length || result.error);
	return json({ processed: results.length, results }, { status: hasDeliveryErrors ? 502 : 200 });
}

export const GET = handleCron;
export const POST = handleCron;
