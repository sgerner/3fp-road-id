import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import {
	buildSmsUrl,
	formatSmsDateTime,
	getSmsManagerIds,
	getSmsServiceClient,
	enqueueSms
} from '$lib/server/sms';

const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_SOURCE_ROWS = 10_000;

function cronSecret(request) {
	return (
		request.headers.get('x-cron-secret') ||
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		''
	);
}

function one(value) {
	return Array.isArray(value) ? value[0] || null : value || null;
}

function reminderDue(startsAt, now, horizon) {
	const starts = Date.parse(startsAt || '');
	if (!Number.isFinite(starts)) return false;
	return starts > now && starts <= horizon && starts - now <= REMINDER_WINDOW_MS;
}

function safeText(value, max = 160) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.slice(0, max);
}

function rideBody({ activity, occurrence }) {
	const title = safeText(occurrence.title_override || activity.title, 120) || 'your ride';
	const when = formatSmsDateTime(occurrence.starts_at, activity.timezone);
	const location = safeText(occurrence.start_location_name || activity.start_location_name, 100);
	const locationLine = location ? ` Meet: ${location}.` : '';
	return `3FP: Reminder for ${title} on ${when}.${locationLine} Details: ${buildSmsUrl(`/ride/${activity.slug}`)}`;
}

function volunteerBody({ event, opportunity, shift }) {
	const eventTitle = safeText(event.title, 90) || 'your volunteer event';
	const opportunityTitle = safeText(opportunity.title, 90) || 'your shift';
	const when = formatSmsDateTime(shift.starts_at, shift.timezone || event.timezone);
	const location = safeText(shift.location_name || event.location_name, 100);
	const locationLine = location ? ` Meet: ${location}.` : '';
	return `3FP: Reminder for ${eventTitle} - ${opportunityTitle}, ${when}.${locationLine} Details: ${buildSmsUrl(`/volunteer/${event.slug}`)}`;
}

async function loadActiveSubscriptions(supabase) {
	const { data, error } = await supabase
		.from('sms_subscriptions')
		.select('*')
		.eq('status', 'active');
	if (error) throw error;
	return new Map(
		(data || []).filter((row) => row.user_id).map((row) => [String(row.user_id), row])
	);
}

async function loadPagedRows(buildQuery, label) {
	const rows = [];
	for (let offset = 0; offset < MAX_SOURCE_ROWS; offset += PAGE_SIZE) {
		const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
		if (error) throw error;
		const page = data || [];
		rows.push(...page);
		if (page.length < PAGE_SIZE) return rows;
	}
	throw new Error(`${label} exceeded the ${MAX_SOURCE_ROWS}-row SMS reminder safety limit.`);
}

