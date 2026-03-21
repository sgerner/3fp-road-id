import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import { getCronSecretVerifier } from '$lib/server/activities';
import { getGroupNewsServiceClient, renderGroupUpdateEmailContent } from '$lib/server/groupNews';

const BATCH_LIMIT = 25;
const GROUP_UPDATE_SOURCE = 'group_update';

async function markDueCampaignsAsSending(supabase) {
	const nowIso = new Date().toISOString();
	const { error } = await supabase
		.from('group_membership_emails')
		.update({
			status: 'sending',
			updated_at: nowIso
		})
		.eq('status', 'scheduled')
		.lte('scheduled_at', nowIso)
		.contains('audience_filters', { source: GROUP_UPDATE_SOURCE });

	if (error) throw error;
}

async function refreshCampaignStatus(supabase, emailId) {
	const { data: sends, error: sendsError } = await supabase
		.from('group_membership_email_sends')
		.select('send_state')
		.eq('email_id', emailId);

	if (sendsError) throw sendsError;

	const summary = (sends ?? []).reduce(
		(state, send) => {
			if (send.send_state === 'pending') state.pending += 1;
			else if (send.send_state === 'sent') state.sent += 1;
			else if (send.send_state === 'failed') state.failed += 1;
			else if (send.send_state === 'skipped') state.skipped += 1;
			return state;
		},
		{ pending: 0, sent: 0, failed: 0, skipped: 0 }
	);

	const nextStatus = summary.pending > 0 ? 'sending' : summary.failed > 0 ? 'failed' : 'sent';
	const finishedAt = summary.pending === 0 ? new Date().toISOString() : null;

	const { error: updateError } = await supabase
		.from('group_membership_emails')
		.update({
			status: nextStatus,
			sent_count: summary.sent,
			failed_count: summary.failed,
			sent_at: finishedAt,
			updated_at: new Date().toISOString()
		})
		.eq('id', emailId);

	if (updateError) throw updateError;
}

function isValidEmailAddress(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
		String(value || '')
			.trim()
			.toLowerCase()
	);
}

export async function POST(event) {
	const providedSecret =
		event.request.headers.get('x-cron-secret') ||
		event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		'';
	const verified = await getCronSecretVerifier('group_update_emails', providedSecret);
	if (!verified) return json({ error: 'Unauthorized cron request' }, { status: 401 });

	const supabase = getGroupNewsServiceClient();
	if (!supabase) {
		return json({ error: 'Service client unavailable' }, { status: 500 });
	}

	try {
		await markDueCampaignsAsSending(supabase);
	} catch (campaignError) {
		console.error('Unable to mark due group update emails as sending', campaignError);
		return json({ error: campaignError.message }, { status: 500 });
	}

	const { data: campaignRows, error: campaignsError } = await supabase
		.from('group_membership_emails')
		.select('id,group_id,campaign_name,subject_template,body_template,audience_filters,status')
		.eq('status', 'sending')
		.contains('audience_filters', { source: GROUP_UPDATE_SOURCE })
		.order('scheduled_at', { ascending: true })
		.limit(BATCH_LIMIT);

	if (campaignsError) {
		console.error('Unable to load scheduled group update email campaigns', campaignsError);
		return json({ error: campaignsError.message }, { status: 500 });
	}

	const campaignIds = (campaignRows ?? []).map((row) => row.id).filter(Boolean);
	if (!campaignIds.length) {
		return json({
			data: {
				processed: 0,
				sent: 0,
				failed: 0,
				skipped: 0
			}
		});
	}

	const campaignsById = new Map((campaignRows ?? []).map((row) => [row.id, row]));

	const { data: sends, error: sendsError } = await supabase
		.from('group_membership_email_sends')
		.select('id,email_id,recipient_email,created_at')
		.eq('send_state', 'pending')
		.in('email_id', campaignIds)
		.order('created_at', { ascending: true })
		.limit(BATCH_LIMIT);

	if (sendsError) {
		console.error('Unable to load queued group update email sends', sendsError);
		return json({ error: sendsError.message }, { status: 500 });
	}

	let sent = 0;
	let failed = 0;
	let skipped = 0;
	const touchedEmailIds = new Set();

	for (const send of sends ?? []) {
		const emailCampaign = campaignsById.get(send.email_id);
		if (!emailCampaign || emailCampaign.status !== 'sending') continue;

		touchedEmailIds.add(emailCampaign.id);
		const nowIso = new Date().toISOString();
		const recipientEmail = String(send.recipient_email || '')
			.trim()
			.toLowerCase();

		if (!isValidEmailAddress(recipientEmail)) {
			const { error: skipError } = await supabase
				.from('group_membership_email_sends')
				.update({
					send_state: 'skipped',
					error_text: 'Missing valid recipient email.',
					updated_at: nowIso
				})
				.eq('id', send.id);
			if (skipError) {
				console.error('Unable to mark invalid group update email send as skipped', skipError);
			}
			skipped += 1;
			continue;
		}

		try {
			const content = await renderGroupUpdateEmailContent(emailCampaign);
			await sendEmail(
				{
					to: recipientEmail,
					subject: emailCampaign.subject_template,
					html: content.html,
					text: content.text,
					tags: [
						{ Name: 'context', Value: 'group-update' },
						{ Name: 'group_membership_email_id', Value: String(emailCampaign.id) }
					],
					branding: content.branding
				},
				{ fetch: event.fetch }
			);

			const { error: updateError } = await supabase
				.from('group_membership_email_sends')
				.update({
					send_state: 'sent',
					error_text: null,
					sent_at: nowIso,
					updated_at: nowIso
				})
				.eq('id', send.id);
			if (updateError) {
				console.error('Unable to store sent group update email send', updateError);
			}
			sent += 1;
		} catch (sendError) {
			const { error: updateError } = await supabase
				.from('group_membership_email_sends')
				.update({
					send_state: 'failed',
					error_text: sendError?.message || 'Email send failed.',
					updated_at: nowIso
				})
				.eq('id', send.id);
			if (updateError) {
				console.error('Unable to store failed group update email send', updateError);
			}
			failed += 1;
		}
	}

	for (const emailId of touchedEmailIds) {
		try {
			await refreshCampaignStatus(supabase, emailId);
		} catch (refreshError) {
			console.error('Unable to refresh group update email campaign status', refreshError);
		}
	}

	return json({
		data: {
			processed: (sends ?? []).length,
			sent,
			failed,
			skipped
		}
	});
}
