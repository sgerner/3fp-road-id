import * as env from '$app/env/private';
import { json } from '@sveltejs/kit';
import { getSmsServiceClient } from '#lib/server/sms';
import { readAuthenticatedSignalWirePayload } from '#lib/server/security';

export async function POST(event) {
	const webhook = await readAuthenticatedSignalWirePayload(
		event.request,
		env.SIGNALWIRE_SIGNING_KEY
	);
	if (!webhook.ok) return json({ error: webhook.error }, { status: webhook.status });
	const { payload } = webhook;
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
