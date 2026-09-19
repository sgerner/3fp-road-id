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
	const campaignId = String(
		payload.CampaignSid || payload.campaign_sid || payload.campaign_id || payload.id || ''
	).trim();
	const status = String(payload.Status || payload.status || payload.state || 'unknown')
		.trim()
		.toLowerCase();
	const externalId = `campaign:${campaignId || 'unknown'}:${status}`;
	const supabase = getSmsServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 503 });

	const { error } = await supabase.from('sms_provider_events').upsert(
		{
			provider: 'signalwire',
			event_type: 'campaign_status',
			external_event_id: externalId,
			payload
		},
		{ onConflict: 'provider,external_event_id', ignoreDuplicates: true }
	);
	if (error) {
		console.error('Unable to record SignalWire campaign status', error);
		return json({ error: 'Unable to record campaign status.' }, { status: 500 });
	}
	return json({ ok: true });
}
