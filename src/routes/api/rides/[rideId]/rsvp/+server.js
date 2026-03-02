import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function POST({ params, request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const payload = await request.json().catch(() => null);
	if (!payload?.occurrenceId) return invalid('occurrenceId is required.');

	const status = payload.status === 'cancelled' ? 'cancelled' : 'going';
	const { data: occurrence, error: occurrenceError } = await supabase
		.from('activity_occurrences')
		.select('id,activity_event_id,status')
		.eq('id', payload.occurrenceId)
		.eq('activity_event_id', params.rideId)
		.maybeSingle();
	if (occurrenceError) {
		console.error('Unable to load occurrence for RSVP', occurrenceError);
		return invalid(occurrenceError.message, 400);
	}
	if (!occurrence) return invalid('Ride occurrence not found.', 404);

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name,email,phone')
		.eq('user_id', user.id)
		.maybeSingle();

	const participantName = profile?.full_name || user.email || 'Rider';
	const participantEmail = profile?.email || user.email;
	if (!participantEmail) return invalid('Your account needs an email address to RSVP.', 400);

	const { data: existing, error: existingError } = await supabase
		.from('activity_rsvps')
		.select('*')
		.eq('activity_event_id', params.rideId)
		.eq('activity_occurrence_id', payload.occurrenceId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (existingError) {
		console.error('Unable to load existing RSVP', existingError);
		return invalid(existingError.message, 400);
	}

	const patch = {
		activity_event_id: params.rideId,
		activity_occurrence_id: payload.occurrenceId,
		user_id: user.id,
		participant_name: participantName,
		participant_email: participantEmail,
		participant_phone: profile?.phone || null,
		status,
		cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
		updated_at: new Date().toISOString()
	};

	let response;
	if (existing) {
		const { data, error } = await supabase
			.from('activity_rsvps')
			.update(patch)
			.eq('id', existing.id)
			.select('*')
			.single();
		if (error) {
			console.error('Unable to update RSVP', error);
			return invalid(error.message, 400);
		}
		response = data;
	} else {
		const { data, error } = await supabase
			.from('activity_rsvps')
			.insert({
				...patch,
				created_at: new Date().toISOString()
			})
			.select('*')
			.single();
		if (error) {
			console.error('Unable to create RSVP', error);
			return invalid(error.message, 400);
		}
		response = data;
	}

	return json({ data: response });
}
