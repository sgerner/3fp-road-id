import { env } from '$env/dynamic/private';
import { getConfiguredPublicOrigin } from '$lib/server/publicOrigin';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { normalizeE164PhoneNumber } from '$lib/utils/phone';
import {
	SMS_MAX_BODY_LENGTH,
	SMS_MAX_SEGMENTS,
	buildSmsContextKey,
	classifySmsKeyword,
	smsSegmentCount,
	validateSmsBody
} from '$lib/utils/sms';

export {
	SMS_MAX_BODY_LENGTH,
	SMS_MAX_SEGMENTS,
	buildSmsContextKey,
	classifySmsKeyword,
	smsSegmentCount,
	validateSmsBody
} from '$lib/utils/sms';

export const SMS_CONSENT_VERSION = '2026-09-19';
export const SMS_CONSENT_TEXT =
	'By checking this box, I agree to receive recurring 3 Feet Please SMS messages about the categories I select. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to rejoin, or HELP for help.';
export const SMS_DAILY_LIMIT = 12;

const CATEGORY_BY_KIND = {
	ride_reminder: 'ride_reminders',
	volunteer_reminder: 'volunteer_reminders',
	admin: 'admin_messages',
	bike_valet: 'bike_valet_messages'
};

const MANAGER_ROLES = ['owner', 'admin'];
function cleanText(value, maxLength = 2000) {
	if (value === null || value === undefined) return '';
	return String(value).split('\u0000').join('').trim().slice(0, maxLength);
}

function asId(value) {
	const result = cleanText(value, 100);
	return result || null;
}

function asArray(value) {
	return Array.isArray(value) ? value : [];
}

function uniqueIds(values) {
	return Array.from(new Set(asArray(values).map(asId).filter(Boolean)));
}

