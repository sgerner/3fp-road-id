import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { getConfiguredPublicOrigin } from '$lib/server/publicOrigin';
import { sendServerEmail } from '$lib/server/email';
import {
	getSmsServiceClient,
	getSignalWireConfig,
	handleSignalWireInbound,
	twimlEmpty,
	twimlMessage
} from '$lib/server/sms';
import {
	enforceRateLimit,
	readRawBody,
	verifySignalWireWebhookRequest
} from '$lib/server/security';

function response(body, status = 200) {
	return new Response(body, {
		status,
		headers: {
			'content-type': 'text/xml; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}

function htmlEscape(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

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

async function notifyThreadMembers(event, thread, inboundBody) {
	if (!thread?.id || !inboundBody) return;
	const supabase = getSmsServiceClient();
	if (!supabase) return;
	const { data: members, error: membersError } = await supabase
		.from('sms_thread_members')
		.select('user_id')
		.eq('thread_id', thread.id);
	if (membersError) throw membersError;
	const ids = [...new Set((members || []).map((row) => row.user_id).filter(Boolean))];
	if (!ids.length) return;
	const { data: profiles, error: profilesError } = await supabase
		.from('profiles')
		.select('email')
		.in('user_id', ids);
	if (profilesError) throw profilesError;
	const recipients = [
		...new Set(
			(profiles || []).map((profile) => String(profile.email || '').trim()).filter(Boolean)
		)
	];
	if (!recipients.length) return;

	const subject = `New 3FP SMS message${thread.subject ? `: ${thread.subject}` : ''}`;
	const text = [
		'A new SMS message needs a reply in the 3 Feet Please portal.',
		'',
		`From: ${thread.phone_e164}`,
		`Conversation: ${thread.subject || '3FP SMS conversation'}`,
		'',
		inboundBody,
		'',
		`Reply in ${getConfiguredPublicOrigin()}/messages`
	].join('\n');
	const html = `<p>A new SMS message needs a reply in the 3 Feet Please portal.</p><p><strong>From:</strong> ${htmlEscape(thread.phone_e164)}<br /><strong>Conversation:</strong> ${htmlEscape(thread.subject || '3FP SMS conversation')}</p><blockquote>${htmlEscape(inboundBody)}</blockquote><p><a href="${htmlEscape(getConfiguredPublicOrigin())}/messages">Open the SMS inbox</a></p>`;
	await sendServerEmail(
		{
			to: recipients,
			subject,
			text,
			html,
			tags: [{ Name: 'context', Value: 'sms-inbound' }]
		},
		{ fetch: event.fetch }
	);
}

export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'signalwire-inbound',
		limit: 120,
		windowMs: 60_000
	});
	if (limited) return limited;

	const rawResult = await readRawBody(event.request, { maxBytes: 64 * 1024 });
	if (!rawResult.ok) return response(twimlMessage(rawResult.error), rawResult.status);
	const rawBody = rawResult.value;
	if (
		!verifySignalWireWebhookRequest(event.request, rawBody, env.SIGNALWIRE_SIGNING_KEY, {
			publicUrl: event.request.url
		})
	) {
		return response(twimlMessage('3FP: Webhook authentication failed.'), 401);
	}

	const payload = parsePayload(rawBody, event.request.headers.get('content-type'));
	if (!payload) return response(twimlMessage('3FP: Invalid webhook payload.'), 400);

	const config = getSignalWireConfig();
	const destination = String(payload.To || payload.to || payload.destination || '').trim();
	if (
		config.fromNumber &&
		destination &&
		destination.replace(/\D/g, '') !== config.fromNumber.replace(/\D/g, '')
	) {
		return response(twimlMessage('3FP: Invalid destination.'), 403);
	}

	try {
		const service = getSmsServiceClient();
		if (!service)
			return response(twimlMessage('3FP: SMS service is temporarily unavailable.'), 503);
		const providerId = String(
			payload.MessageSid || payload.message_sid || payload.id || payload.message_id || ''
		).trim();
		const eventKey = `inbound:${providerId || createHash('sha256').update(rawBody).digest('hex')}`;
		const existingEvent = await service
			.from('sms_provider_events')
			.select('id')
			.eq('provider', 'signalwire')
			.eq('external_event_id', eventKey)
			.maybeSingle();
		if (existingEvent.error) throw existingEvent.error;
		if (existingEvent.data) return response(twimlEmpty());
		const claim = await service
			.from('sms_provider_events')
			.insert({
				provider: 'signalwire',
				event_type: 'inbound',
				external_event_id: eventKey,
				payload: { ...payload, _processing: true }
			})
			.select('id')
			.maybeSingle();
		if (claim.error) {
			if (claim.error.code === '23505') return response(twimlEmpty());
			throw claim.error;
		}

		const result = await handleSignalWireInbound({ supabase: service, payload });
		if (claim.data?.id) {
			await service
				.from('sms_provider_events')
				.update({ payload: { ...payload, _processed: true } })
				.eq('id', claim.data.id);
		}
		const keyword = result.keyword;
		const mediaCount =
			Number(payload.NumMedia || payload.num_media || payload.media_count || 0) || 0;
		if (!keyword && mediaCount === 0 && String(result.body || '').trim()) {
			try {
				await notifyThreadMembers(event, result.thread, String(result.body).trim());
			} catch (notificationError) {
				console.error('Unable to notify SMS thread members by email', notificationError);
			}
		}
		return response(result.responseBody);
	} catch (error) {
		console.error('Unable to process SignalWire inbound SMS', error);
		return response(twimlMessage('3FP: We could not process your message. Please try again.'), 500);
	}
}
