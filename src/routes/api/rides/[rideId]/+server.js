import { json } from '@sveltejs/kit';
import {
	buildOccurrenceSchedule,
	ensureUniqueActivitySlug,
	getActivityClient,
	getActivityServiceClient,
	loadRideBySlug,
	normalizeRidePayload,
	refreshActivityNextOccurrence,
	syncActivityOccurrences,
	upsertActivityRelations
} from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

async function loadManagedRide(supabase, rideId) {
	const { data, error } = await supabase
		.from('activity_events')
		.select('*')
		.eq('id', rideId)
		.eq('activity_type', 'ride')
		.maybeSingle();
	if (error) throw error;
	return data;
}

export async function PUT({ params, request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const rideId = params.rideId;
	const existing = await loadManagedRide(supabase, rideId).catch((error) => {
		console.error('Unable to load ride for update', error);
		return null;
	});
	if (!existing) return invalid('Ride not found or unavailable.', 404);

	const rawPayload = await request.json().catch(() => null);
	if (!rawPayload) return invalid('Invalid request body.');
	const payload = normalizeRidePayload(rawPayload);

	const nowIso = new Date().toISOString();
	const slug = await ensureUniqueActivitySlug(
		supabase,
		payload.activity.slug || payload.activity.title || existing.slug,
		rideId
	);
	const cutoffStart = rawPayload?.cutoffStart ?? null;

	const activityPatch = {
		host_user_id: payload.activity.is_host ? user.id : null,
		title: payload.activity.title || existing.title,
		slug,
		summary: payload.activity.summary,
		description: payload.activity.description,
		timezone: payload.activity.timezone,
		starts_at: payload.activity.starts_at || existing.starts_at,
		ends_at: payload.activity.ends_at || existing.ends_at,
		status: payload.activity.status || existing.status,
		start_location_name: payload.activity.start_location_name || existing.start_location_name,
		start_location_address: payload.activity.start_location_address,
		start_latitude: payload.activity.start_latitude,
		start_longitude: payload.activity.start_longitude,
		contact_email: payload.activity.contact_email,
		contact_phone: payload.activity.contact_phone,
		host_group_id: payload.activity.host_group_id,
		published_at:
			(payload.activity.status || existing.status) === 'published'
				? existing.published_at || nowIso
				: null,
		updated_at: nowIso
	};

	const { data: updatedActivity, error: activityError } = await supabase
		.from('activity_events')
		.update(activityPatch)
		.eq('id', rideId)
		.select('*')
		.single();
	if (activityError) {
		console.error('Unable to update ride', activityError);
		return invalid(activityError.message, 400);
	}

	const { error: rideError } = await supabase
		.from('ride_details')
		.update({
			...payload.ride,
			updated_at: nowIso
		})
		.eq('activity_event_id', rideId);
	if (rideError) {
		console.error('Unable to update ride details', rideError);
		return invalid(rideError.message, 400);
	}

	await supabase.from('activity_recurrence_exclusions').delete().eq('activity_event_id', rideId);
	if (payload.exclusions.length) {
		const { error } = await supabase.from('activity_recurrence_exclusions').insert(
			payload.exclusions.map((exclusion) => ({
				activity_event_id: rideId,
				created_by_user_id: user.id,
				starts_on: exclusion.starts_on,
				ends_on: exclusion.ends_on,
				note: exclusion.note
			}))
		);
		if (error) {
			console.error('Unable to update ride exclusions', error);
			return invalid(error.message, 400);
		}
	}

	let recurrenceRule = null;
	if (payload.recurrence.enabled) {
		recurrenceRule = {
			activity_event_id: rideId,
			updated_at: nowIso,
			frequency: payload.recurrence.frequency,
			interval_count: payload.recurrence.interval_count,
			by_weekdays: payload.recurrence.by_weekdays,
			by_set_positions:
				payload.recurrence.frequency === 'monthly'
					? payload.recurrence.by_set_positions
					: null,
			starts_on: (cutoffStart || updatedActivity.starts_at).slice(0, 10),
			until_on: payload.recurrence.until_on
		};
		const { error } = await supabase
			.from('activity_recurrence_rules')
			.upsert(recurrenceRule, { onConflict: 'activity_event_id' });
		if (error) {
			console.error('Unable to update recurrence rule', error);
			return invalid(error.message, 400);
		}
	} else {
		await supabase.from('activity_recurrence_rules').delete().eq('activity_event_id', rideId);
	}

	await upsertActivityRelations(supabase, rideId, {
		difficultyLevelIds: payload.difficultyLevelIds,
		ridingDisciplineIds: payload.ridingDisciplineIds,
		emailTemplates: payload.emailTemplates,
		hostIds: rawPayload?.hostUserIds ?? []
	});

	const schedule = buildOccurrenceSchedule(updatedActivity, recurrenceRule, payload.exclusions);
	await syncActivityOccurrences(supabase, rideId, schedule, { cutoffStart });
	await refreshActivityNextOccurrence(supabase, rideId);

	const ride = await loadRideBySlug(supabase, slug, { includeTemplates: true });
	return json({ data: ride });
}

export async function DELETE({ params, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const rideId = params.rideId;
	const existing = await loadManagedRide(supabase, rideId).catch((error) => {
		console.error('Unable to load ride for delete', error);
		return null;
	});
	if (!existing) return invalid('Ride not found or unavailable.', 404);

	const { data: canManage, error: canManageError } = await supabase.rpc('can_manage_activity', {
		target_activity_event_id: rideId
	});
	if (canManageError) {
		console.error('Unable to verify ride delete permissions', canManageError);
		return invalid(canManageError.message, 400);
	}
	if (!canManage) return invalid('You do not have permission to delete this ride.', 403);

	const writeSupabase = getActivityServiceClient();
	if (!writeSupabase) return invalid('Ride deletion is not configured.', 500);

	const { data: emailTemplates, error: emailTemplatesError } = await writeSupabase
		.from('activity_email_templates')
		.select('id')
		.eq('activity_event_id', rideId);
	if (emailTemplatesError) {
		console.error('Unable to load ride email templates for delete', emailTemplatesError);
		return invalid(emailTemplatesError.message, 400);
	}

	const templateIds = (emailTemplates ?? []).map((template) => template.id).filter(Boolean);
	if (templateIds.length) {
		const { error: deliveriesError } = await writeSupabase
			.from('activity_email_deliveries')
			.delete()
			.in('template_id', templateIds);
		if (deliveriesError) {
			console.error('Unable to delete ride email deliveries', deliveriesError);
			return invalid(deliveriesError.message, 400);
		}
	}

	const deletions = [
		['activity_email_templates', 'activity_event_id'],
		['activity_rsvps', 'activity_event_id'],
		['activity_occurrences', 'activity_event_id'],
		['activity_recurrence_exclusions', 'activity_event_id'],
		['activity_recurrence_rules', 'activity_event_id'],
		['activity_hosts', 'activity_event_id'],
		['activity_x_ride_difficulty_levels', 'activity_event_id'],
		['activity_x_riding_disciplines', 'activity_event_id'],
		['ride_details', 'activity_event_id'],
		['activity_events', 'id']
	];

	for (const [table, column] of deletions) {
		const { error } = await writeSupabase.from(table).delete().eq(column, rideId);
		if (error) {
			console.error(`Unable to delete ride rows from ${table}`, error);
			return invalid(error.message, 400);
		}
	}

	return json({ data: { deleted: true, rideId } });
}