function normalizeSpaceUrl(value) {
	const raw = cleanText(value, 300).replace(/\/+$/, '');
	if (!raw) return '';
	return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function getSignalWireConfig() {
	const spaceUrl = normalizeSpaceUrl(env.SIGNALWIRE_SPACE_URL || env.SIGNALWIRE_SPACE);
	const projectId = cleanText(env.SIGNALWIRE_PROJECT_ID || env.SIGNALWIRE_PROJECT, 200);
	const apiToken = cleanText(
		env.SIGNALWIRE_API_TOKEN || env.SIGNALWIRE_API_KEY || env.SIGNALWIRE_TOKEN,
		500
	);
	const fromNumber = normalizeE164PhoneNumber(
		env.SIGNALWIRE_FROM_NUMBER || env.SIGNALWIRE_PHONE_NUMBER || ''
	);
	return {
		spaceUrl,
		projectId,
		apiToken,
		fromNumber,
		configured: Boolean(spaceUrl && projectId && apiToken && fromNumber)
	};
}

export function normalizeSmsPhone(value) {
	return normalizeE164PhoneNumber(value);
}

function contextPayload(context = {}) {
	return {
		activity_event_id: asId(context.activityEventId),
		activity_occurrence_id: asId(context.activityOccurrenceId),
		volunteer_event_id: asId(context.volunteerEventId),
		volunteer_signup_id: asId(context.volunteerSignupId),
		bike_valet_reference: cleanText(context.bikeValetReference, 120) || null,
		subject: cleanText(context.subject, 200) || '3FP SMS conversation',
		context_key: buildSmsContextKey(context)
	};
}

export function getSmsServiceClient() {
	return createServiceSupabaseClient();
}

async function getGlobalSmsAdminIds(supabase) {
	const { data, error } = await supabase
		.from('profiles')
		.select('user_id')
		.eq('admin', true)
		.limit(100);
	if (error) throw error;
	return uniqueIds(asArray(data).map((row) => row.user_id));
}

export async function getSmsManagerIds(supabase, context = {}) {
	const managerIds = new Set(await getGlobalSmsAdminIds(supabase));
	const activityEventId = asId(context.activityEventId);
	const volunteerEventId = asId(context.volunteerEventId);

	if (activityEventId) {
		const { data: activity, error: activityError } = await supabase
			.from('activity_events')
			.select('host_user_id,host_group_id')
			.eq('id', activityEventId)
			.maybeSingle();
		if (activityError) throw activityError;
		if (activity?.host_user_id) managerIds.add(String(activity.host_user_id));

		const { data: hosts, error: hostsError } = await supabase
			.from('activity_hosts')
			.select('user_id')
			.eq('activity_event_id', activityEventId);
		if (hostsError) throw hostsError;
		for (const host of asArray(hosts)) if (host.user_id) managerIds.add(String(host.user_id));

		if (activity?.host_group_id) {
			const { data: members, error: membersError } = await supabase
				.from('group_members')
				.select('user_id')
				.eq('group_id', activity.host_group_id)
				.in('role', MANAGER_ROLES);
			if (membersError) throw membersError;
			for (const member of asArray(members))
				if (member.user_id) managerIds.add(String(member.user_id));
		}
	}

	if (volunteerEventId) {
		const { data: event, error: eventError } = await supabase
			.from('volunteer_events')
			.select('host_user_id,host_group_id')
			.eq('id', volunteerEventId)
			.maybeSingle();
		if (eventError) throw eventError;
		if (event?.host_user_id) managerIds.add(String(event.host_user_id));

		const { data: hosts, error: hostsError } = await supabase
			.from('volunteer_event_hosts')
			.select('user_id')
			.eq('event_id', volunteerEventId);
		if (hostsError) throw hostsError;
		for (const host of asArray(hosts)) if (host.user_id) managerIds.add(String(host.user_id));

		if (event?.host_group_id) {
			const { data: members, error: membersError } = await supabase
				.from('group_members')
				.select('user_id')
				.eq('group_id', event.host_group_id)
				.in('role', MANAGER_ROLES);
			if (membersError) throw membersError;
			for (const member of asArray(members))
				if (member.user_id) managerIds.add(String(member.user_id));
		}
	}

	for (const id of uniqueIds(context.managerUserIds)) managerIds.add(id);
	return Array.from(managerIds);
}

async function loadSubscription(supabase, { userId, phoneE164 } = {}) {
	let query = supabase.from('sms_subscriptions').select('*');
	if (userId) query = query.eq('user_id', userId);
	else if (phoneE164)
		query = query.eq('phone_e164', phoneE164).order('updated_at', { ascending: false });
	else return null;
	const { data, error } = await query.limit(1).maybeSingle();
	if (error) throw error;
	return data ?? null;
}

export async function cancelSmsOutboxForPhone(
	supabase,
	phoneE164,
	reason = 'SMS subscription inactive.'
) {
	const normalizedPhone = normalizeSmsPhone(phoneE164);
	if (!normalizedPhone) return 0;
	const result = await supabase
		.from('sms_outbox')
		.update({
			status: 'cancelled',
			locked_at: null,
			last_error: cleanText(reason, 500),
			updated_at: new Date().toISOString()
		})
		.eq('phone_e164', normalizedPhone)
		.in('status', ['queued', 'sending'])
		.select('id');
	if (result.error) throw result.error;
	return asArray(result.data).length;
}

export async function cancelSmsVerificationOutboxForPhone(
	supabase,
	phoneE164,
	reason = 'SMS phone verification is no longer required.'
) {
	const normalizedPhone = normalizeSmsPhone(phoneE164);
	if (!normalizedPhone) return 0;
	const result = await supabase
		.from('sms_outbox')
		.update({
			status: 'cancelled',
			locked_at: null,
			last_error: cleanText(reason, 500),
			updated_at: new Date().toISOString()
		})
		.eq('phone_e164', normalizedPhone)
		.in('status', ['queued', 'sending'])
		.contains('metadata', { purpose: 'sms_verification' })
		.select('id');
	if (result.error) throw result.error;
	return asArray(result.data).length;
}

async function ensureSmsThread(supabase, { userId, phoneE164, context = {}, managerUserIds = [] }) {
	const normalizedPhone = normalizeSmsPhone(phoneE164);
	if (!normalizedPhone) throw new Error('A valid SMS phone number is required.');
	const payload = contextPayload(context);
	let { data: thread, error } = await supabase
		.from('sms_threads')
		.select('*')
		.eq('phone_e164', normalizedPhone)
		.eq('context_key', payload.context_key)
		.maybeSingle();
	if (error) throw error;

	if (!thread) {
		const result = await supabase
			.from('sms_threads')
			.insert({
				...payload,
				phone_e164: normalizedPhone,
				user_id: asId(userId),
				last_message_at: new Date().toISOString()
			})
			.select('*')
			.single();
		if (result.error) throw result.error;
		thread = result.data;
	} else if (!thread.user_id && userId) {
		const result = await supabase
			.from('sms_threads')
			.update({ user_id: asId(userId), updated_at: new Date().toISOString() })
			.eq('id', thread.id)
			.select('*')
			.single();
		if (result.error) throw result.error;
		thread = result.data;
	}

	const ids = uniqueIds(managerUserIds);
	if (ids.length) {
		const members = ids.map((managerId) => ({ thread_id: thread.id, user_id: managerId }));
		const result = await supabase
			.from('sms_thread_members')
			.upsert(members, { onConflict: 'thread_id,user_id', ignoreDuplicates: true });
		if (result.error) throw result.error;
	}
	return thread;
}

export async function enqueueSms({
	supabase = getSmsServiceClient(),
	userId = null,
	phoneE164,
	kind = 'system',
	body,
	dedupeKey,
	context = {},
	managerUserIds = [],
	createdByUserId = null,
	metadata = {},
	requireSubscription = true
} = {}) {
	if (!supabase) throw new Error('SMS service client is unavailable.');
	const normalizedPhone = normalizeSmsPhone(phoneE164);
	if (!normalizedPhone) return { queued: false, reason: 'invalid_phone' };

	const subscription = await loadSubscription(supabase, {
		userId: asId(userId),
		phoneE164: normalizedPhone
	});
	if (requireSubscription) {
		const category = CATEGORY_BY_KIND[kind];
		if (!subscription || subscription.status !== 'active') {
			return { queued: false, reason: 'not_subscribed' };
		}
		if (category && subscription[category] !== true) {
			return { queued: false, reason: 'category_disabled' };
		}
	}

	const { body: safeBody, segments } = validateSmsBody(body, {
		appendStopFooter: ['ride_reminder', 'volunteer_reminder', 'admin', 'bike_valet'].includes(kind)
	});
	if (!cleanText(dedupeKey, 240)) throw new Error('SMS dedupe key is required.');

	const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	if (!['opt_in', 'opt_out', 'help'].includes(kind)) {
		const countResult = await supabase
			.from('sms_outbox')
			.select('id', { count: 'exact', head: true })
			.eq('phone_e164', normalizedPhone)
			.gte('created_at', sinceIso)
			.in('status', ['queued', 'sending', 'sent']);
		if (countResult.error) throw countResult.error;
		if ((countResult.count ?? 0) >= SMS_DAILY_LIMIT) {
			return { queued: false, reason: 'daily_limit' };
		}
	}

	const resolvedManagers = managerUserIds.length
		? uniqueIds(managerUserIds)
		: await getSmsManagerIds(supabase, context);
	const thread = await ensureSmsThread(supabase, {
		userId: asId(userId) || subscription?.user_id || null,
		phoneE164: normalizedPhone,
		context,
		managerUserIds: resolvedManagers
	});

	const insert = await supabase
		.from('sms_outbox')
		.insert({
			subscription_id: subscription?.id ?? null,
			thread_id: thread.id,
			user_id: asId(userId) || subscription?.user_id || null,
			phone_e164: normalizedPhone,
			kind,
			body: safeBody,
			dedupe_key: cleanText(dedupeKey, 240),
			created_by_user_id: asId(createdByUserId),
			metadata: { ...metadata, segments }
		})
		.select('*')
		.maybeSingle();

	if (insert.error) {
		if (insert.error.code === '23505') {
			const existing = await supabase
				.from('sms_outbox')
				.select('*')
				.eq('dedupe_key', cleanText(dedupeKey, 240))
				.maybeSingle();
			if (!existing.error && existing.data)
				return { queued: false, duplicate: true, outbox: existing.data };
		}
		throw insert.error;
	}
	return { queued: true, outbox: insert.data, thread };
}

export async function sendSignalWireMessage({ to, body }) {
	const config = getSignalWireConfig();
	if (!config.configured) {
		throw new Error(
			'SignalWire is not configured. Set SIGNALWIRE_SPACE_URL, SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, and SIGNALWIRE_FROM_NUMBER.'
		);
	}
	const destination = normalizeSmsPhone(to);
	const validated = validateSmsBody(body);
	if (!destination) throw new Error('SignalWire destination is not a valid E.164 number.');

	const callbackUrl = `${getConfiguredPublicOrigin()}/api/webhooks/signalwire/status`;
	const auth = Buffer.from(`${config.projectId}:${config.apiToken}`).toString('base64');
	const response = await fetch(`${config.spaceUrl}/api/messaging/messages`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			from: config.fromNumber,
			to: destination,
			body: validated.body,
			status_callback_url: callbackUrl
		})
	});
	const raw = await response.text().catch(() => '');
	let payload = {};
	try {
		payload = raw ? JSON.parse(raw) : {};
	} catch {
		payload = { raw };
	}
	if (!response.ok) {
		const error = new Error(
			payload?.message || payload?.error_message || 'SignalWire rejected the SMS.'
		);
		error.status = response.status;
		error.providerPayload = payload;
		throw error;
	}
	return {
		providerMessageId: cleanText(payload?.id || payload?.sid || payload?.message_id, 240) || null,
		providerStatus: cleanText(payload?.status || 'queued', 80),
		payload
	};
}

