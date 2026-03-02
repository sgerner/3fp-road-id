import { json } from '@sveltejs/kit';
import { DEFAULT_BRAND_ORIGIN } from '$lib/email/branding';
import { sendEmail } from '$lib/services/email';
import {
	buildRideReminderContext,
	getActivityServiceClient,
	getCronSecretVerifier,
	loadRideById,
	renderRideEmailTemplate
} from '$lib/server/activities';

function textToHtml(text) {
	return String(text || '')
		.split(/\n{2,}/)
		.map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
		.join('');
}

export async function POST(event) {
	const providedSecret =
		event.request.headers.get('x-cron-secret') ||
		event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		'';
	const verified = await getCronSecretVerifier('ride_emails', providedSecret);
	if (!verified) return json({ error: 'Unauthorized cron request' }, { status: 401 });

	const supabase = getActivityServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 500 });

	const now = Date.now();
	const horizonIso = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
	const { data: templates, error: templatesError } = await supabase
		.from('activity_email_templates')
		.select('*')
		.eq('is_active', true)
		.eq('template_type', 'reminder');
	if (templatesError) {
		console.error('Unable to load ride email templates', templatesError);
		return json({ error: templatesError.message }, { status: 500 });
	}

	let sent = 0;
	const processed = [];
	for (const template of templates ?? []) {
		if (template.send_offset_minutes == null) continue;

		const ride = await loadRideById(supabase, template.activity_event_id, {
			includeTemplates: false
		}).catch(() => null);
		if (!ride || ride.activity.status !== 'published') continue;

		const upcomingOccurrences = ride.occurrences.filter(
			(occurrence) =>
				occurrence.status === 'scheduled' &&
				occurrence.starts_at <= horizonIso &&
				new Date(occurrence.ends_at).getTime() >= now
		);

		for (const occurrence of upcomingOccurrences) {
			const scheduledAt =
				new Date(occurrence.starts_at).getTime() - Number(template.send_offset_minutes) * 60_000;
			if (scheduledAt > now) continue;

			const { data: deliveries, error: deliveriesError } = await supabase
				.from('activity_email_deliveries')
				.select('activity_rsvp_id')
				.eq('template_id', template.id)
				.eq('activity_occurrence_id', occurrence.id);
			if (deliveriesError) {
				console.error('Unable to inspect reminder deliveries', deliveriesError);
				continue;
			}
			const deliveredIds = new Set((deliveries ?? []).map((row) => row.activity_rsvp_id));

			for (const rsvp of occurrence.rsvps.filter((entry) => entry.status === 'going')) {
				if (!rsvp.participantEmail || deliveredIds.has(rsvp.id)) continue;

				const reminderContext = buildRideReminderContext({
					activity: ride.activity,
					rideDetails: ride.rideDetails,
					occurrence,
					rsvp: {
						participant_name: rsvp.participantName
					},
					rideUrl: `${DEFAULT_BRAND_ORIGIN}/ride/${ride.activity.slug}`
				});
				const subject = renderRideEmailTemplate(template.subject, reminderContext);
				const body = renderRideEmailTemplate(template.body, reminderContext);
				if (!subject || !body) continue;

				await sendEmail(
					{
						to: rsvp.participantEmail,
						subject,
						text: body,
						html: textToHtml(body),
						replyTo: ride.activity.contact_email || undefined,
						tags: [
							{ Name: 'context', Value: 'ride-reminder' },
							{ Name: 'ride_id', Value: String(ride.activity.id) },
							{ Name: 'ride_occurrence_id', Value: String(occurrence.id) },
							{ Name: 'ride_template_id', Value: String(template.id) }
						]
					},
					{ fetch: event.fetch }
				);

				const { error: deliveryInsertError } = await supabase
					.from('activity_email_deliveries')
					.insert({
						template_id: template.id,
						activity_occurrence_id: occurrence.id,
						activity_rsvp_id: rsvp.id,
						recipient_email: rsvp.participantEmail
					});
				if (deliveryInsertError) {
					console.error('Unable to store ride email delivery', deliveryInsertError);
				}
				sent += 1;
			}
		}

		if (sent > 0) {
			await supabase
				.from('activity_email_templates')
				.update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
				.eq('id', template.id);
		}

		processed.push(template.id);
	}

	return json({ data: { sent, processed } });
}
