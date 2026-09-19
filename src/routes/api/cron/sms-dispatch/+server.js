import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import {
	getSignalWireConfig,
	getSmsServiceClient,
	recordSmsMessage,
	sendSignalWireMessage
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

async function stillEligible(supabase, row) {
	if (!row?.subscription_id) return false;
	const { data, error } = await supabase
		.from('sms_subscriptions')
		.select('status')
		.eq('id', row.subscription_id)
		.maybeSingle();
	if (error) throw error;
	if (data?.status === 'active') return true;
	return (
		data?.status === 'paused' &&
		row.kind === 'system' &&
		row.metadata?.purpose === 'sms_verification'
	);
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
	for (const row of claimed) {
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
			const provider = await sendSignalWireMessage({ to: row.phone_e164, body: row.body });
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
			const { error: updateError } = await supabase
				.from('sms_outbox')
				.update({
					status: 'sent',
					sent_at: new Date().toISOString(),
					provider_message_id: provider.providerMessageId,
					provider_status: provider.providerStatus,
					locked_at: null,
					last_error: null,
					updated_at: new Date().toISOString()
				})
				.eq('id', row.id);
			if (updateError) throw updateError;
			sent += 1;
		} catch (error) {
			failed += 1;
			const { error: updateError } = await supabase
				.from('sms_outbox')
				.update({
					// Never automatically retry a provider call whose outcome is
					// ambiguous; the request may already have been billed.
					status: 'failed',
					locked_at: null,
					last_error: String(error?.message || 'SignalWire delivery failed').slice(0, 500),
					updated_at: new Date().toISOString()
				})
				.eq('id', row.id);
			if (updateError) console.error('Unable to update failed SMS outbox row', updateError);
			console.error('SignalWire SMS delivery failed', { id: row.id, error });
		}
	}

	return json({ data: { claimed: claimed.length, sent, failed } });
}
