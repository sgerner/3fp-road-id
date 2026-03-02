import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import { buildOccurrenceView, getActivityClient, loadRideById } from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

function textToHtml(text) {
	return String(text || '')
		.split(/\n{2,}/)
		.map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
		.join('');
}

export async function POST(event) {
	const { params, request, cookies, fetch } = event;
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const payload = await request.json().catch(() => null);
	if (!payload?.occurrenceId || !payload?.subject || !payload?.body) {
		return invalid('occurrenceId, subject, and body are required.');
	}

	const ride = await loadRideById(supabase, params.rideId, { includeTemplates: true }).catch(() => null);
	if (!ride) return invalid('Ride not found or unavailable.', 404);

	const occurrence = ride.occurrences.find((entry) => String(entry.id) === String(payload.occurrenceId));
	if (!occurrence) return invalid('Ride occurrence not found.', 404);

	const recipients = occurrence.rsvps
		.filter((rsvp) => rsvp.status === 'going' && rsvp.participantEmail)
		.map((rsvp) => rsvp.participantEmail);
	if (!recipients.length) return invalid('No active participants found for this occurrence.', 400);

	for (const recipient of recipients) {
		await sendEmail(
			{
				to: recipient,
				subject: payload.subject,
				text: payload.body,
				html: textToHtml(payload.body),
				replyTo: ride.activity.contact_email || undefined,
				tags: [
					{ Name: 'context', Value: 'ride-organizer-broadcast' },
					{ Name: 'ride_id', Value: String(ride.activity.id) },
					{ Name: 'ride_occurrence_id', Value: String(occurrence.id) }
				]
			},
			{ fetch }
		);
	}

	return json({
		data: {
			sent: recipients.length,
			occurrence: buildOccurrenceView(ride.activity, ride.rideDetails, occurrence)
		}
	});
}