export async function POST(event) {
	const verified = await getCronSecretVerifier('sms_dispatch', cronSecret(event.request));
	if (!verified) return json({ error: 'Unauthorized cron request' }, { status: 401 });

	const supabase = getSmsServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 503 });

	try {
		const subscriptions = await loadActiveSubscriptions(supabase);
		const now = Date.now();
		const horizon = now + HORIZON_MS;
		let queued = 0;
		let skipped = 0;
		let errors = 0;
		const rideManagers = new Map();
		const volunteerManagers = new Map();

		const rideRsvps = await loadPagedRows(
			() =>
				supabase
					.from('activity_rsvps')
					.select(
						'id,user_id,activity_event_id,activity_occurrence_id,status,activity:activity_events(id,title,slug,status,timezone,start_location_name),occurrence:activity_occurrences(id,starts_at,ends_at,status,title_override,start_location_name)'
					)
					.eq('status', 'going')
					.order('id', { ascending: true }),
			'Ride RSVPs'
		);

		for (const rsvp of rideRsvps || []) {
			const activity = one(rsvp.activity);
			const occurrence = one(rsvp.occurrence);
			const subscription = subscriptions.get(String(rsvp.user_id || ''));
			if (
				!activity ||
				activity.status !== 'published' ||
				!occurrence ||
				occurrence.status !== 'scheduled' ||
				!subscription?.ride_reminders ||
				!reminderDue(occurrence.starts_at, now, horizon)
			) {
				skipped += 1;
				continue;
			}

			try {
				const context = {
					activityEventId: activity.id,
					activityOccurrenceId: occurrence.id,
					subject: `Ride reminder: ${safeText(activity.title, 120)}`
				};
				if (!rideManagers.has(activity.id)) {
					rideManagers.set(activity.id, await getSmsManagerIds(supabase, context));
				}
				const result = await enqueueSms({
					supabase,
					userId: rsvp.user_id,
					phoneE164: subscription.phone_e164,
					kind: 'ride_reminder',
					body: rideBody({ activity, occurrence }),
					dedupeKey: `ride-reminder:${rsvp.id}:${occurrence.id}:24h`,
					context,
					managerUserIds: rideManagers.get(activity.id),
					metadata: { reminderWindow: '24h' }
				});
				if (result.queued) queued += 1;
				else skipped += 1;
			} catch (error) {
				errors += 1;
				console.error('Unable to queue ride SMS reminder', { rsvpId: rsvp.id, error });
			}
		}

		const volunteerAssignments = await loadPagedRows(
			() =>
				supabase
					.from('volunteer_signup_shifts')
					.select(
						'id,signup_id,shift_id,status,signup:volunteer_signups(id,volunteer_user_id,event_id,volunteer_name),shift:volunteer_opportunity_shifts(id,starts_at,ends_at,timezone,location_name,location_address,opportunity:volunteer_opportunities(id,title,event_id,event:volunteer_events(id,title,slug,status,timezone,location_name,location_address)))'
					)
					.in('status', ['registered', 'pending', 'approved', 'confirmed', 'checked_in'])
					.order('id', { ascending: true }),
			'Volunteer assignments'
		);

		for (const assignment of volunteerAssignments || []) {
			const signup = one(assignment.signup);
			const shift = one(assignment.shift);
			const opportunity = one(shift?.opportunity);
			const volunteerEvent = one(opportunity?.event);
			const subscription = subscriptions.get(String(signup?.volunteer_user_id || ''));
			if (
				!signup ||
				!shift ||
				!opportunity ||
				!volunteerEvent ||
				volunteerEvent.status !== 'published' ||
				!subscription?.volunteer_reminders ||
				!reminderDue(shift.starts_at, now, horizon)
			) {
				skipped += 1;
				continue;
			}

			try {
				const context = {
					volunteerEventId: volunteerEvent.id,
					volunteerSignupId: signup.id,
					subject: `Volunteer reminder: ${safeText(volunteerEvent.title, 120)}`
				};
				if (!volunteerManagers.has(volunteerEvent.id)) {
					volunteerManagers.set(volunteerEvent.id, await getSmsManagerIds(supabase, context));
				}
				const result = await enqueueSms({
					supabase,
					userId: signup.volunteer_user_id,
					phoneE164: subscription.phone_e164,
					kind: 'volunteer_reminder',
					body: volunteerBody({ event: volunteerEvent, opportunity, shift }),
					dedupeKey: `volunteer-reminder:${assignment.id}:${shift.id}:24h`,
					context,
					managerUserIds: volunteerManagers.get(volunteerEvent.id),
					metadata: { reminderWindow: '24h' }
				});
				if (result.queued) queued += 1;
				else skipped += 1;
			} catch (error) {
				errors += 1;
				console.error('Unable to queue volunteer SMS reminder', {
					assignmentId: assignment.id,
					error
				});
			}
		}

		return json({ data: { queued, skipped, errors } });
	} catch (error) {
		console.error('Unable to process SMS reminders', error);
		return json({ error: error?.message || 'Unable to process SMS reminders.' }, { status: 500 });
	}
}
