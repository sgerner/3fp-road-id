import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import {
	getSmsServiceClient,
	shouldApplySmsStatus,
	smsProviderMessageId,
	smsProviderStatus
} from '$lib/server/sms';
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
	const providerMessageId = smsProviderMessageId(payload);
	const providerStatus = smsProviderStatus(payload);
	if (!providerMessageId) return json({ ok: true, ignored: true });

	const supabase = getSmsServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 503 });

	try {
		const providerEvent = await supabase.from('sms_provider_events').upsert(
			{
				provider: 'signalwire',
				event_type: 'status',
				external_event_id: `status:${providerMessageId}:${providerStatus || 'unknown'}`,
				payload
			},
			{ onConflict: 'provider,external_event_id', ignoreDuplicates: true }
		);
		if (providerEvent.error) throw providerEvent.error;

		const failed = ['failed', 'undelivered', 'canceled', 'cancelled'].includes(providerStatus);
		const delivered = ['delivered', 'sent'].includes(providerStatus);
		const outboxUpdate = {
			provider_status: providerStatus || null,
			last_error: failed
				? String(
						payload.ErrorMessage ||
							payload.error_message ||
							payload.ErrorCode ||
							payload.error_code ||
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
		const [outboxRow, messageRow] = await Promise.all([
			supabase
				.from('sms_outbox')
				.select('id,provider_status')
				.eq('provider_message_id', providerMessageId)
				.limit(1)
				.maybeSingle(),
			supabase
				.from('sms_messages')
				.select('id,provider_status')
				.eq('provider_message_id', providerMessageId)
				.limit(1)
				.maybeSingle()
		]);
		if (outboxRow.error) throw outboxRow.error;
		if (messageRow.error) throw messageRow.error;
		if (!outboxRow.data && !messageRow.data) {
			return json(
				{ error: 'Message record is not ready; retry the callback.' },
				{ status: 503, headers: { 'retry-after': '2' } }
			);
		}

		if (outboxRow.data && shouldApplySmsStatus(outboxRow.data.provider_status, providerStatus)) {
			const result = await supabase
				.from('sms_outbox')
				.update(outboxUpdate)
				.eq('id', outboxRow.data.id);
			if (result.error) throw result.error;
		}
		if (messageRow.data && shouldApplySmsStatus(messageRow.data.provider_status, providerStatus)) {
			const result = await supabase
				.from('sms_messages')
				.update({ provider_status: providerStatus || null })
				.eq('id', messageRow.data.id);
			if (result.error) throw result.error;
		}

		return json({ ok: true, matched: true });
	} catch (error) {
		console.error('Unable to process SignalWire SMS status webhook', error);
		return json({ error: 'Unable to process webhook.' }, { status: 500 });
	}
}