export async function recordSmsMessage(
	supabase,
	{
		threadId,
		direction,
		kind = 'system',
		fromPhone,
		toPhone,
		body,
		providerMessageId,
		providerStatus,
		mediaCount = 0,
		segments = 1,
		metadata = {},
		sentAt = null,
		validateOutbound = direction !== 'inbound'
	}
) {
	const safeBody = validateOutbound
		? validateSmsBody(body).body
		: cleanText(body, SMS_MAX_BODY_LENGTH) || '[Empty message]';
	const result = await supabase
		.from('sms_messages')
		.insert({
			thread_id: threadId,
			direction,
			kind,
			from_phone: fromPhone ? normalizeSmsPhone(fromPhone) : null,
			to_phone: toPhone ? normalizeSmsPhone(toPhone) : null,
			body: safeBody,
			provider_message_id: cleanText(providerMessageId, 240) || null,
			provider_status: cleanText(providerStatus, 80) || null,
			media_count: Math.max(0, Number(mediaCount) || 0),
			segments: Math.max(1, Number(segments) || 1),
			metadata,
			sent_at: sentAt
		})
		.select('*')
		.single();
	if (result.error) throw result.error;
	await supabase
		.from('sms_threads')
		.update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
		.eq('id', threadId);
	return result.data;
}

