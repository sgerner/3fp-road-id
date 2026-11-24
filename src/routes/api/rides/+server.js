import { json } from '@sveltejs/kit';
import {
	buildOccurrenceSchedule,
	ensureUniqueActivitySlug,
	getActivityClient,
	getActivityServiceClient,
	isValidExternalEventUrlInput,
	loadRideBySlug,
	normalizeRidePayload,
	refreshActivityNextOccurrence,
	syncActivityOccurrences,
	upsertActivityRelations
} from '#lib/server/activities';
import { queryPublishedUpcomingRides } from '#lib/server/rideDirectory';

/**
 * @param {any} request
 */
function parseJson(request) {
	return request.json().catch(() => null);
}

/**
 * @param {any} message
 * @param {any} [status]
 */
function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

/**
 * @param {any} param0
 */
export async function GET({ url, cookies }) {
	const { supabase } = await getActivityClient(cookies);

	try {
		const result = await queryPublishedUpcomingRides(supabase, url.searchParams);
		return json(result);
	} catch (error) {
		console.error('Unable to load rides', error);
		return invalid(error?.message || 'Unable to load rides.', 500);
	}
}

/**
 * @param {any} param0
 */
export async function POST({ request, cookies }) {
	const { supabase, user } = await getActivityClient(cookies);
	if (!user?.id) {
		return invalid('Authentication required.', 401);
	}
	const writeSupabase = getActivityServiceClient();
	if (!writeSupabase) {
		return invalid('Ride creation is not configured.', 500);
	}

	const rawPayload = await parseJson(request);
	if (!rawPayload) return invalid('Invalid request body.');
	if (!isValidExternalEventUrlInput(rawPayload.externalEventUrl ?? rawPayload.external_event_url)) {
		return invalid('External registration link must be a valid http:// or https:// URL.');
	}

	const payload = normalizeRidePayload(rawPayload);
	if (!payload.activity.title) return invalid('Ride title is required.');
	if (!payload.activity.starts_at || !payload.activity.ends_at) {
		return invalid('Ride start and end time are required.');
	}
	if (!payload.activity.start_location_name) {
		return invalid('Start location is required.');
	}
	if (payload.activity.host_group_id) {
		const { data: canManageGroup, error: manageGroupError } = await supabase.rpc(
			'can_manage_group',
			{
				target_group_id: payload.activity.host_group_id
			}
		);
		if (manageGroupError) {
			console.error('Unable to verify ride host organization permissions', manageGroupError);
			return invalid(manageGroupError.message, 400);
		}
		if (!canManageGroup) {
			return invalid('You do not have permission to host this ride under that organization.', 403);
		}
	}

	const nowIso = new Date().toISOString();
	const slug = await ensureUniqueActivitySlug(
		writeSupabase,
		payload.activity.slug || payload.activity.title
	);

	/** @type {any} */
	const activityInsert = {
		activity_type: 'ride',
		host_user_id: payload.activity.is_host ? user.id : null,
		host_group_id: payload.activity.host_group_id,
		created_by_user_id: user.id,
		updated_at: nowIso,
		published_at: payload.activity.status === 'published' ? nowIso : null,
		title: payload.activity.title,
		slug,
		summary: payload.activity.summary,
		description: payload.activity.description,
		timezone: payload.activity.timezone,
		starts_at: payload.activity.starts_at,
		ends_at: payload.activity.ends_at,
		status: payload.activity.status,
		start_location_name: payload.activity.start_location_name,
		start_location_address: payload.activity.start_location_address,
		start_latitude: payload.activity.start_latitude,
		start_longitude: payload.activity.start_longitude,
		contact_email: payload.activity.contact_email,
		contact_phone: payload.activity.contact_phone
	};

	const { data: activity, error: activityError } = await writeSupabase
		.from('activity_events')
		.insert(activityInsert)
		.select('*')
		.single();
	if (activityError) {
		console.error('Unable to create ride', activityError);
		return invalid(activityError.message, 400);
	}

	const { error: rideError } = await writeSupabase.from('ride_details').insert({
		activity_event_id: activity.id,
		updated_at: nowIso,
		...payload.ride
	});
	if (rideError) {
		console.error('Unable to create ride details', rideError);
		return invalid(rideError.message, 400);
	}

	const recurrenceRule = payload.recurrence.enabled
		? {
				activity_event_id: activity.id,
				updated_at: nowIso,
				frequency: payload.recurrence.frequency,
				interval_count: payload.recurrence.interval_count,
				by_weekdays: payload.recurrence.by_weekdays,
				by_set_positions:
					payload.recurrence.frequency === 'monthly' ? payload.recurrence.by_set_positions : null,
				starts_on: payload.activity.starts_at.slice(0, 10),
				until_on: payload.recurrence.until_on
			}
		: null;

	if (recurrenceRule) {
		const { error } = await writeSupabase.from('activity_recurrence_rules').insert(recurrenceRule);
		if (error) {
			console.error('Unable to create recurrence rule', error);
			return invalid(error.message, 400);
		}
	}

	if (payload.exclusions.length) {
		const { error } = await writeSupabase.from('activity_recurrence_exclusions').insert(
			payload.exclusions.map((exclusion) => ({
				activity_event_id: activity.id,
				created_by_user_id: user.id,
				starts_on: exclusion.starts_on,
				ends_on: exclusion.ends_on,
				note: exclusion.note
			}))
		);
		if (error) {
			console.error('Unable to create ride exclusions', error);
			return invalid(error.message, 400);
		}
	}

	await upsertActivityRelations(writeSupabase, activity.id, {
		difficultyLevelIds: payload.difficultyLevelIds,
		ridingDisciplineIds: payload.ridingDisciplineIds,
		emailTemplates: payload.emailTemplates
	});

	const schedule = buildOccurrenceSchedule(activityInsert, recurrenceRule, payload.exclusions);
	await syncActivityOccurrences(writeSupabase, activity.id, schedule);
	await refreshActivityNextOccurrence(writeSupabase, activity.id);

	const ride = await loadRideBySlug(supabase, slug, {
		includeTemplates: true,
		includePrivateRsvps: true
	});
	return json({ data: ride }, { status: 201 });
}
