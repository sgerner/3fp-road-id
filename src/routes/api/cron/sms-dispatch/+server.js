import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import {
	getSignalWireConfig,
	getSmsServiceClient,
	recordSmsMessage,
	sendSignalWireMessage,
	subscriptionAllowsSms
} from '$lib/server/sms';

const BATCH_LIMIT = 50;

function cronSecret(request) {
	return (
		request.headers.get('x-cron-secret') ||
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		''
	);
}

async function releaseRows(supabase, rows, errorMessage) {
	const ids = rows.map((row) => row.id).filter(Boolean);
	if (!ids.length) return;
	await supabase
		.from('sms_outbox')
		.update({
			status: 'queued',
			locked_at: null,
			last_error: String(errorMessage || '').slice(0, 500),
			updated_at: new Date().toISOString()
		})
		.in('id', ids);
}

function smsFailureMessage(error, fallback = 'SignalWire delivery failed') {
	const providerDetails = Array.isArray(error?.providerPayload?.errors)
		? error.providerPayload.errors
				.map((item) => [item?.code, item?.message].filter(Boolean).join(': '))
				.filter(Boolean)
				.join('; ')
		: '';
	return String(providerDetails || error?.message || fallback).slice(0, 500);
}

async function stillEligible(supabase, row) {
	if (!row?.subscription_id) return false;
	const { data, error } = await supabase
		.from('sms_subscriptions')
		.select(
			'status,phone_e164,ride_reminders,volunteer_reminders,admin_messages,bike_valet_messages'
		)
		.eq('id', row.subscription_id)
		.maybeSingle();
	if (error) throw error;
	return subscriptionAllowsSms(data, { kind: row.kind, phoneE164: row.phone_e164 });
}

export async function POST(event) {
	const verified = await getCronSecretVerifier('sms_dispatch', cronSecret(event.request));
	if (!verified) return json({ error: 'Unauthorized cron request' }, { status: 401 });

	const supabase = getSmsServiceClient();
	if (!supabase) return json({ error: 'Service client unavailable' }, { status: 503 });

	const { data: rows, error: claimError } = await supabase.rpc('claim_sms_outbox', {
		batch_limit: BATCH_LIMIT
	});
	if (claimError) {
		console.error('Unable to claim SMS outbox rows', claimError);
		return json({ error: 'Unable to claim SMS messages.' }, { status: 500 });
	}

	const claimed = Array.isArray(rows) ? rows : [];
	if (!claimed.length) return json({ data: { claimed: 0, sent: 0, failed: 0 } });

	const config = getSignalWireConfig();
	if (!config.configured) {
		await releaseRows(supabase, claimed, 'SignalWire is not configured.');
		return json(
			{ error: 'SignalWire is not configured.', data: { claimed: claimed.length } },
			{ status: 503 }
		);
	}

	let sent = 0;
	let failed = 0;
	let localErrors = 0;
	for (const row of claimed) {
		let providerAccepted = false;
		let provider = null;
		try {
			if (!(await stillEligible(supabase, row))) {
				await supabase
					.from('sms_outbox')
					.update({
						status: 'cancelled',
						locked_at: null,
						last_error: 'SMS subscription is no longer eligible.',
						updated_at: new Date().toISOString()
					})
					.eq('id', row.id);
				continue;
			}
			provider = await sendSignalWireMessage({ to: row.phone_e164, body: row.body });
			providerAccepted = true;
			const acceptedAt = new Date().toISOString();
			const acceptedUpdate = await supabase
				.from('sms_outbox')
				.update({
					status: 'sent',
					sent_at: acceptedAt,
					provider_message_id: provider.providerMessageId,
					provider_status: provider.providerStatus,
					locked_at: null,
					last_error: null,
					updated_at: acceptedAt
				})
				.eq('id', row.id);
			if (acceptedUpdate.error) throw acceptedUpdate.error;
			sent += 1;
			await recordSmsMessage(supabase, {
				threadId: row.thread_id,
				direction: 'outbound',
				kind: row.kind,
				fromPhone: config.fromNumber,
				toPhone: row.phone_e164,
				body: row.body,
				providerMessageId: provider.providerMessageId,
				providerStatus: provider.providerStatus,
				segments: row.metadata?.segments || 1,
				metadata: { outboxId: row.id, provider: 'signalwire' },
				sentAt: new Date().toISOString()
			});
		} catch (error) {
			if (providerAccepted) localErrors += 1;
			else failed += 1;
			const { error: updateError } = await supabase
				.from('sms_outbox')
				.update({
					// Never automatically retry a provider call whose outcome is
					// ambiguous; the request may already have been billed.
					status: providerAccepted ? 'sent' : 'failed',
					provider_message_id: providerAccepted ? provider?.providerMessageId || null : null,
					provider_status: providerAccepted ? provider?.providerStatus || 'accepted' : null,
					sent_at: providerAccepted ? new Date().toISOString() : null,
					locked_at: null,
					last_error: providerAccepted
						? `Provider accepted the SMS, but local recording failed: ${smsFailureMessage(error, 'unknown error')}`
						: smsFailureMessage(error),
					updated_at: new Date().toISOString()
				})
				.eq('id', row.id);
			if (updateError) console.error('Unable to update failed SMS outbox row', updateError);
			console.error(
				providerAccepted
					? 'SignalWire accepted SMS but local recording failed'
					: 'SignalWire SMS delivery failed',
				{ id: row.id, error }
			);
		}
	}

	return json({ data: { claimed: claimed.length, sent, failed, localErrors } });
}
