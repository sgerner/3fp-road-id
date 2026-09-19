import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getSmsServiceClient } from '$lib/server/sms';
import { readRawBody, verifySignalWireWebhookRequest } from '$lib/server/security';

function parsePayload(raw, contentType) {
	if (/application\/json/i.test(contentType || '')) {
		try {
			const parsed = raw ? JSON.parse(raw) : {};
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return null;
		}
	}
	return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(event) {
	const rawResult = await readRawBody(event.request, { maxBytes: 64 * 1024 });
	if (!rawResult.ok) return json({ error: rawResult.error }, { status: rawResult.status });
	const rawBody = rawResult.value;
	if (
		!verifySignalWireWebhookRequest(event.request, rawBody, env.SIGNALWIRE_SIGNING_KEY, {
			publicUrl: event.request.url
		})
	) {
		return json({ error: 'Webhook authentication failed.' }, { status: 401 });
	}

	const payload = parsePayload(rawBody, event.request.headers.get('content-type'));
	if (!payload) return json({ error: 'Invalid webhook payload.' }, { status: 400 });
	const providerMessageId = String(
		payload.MessageSid || payload.message_sid || payload.sid || ''
	).trim();
	const providerStatus = String(
		payload.MessageStatus || payload.message_status || payload.status || ''
	)
		.trim()
		.toLowerCase();
	if (!providerMessageId) return json({ ok: true, ignored: true });

	const supabase = getSmsServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 503 });

	try {
		await supabase.from('sms_provider_events').upsert(
			{
				provider: 'signalwire',
				event_type: 'status',
				external_event_id: `status:${providerMessageId}:${providerStatus || 'unknown'}`,
				payload
			},
			{ onConflict: 'provider,external_event_id', ignoreDuplicates: true }
		);

		const failed = ['failed', 'undelivered', 'canceled', 'cancelled'].includes(providerStatus);
		const delivered = ['delivered', 'sent'].includes(providerStatus);
		const outboxUpdate = {
			provider_status: providerStatus || null,
			last_error: failed
				? String(
						payload.ErrorMessage ||
							payload.error_message ||
							payload.ErrorCode ||
							'Provider delivery failed'
					).slice(0, 500)
				: null,
			updated_at: new Date().toISOString()
		};
		if (failed) outboxUpdate.status = 'failed';
		if (delivered) {
			outboxUpdate.status = 'sent';
			outboxUpdate.locked_at = null;
		}
		await supabase
			.from('sms_outbox')
			.update(outboxUpdate)
			.eq('provider_message_id', providerMessageId);
		await supabase
			.from('sms_messages')
			.update({ provider_status: providerStatus || null })
			.eq('provider_message_id', providerMessageId);

		return json({ ok: true });
	} catch (error) {
		console.error('Unable to process SignalWire SMS status webhook', error);
		return json({ error: 'Unable to process webhook.' }, { status: 500 });
	}
}
