import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import {
	canManageSmsThread,
	getSmsServiceClient,
	enqueueSms,
	normalizeSmsPhone
} from '$lib/server/sms';

const ALLOWED_KINDS = new Set(['admin', 'bike_valet']);

function publicValidationError(error) {
	const message = String(error?.message || '');
	return /^(SMS message cannot be empty|SMS messages are limited to|SMS messages may only include links to 3fp\.org|SMS messages contain an invalid link)/.test(
		message
	)
		? message
		: '';
}

export async function POST(event) {
	const { cookies, params, request } = event;
	const { user } = await getActivityClient(cookies);
	if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });

	const threadId = String(params.threadId || '').trim();
	if (!threadId) return json({ error: 'SMS thread is required.' }, { status: 400 });

	const limited = enforceRateLimit(event, { name: 'sms-send', limit: 30, key: user.id });
	if (limited) return limited;

	const parsed = await readJsonBody(request, { maxBytes: 32 * 1024 });
	if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
	const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
	const message = typeof body.body === 'string' ? body.body : '';
	const kind = ALLOWED_KINDS.has(body.kind) ? body.kind : 'admin';

	try {
		const service = getSmsServiceClient();
		if (!(await canManageSmsThread(service, user.id, threadId))) {
			return json({ error: 'You do not have access to this SMS conversation.' }, { status: 403 });
		}

		const { data: thread, error: threadError } = await service
			.from('sms_threads')
			.select('*')
			.eq('id', threadId)
			.maybeSingle();
		if (threadError) throw threadError;
		if (!thread) return json({ error: 'SMS conversation not found.' }, { status: 404 });

		const result = await enqueueSms({
			supabase: service,
			userId: thread.user_id,
			phoneE164: normalizeSmsPhone(thread.phone_e164),
			kind,
			body: message,
			dedupeKey: `thread:${thread.id}:${crypto.randomUUID()}`,
			context: {
				activityEventId: thread.activity_event_id,
				activityOccurrenceId: thread.activity_occurrence_id,
				volunteerEventId: thread.volunteer_event_id,
				volunteerSignupId: thread.volunteer_signup_id,
				bikeValetReference: thread.bike_valet_reference,
				subject: thread.subject,
				managerUserIds: [user.id]
			},
			managerUserIds: [user.id],
			createdByUserId: user.id,
			requireSubscription: true
		});

		if (!result.queued && !result.duplicate) {
			return json(
				{ error: `This SMS was not queued (${result.reason || 'not available'}).` },
				{ status: result.reason === 'daily_limit' ? 429 : 409 }
			);
		}

		return json(
			{ queued: result.queued === true, duplicate: result.duplicate === true, threadId },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Unable to queue SMS reply', error);
		const validationError = publicValidationError(error);
		return json(
			{ error: validationError || 'Unable to queue SMS reply.' },
			{ status: validationError ? 400 : 500 }
		);
	}
}
