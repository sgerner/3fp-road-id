import { json } from '@sveltejs/kit';
import { getActivityClient, refreshActivityNextOccurrence } from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function PUT({ params, request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const payload = await request.json().catch(() => null);
	if (!payload) return invalid('Invalid request body.');

	const { data: occurrence, error: occurrenceError } = await supabase
		.from('activity_occurrences')
		.select('*')
		.eq('id', params.occurrenceId)
		.eq('activity_event_id', params.rideId)
		.maybeSingle();
	if (occurrenceError) {
		console.error('Unable to load ride occurrence', occurrenceError);
		return invalid(occurrenceError.message, 400);
	}
	if (!occurrence) return invalid('Ride occurrence not found.', 404);

	const patch = {
		title_override: payload.titleOverride ?? payload.title_override ?? null,
		starts_at: payload.startsAt ?? payload.starts_at ?? occurrence.starts_at,
		ends_at: payload.endsAt ?? payload.ends_at ?? occurrence.ends_at,
		status: payload.status ?? occurrence.status,
		start_location_name: payload.startLocationName ?? payload.start_location_name ?? null,
		start_location_address:
			payload.startLocationAddress ?? payload.start_location_address ?? null,
		start_latitude: payload.startLatitude ?? payload.start_latitude ?? null,
		start_longitude: payload.startLongitude ?? payload.start_longitude ?? null,
		end_location_name: payload.endLocationName ?? payload.end_location_name ?? null,
		end_location_address: payload.endLocationAddress ?? payload.end_location_address ?? null,
		end_latitude: payload.endLatitude ?? payload.end_latitude ?? null,
		end_longitude: payload.endLongitude ?? payload.end_longitude ?? null,
		is_generated: false,
		updated_at: new Date().toISOString()
	};

	const { data, error } = await supabase
		.from('activity_occurrences')
		.update(patch)
		.eq('id', params.occurrenceId)
		.select('*')
		.single();
	if (error) {
		console.error('Unable to update ride occurrence', error);
		return invalid(error.message, 400);
	}

	await refreshActivityNextOccurrence(supabase, params.rideId);
	return json({ data });
}