function xmlEscape(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export function twimlMessage(body) {
	return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(body)}</Message></Response>`;
}

export function twimlEmpty() {
	return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

async function loadInboundThread(supabase, phoneE164) {
	const { data, error } = await supabase
		.from('sms_threads')
		.select('*')
		.eq('phone_e164', phoneE164)
		.eq('status', 'open')
		.order('last_message_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

async function resolveInboundContext(supabase, userId) {
	if (!userId) return { subject: 'General 3FP SMS conversation' };
	const now = Date.now();

	const { data: rsvps, error: rsvpError } = await supabase
		.from('activity_rsvps')
		.select('id,activity_event_id,activity_occurrence_id,updated_at')
		.eq('user_id', userId)
		.eq('status', 'going')
		.order('updated_at', { ascending: false })
		.limit(25);
	if (rsvpError) throw rsvpError;
	for (const rsvp of asArray(rsvps)) {
		const [activityResult, occurrenceResult] = await Promise.all([
			supabase
				.from('activity_events')
				.select('id,title,status')
				.eq('id', rsvp.activity_event_id)
				.maybeSingle(),
			supabase
				.from('activity_occurrences')
				.select('id,starts_at,status')
				.eq('id', rsvp.activity_occurrence_id)
				.maybeSingle()
		]);
		if (activityResult.error) throw activityResult.error;
		if (occurrenceResult.error) throw occurrenceResult.error;
		if (
			activityResult.data?.status === 'published' &&
			occurrenceResult.data?.status === 'scheduled' &&
			Date.parse(occurrenceResult.data.starts_at || '') > now
		) {
			return {
				activityEventId: activityResult.data.id,
				activityOccurrenceId: occurrenceResult.data.id,
				subject: `Ride: ${cleanText(activityResult.data.title, 120)}`
			};
		}
	}

	const { data: signups, error: signupError } = await supabase
		.from('volunteer_signups')
		.select('id,event_id')
		.eq('volunteer_user_id', userId)
		.limit(50);
	if (signupError) throw signupError;
	const signupIds = asArray(signups)
		.map((signup) => signup.id)
		.filter(Boolean);
	if (!signupIds.length) return { subject: 'General 3FP SMS conversation' };

	const { data: assignments, error: assignmentError } = await supabase
		.from('volunteer_signup_shifts')
		.select('id,signup_id,shift_id')
		.in('signup_id', signupIds)
		.in('status', ['registered', 'pending', 'approved', 'confirmed', 'checked_in'])
		.limit(50);
	if (assignmentError) throw assignmentError;
	for (const assignment of asArray(assignments)) {
		const { data: shift, error: shiftError } = await supabase
			.from('volunteer_opportunity_shifts')
			.select('id,starts_at,opportunity_id')
			.eq('id', assignment.shift_id)
			.maybeSingle();
		if (shiftError) throw shiftError;
		if (!shift || Date.parse(shift.starts_at || '') <= now) continue;
		const { data: opportunity, error: opportunityError } = await supabase
			.from('volunteer_opportunities')
			.select('id,title,event_id')
			.eq('id', shift.opportunity_id)
			.maybeSingle();
		if (opportunityError) throw opportunityError;
		const { data: volunteerEvent, error: eventError } = await supabase
			.from('volunteer_events')
			.select('id,title,status')
			.eq('id', opportunity?.event_id)
			.maybeSingle();
		if (eventError) throw eventError;
		if (volunteerEvent?.status === 'published') {
			return {
				volunteerEventId: volunteerEvent.id,
				volunteerSignupId: assignment.signup_id,
				subject: `Volunteer: ${cleanText(volunteerEvent.title, 120)}`
			};
		}
	}

	return { subject: 'General 3FP SMS conversation' };
}

export async function handleSignalWireInbound({
	supabase = getSmsServiceClient(),
	payload = {}
} = {}) {
	if (!supabase) throw new Error('SMS service client is unavailable.');
	const fromPhone = normalizeSmsPhone(payload.From || payload.from || payload.source);
	const toPhone = normalizeSmsPhone(payload.To || payload.to || payload.destination);
	const body = cleanText(payload.Body || payload.body, SMS_MAX_BODY_LENGTH);
	const mediaCount = Math.max(
		0,
		Number(payload.NumMedia || payload.num_media || payload.media_count || 0) || 0
	);
	if (!fromPhone)
		return {
			responseBody: twimlMessage('3FP: We could not identify your phone number.'),
			ignored: true
		};

	const subscription = await loadSubscription(supabase, { phoneE164: fromPhone });
	let thread = await loadInboundThread(supabase, fromPhone);
	if (!thread) {
		const context = await resolveInboundContext(supabase, subscription?.user_id || null);
		const managerUserIds = await getSmsManagerIds(supabase, context);
		thread = await ensureSmsThread(supabase, {
			userId: subscription?.user_id || null,
			phoneE164: fromPhone,
			context,
			managerUserIds
		});
	}

	const keyword = classifySmsKeyword(body);
	let reply = '';
	let kind = 'system';
	if (keyword === 'stop') {
		kind = 'opt_out';
		reply =
			'3FP: You are unsubscribed and will receive no further messages. Reply START to rejoin.';
		const { data: subscriptions, error } = await supabase
			.from('sms_subscriptions')
			.select('*')
			.eq('phone_e164', fromPhone)
			.neq('status', 'blocked');
		if (error) throw error;
		for (const row of asArray(subscriptions)) {
			await supabase
				.from('sms_subscriptions')
				.update({
					status: 'unsubscribed',
					opted_out_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', row.id);
			await supabase.from('sms_consent_events').insert({
				subscription_id: row.id,
				user_id: row.user_id,
				phone_e164: fromPhone,
				event_type: 'stop',
				status: 'unsubscribed',
				consent_version: row.consent_version,
				consent_text: row.consent_text,
				source: 'signalwire-inbound'
			});
		}
		await cancelSmsOutboxForPhone(supabase, fromPhone, 'Cancelled after STOP request.');
	} else if (mediaCount > 0) {
		reply =
			'3FP: Text messages only are supported. Please use 3fp.org for photos or files. Reply STOP to opt out.';
	} else if (keyword === 'help') {
		kind = 'help';
		reply =
			'3FP help: Visit https://3fp.org/privacy or email hi@3fp.org. Msg & data rates may apply. Reply STOP to opt out.';
	} else if (keyword === 'start') {
		kind = 'opt_in';
		if (
			subscription &&
			subscription.status !== 'blocked' &&
			(subscription.ride_reminders ||
				subscription.volunteer_reminders ||
				subscription.admin_messages ||
				subscription.bike_valet_messages)
		) {
			await supabase
				.from('sms_subscriptions')
				.update({
					status: 'active',
					phone_verified_at: subscription.phone_verified_at || new Date().toISOString(),
					opted_in_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', subscription.id);
			await supabase.from('sms_consent_events').insert({
				subscription_id: subscription.id,
				user_id: subscription.user_id,
				phone_e164: fromPhone,
				event_type: 'start',
				status: 'active',
				consent_version: subscription.consent_version,
				consent_text: subscription.consent_text,
				source: 'signalwire-inbound'
			});
			reply =
				'3FP: You are re-subscribed to your selected updates. Msg frequency varies. Reply STOP to opt out.';
		} else {
			reply = '3FP: To subscribe, sign in at https://3fp.org/profile and choose your SMS updates.';
		}
	} else if (!subscription || subscription.status !== 'active') {
		reply =
			'3FP: This number is not subscribed. Sign in at https://3fp.org/profile to opt in. Reply HELP for help.';
	} else {
		reply =
			'3FP: Message received. A ride or volunteer admin will reply here. Reply STOP to opt out.';
	}

	if (subscription?.id) {
		await supabase
			.from('sms_subscriptions')
			.update({ last_inbound_at: new Date().toISOString(), updated_at: new Date().toISOString() })
			.eq('id', subscription.id);
	}
	await recordSmsMessage(supabase, {
		threadId: thread.id,
		direction: 'inbound',
		kind:
			keyword === 'stop'
				? 'opt_out'
				: keyword === 'help'
					? 'help'
					: keyword === 'start'
						? 'opt_in'
						: 'system',
		fromPhone,
		toPhone,
		body: mediaCount > 0 ? '[Multimedia message blocked]' : body || '[Empty message]',
		mediaCount,
		metadata: {
			provider: 'signalwire',
			payload: { MessageSid: payload.MessageSid || payload.message_sid || null }
		},
		validateOutbound: false
	});

	let autoReplySuppressed = false;
	if (reply) {
		const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const recentReplies = await supabase
			.from('sms_messages')
			.select('id', { count: 'exact', head: true })
			.eq('thread_id', thread.id)
			.eq('direction', 'outbound')
			.eq('provider_status', 'auto_reply')
			.gte('created_at', sinceIso);
		if (recentReplies.error) throw recentReplies.error;
		if ((recentReplies.count ?? 0) >= 5) {
			autoReplySuppressed = true;
			reply = '';
		} else {
			await recordSmsMessage(supabase, {
				threadId: thread.id,
				direction: 'outbound',
				kind,
				fromPhone: toPhone,
				toPhone: fromPhone,
				body: reply,
				providerStatus: 'auto_reply',
				metadata: { provider: 'signalwire', autoReply: true }
			});
		}
	}

	return {
		responseBody: reply ? twimlMessage(reply) : twimlEmpty(),
		thread,
		subscription,
		keyword,
		body,
		fromPhone,
		toPhone,
		autoReplySuppressed
	};
}

export async function loadSmsThreadsForUser(supabase, userId) {
	const id = asId(userId);
	if (!id) return [];
	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('admin')
		.eq('user_id', id)
		.maybeSingle();
	if (profileError) throw profileError;

	let query = supabase
		.from('sms_threads')
		.select('*')
		.order('last_message_at', { ascending: false })
		.limit(100);
	if (profile?.admin !== true) {
		const { data: memberships, error: membershipsError } = await supabase
			.from('sms_thread_members')
			.select('thread_id')
			.eq('user_id', id);
		if (membershipsError) throw membershipsError;
		const threadIds = uniqueIds(asArray(memberships).map((row) => row.thread_id));
		if (!threadIds.length) {
			query = query.eq('user_id', id);
		} else {
			query = query.or(`user_id.eq.${id},id.in.(${threadIds.join(',')})`);
		}
	}
	const { data: threads, error } = await query;
	if (error) throw error;
	const rows = asArray(threads);
	if (!rows.length) return [];
	const { data: messages, error: messagesError } = await supabase
		.from('sms_messages')
		.select('*')
		.in(
			'thread_id',
			rows.map((row) => row.id)
		)
		.order('created_at', { ascending: true });
	if (messagesError) throw messagesError;
	const byThread = new Map();
	for (const message of asArray(messages)) {
		if (!byThread.has(message.thread_id)) byThread.set(message.thread_id, []);
		byThread.get(message.thread_id).push(message);
	}
	return rows.map((thread) => ({ ...thread, messages: byThread.get(thread.id) ?? [] }));
}

export async function canManageSmsThread(supabase, userId, threadId) {
	const id = asId(userId);
	if (!id || !threadId) return false;
	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('admin')
		.eq('user_id', id)
		.maybeSingle();
	if (profileError) throw profileError;
	if (profile?.admin === true) return true;
	const { data: thread, error: threadError } = await supabase
		.from('sms_threads')
		.select(
			'id,activity_event_id,activity_occurrence_id,volunteer_event_id,volunteer_signup_id,bike_valet_reference'
		)
		.eq('id', threadId)
		.maybeSingle();
	if (threadError) throw threadError;
	if (!thread) return false;
	const managerIds = await getSmsManagerIds(supabase, {
		activityEventId: thread.activity_event_id,
		activityOccurrenceId: thread.activity_occurrence_id,
		volunteerEventId: thread.volunteer_event_id,
		volunteerSignupId: thread.volunteer_signup_id,
		bikeValetReference: thread.bike_valet_reference
	});
	return managerIds.includes(id);
}

export function formatSmsDateTime(value, timezone = 'UTC') {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	try {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: timezone || 'UTC',
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	} catch {
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}
}

export function buildSmsUrl(path) {
	const origin = getConfiguredPublicOrigin().replace(/\/$/, '');
	return `${origin}/${String(path || '').replace(/^\//, '')}`;
}
