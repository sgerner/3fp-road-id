import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import {
	buildOccurrenceView,
	canManageActivity,
	getActivityClient,
	loadRideById
} from '$lib/server/activities';

const EMAIL_SEND_CONCURRENCY = 10;

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

function textToHtml(text) {
	return String(text || '')
		.split(/\n{2,}/)
		.map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
		.join('');
}

async function runInBatches(items, batchSize, worker) {
	const safeBatchSize = Math.max(1, Number.parseInt(String(batchSize), 10) || 1);
	for (let index = 0; index < items.length; index += safeBatchSize) {
		const batch = items.slice(index, index + safeBatchSize);
		await Promise.all(batch.map((item) => worker(item)));
	}
}

export async function POST(event) {
	const { params, request, cookies, fetch } = event;
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);
	const canManage = await canManageActivity(supabase, params.rideId).catch((error) => {
		console.error('Unable to verify ride email permissions', error);
		return null;
	});
	if (canManage === null) return invalid('Unable to verify ride permissions.', 400);
	if (!canManage)
		return invalid('You do not have permission to message riders for this ride.', 403);

	const payload = await request.json().catch(() => null);
	if (!payload?.occurrenceId || !payload?.subject || !payload?.body) {
		return invalid('occurrenceId, subject, and body are required.');
	}

	const ride = await loadRideById(supabase, params.rideId, { includeTemplates: true }).catch(
		() => null
	);
	if (!ride) return invalid('Ride not found or unavailable.', 404);

	const occurrence = ride.occurrences.find(
		(entry) => String(entry.id) === String(payload.occurrenceId)
	);
	if (!occurrence) return invalid('Ride occurrence not found.', 404);

	const recipients = Array.from(
		new Set(
			occurrence.rsvps
				.filter((rsvp) => rsvp.status === 'going' && rsvp.participantEmail)
				.map((rsvp) => rsvp.participantEmail)
		)
	);
	if (!recipients.length) return invalid('No active participants found for this occurrence.', 400);

	const htmlBody = textToHtml(payload.body);
	await runInBatches(recipients, EMAIL_SEND_CONCURRENCY, async (recipient) =>
		await sendEmail(
			{
				to: recipient,
				subject: payload.subject,
				text: payload.body,
				html: htmlBody,
				replyTo: ride.activity.contact_email || undefined,
				tags: [
					{ Name: 'context', Value: 'ride-organizer-broadcast' },
					{ Name: 'ride_id', Value: String(ride.activity.id) },
					{ Name: 'ride_occurrence_id', Value: String(occurrence.id) }
				]
			},
			{ fetch }
		)
	);

	return json({
		data: {
			sent: recipients.length,
			occurrence: buildOccurrenceView(ride.activity, ride.rideDetails, occurrence)
		}
	});
}
