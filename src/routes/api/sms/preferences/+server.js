import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import {
	SMS_CONSENT_TEXT,
	SMS_CONSENT_VERSION,
	cancelSmsOutboxForPhone,
	cancelSmsVerificationOutboxForPhone,
	closeSmsThreadsForPhone,
	getSmsServiceClient,
	enqueueSms,
	normalizeSmsPhone
} from '$lib/server/sms';

const CATEGORY_KEYS = [
	'ride_reminders',
	'volunteer_reminders',
	'admin_messages',
	'bike_valet_messages'
];
const CONSENT_SOURCES = new Set([
	'profile',
	'ride-rsvp',
	'ride-rsvp-admin-messages',
	'volunteer-signup',
	'volunteer-signup-admin-messages',
	'volunteer-management'
]);

function asBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
	return fallback;
}

function preferenceShape(subscription, phone) {
	return {
		phone: phone === undefined ? subscription?.phone_e164 || '' : phone,
		status: subscription?.status || 'paused',
		ride_reminders: subscription?.ride_reminders === true,
		volunteer_reminders: subscription?.volunteer_reminders === true,
		admin_messages: subscription?.admin_messages === true,
		bike_valet_messages: subscription?.bike_valet_messages === true,
		consent_version: subscription?.consent_version || null,
		opted_in_at: subscription?.opted_in_at || null,
		opted_out_at: subscription?.opted_out_at || null
	};
}

async function loadProfileAndSubscription(supabase, userId) {
	const [profileResult, subscriptionResult] = await Promise.all([
		supabase.from('profiles').select('phone').eq('user_id', userId).maybeSingle(),
		supabase.from('sms_subscriptions').select('*').eq('user_id', userId).maybeSingle()
	]);
	if (profileResult.error) throw profileResult.error;
	if (subscriptionResult.error) throw subscriptionResult.error;
	return {
		profile: profileResult.data,
		subscription: subscriptionResult.data
	};
}

export async function GET({ cookies }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });

	try {
		const { profile, subscription } = await loadProfileAndSubscription(supabase, user.id);
		return json({
			preferences: preferenceShape(subscription, normalizeSmsPhone(profile?.phone || '')),
			consentText: SMS_CONSENT_TEXT,
			consentVersion: SMS_CONSENT_VERSION
		});
	} catch (error) {
		console.error('Unable to load SMS preferences', error);
		return json({ error: 'Unable to load SMS preferences.' }, { status: 500 });
	}
}

export async function PUT(event) {
	const { cookies, request } = event;
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });

	const limited = enforceRateLimit(event, { name: 'sms-preferences', limit: 20, key: user.id });
	if (limited) return limited;

	const parsed = await readJsonBody(request, { maxBytes: 32 * 1024 });
	if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
	const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};

	try {
		const { profile, subscription: existing } = await loadProfileAndSubscription(supabase, user.id);
		const service = getSmsServiceClient();
		if (!service)
			return json({ error: 'SMS service is temporarily unavailable.' }, { status: 503 });
		const profileWriteClient = createServiceSupabaseClient();
		if (!profileWriteClient)
			return json({ error: 'Profile service is temporarily unavailable.' }, { status: 503 });
		const phoneProvided = body.phone !== undefined;
		const submittedPhone = !phoneProvided
			? normalizeSmsPhone(profile?.phone || existing?.phone_e164 || '')
			: normalizeSmsPhone(body.phone);
		const rawSubmittedPhone = phoneProvided ? String(body.phone ?? '').trim() : '';
		if (rawSubmittedPhone && !submittedPhone) {
			return json({ error: 'Enter a valid mobile number.' }, { status: 400 });
		}
		const hasCategory = CATEGORY_KEYS.some((key) => asBoolean(body[key], existing?.[key] === true));
		const smsConsent = asBoolean(
			body.sms_consent ?? body.smsConsent,
			existing?.status === 'active' && hasCategory
		);

		if ((hasCategory || smsConsent) && !submittedPhone) {
			return json(
				{ error: 'Enter a valid mobile number before enabling SMS updates.' },
				{ status: 400 }
			);
		}

		const categories = Object.fromEntries(
			CATEGORY_KEYS.map((key) => [key, asBoolean(body[key], existing?.[key] === true)])
		);
		const requestedSource = String(body.source || 'profile')
			.trim()
			.toLowerCase();
		const consentSource = CONSENT_SOURCES.has(requestedSource) ? requestedSource : 'profile';
		const activeRequested = Boolean(
			submittedPhone && smsConsent && Object.values(categories).some(Boolean)
		);
		if (phoneProvided && !rawSubmittedPhone && existing) {
			const now = new Date().toISOString();
			await cancelSmsOutboxForPhone(
				service,
				existing.phone_e164,
				'Cancelled because the SMS phone number was removed.'
			);
			await closeSmsThreadsForPhone(service, user.id, existing.phone_e164);
			const consentEvent = await service.from('sms_consent_events').insert({
				subscription_id: existing.id,
				user_id: user.id,
				phone_e164: existing.phone_e164,
				event_type: 'web_pause',
				status: 'paused',
				consent_version: existing.consent_version || SMS_CONSENT_VERSION,
				consent_text: existing.consent_text || SMS_CONSENT_TEXT,
				source: consentSource,
				created_at: now
			});
			if (consentEvent.error) throw consentEvent.error;
			const deletion = await service.from('sms_subscriptions').delete().eq('id', existing.id);
			if (deletion.error) throw deletion.error;
			const profileUpdate = await profileWriteClient
				.from('profiles')
				.update({ phone: null, updated_at: now })
				.eq('user_id', user.id);
			if (profileUpdate.error) throw profileUpdate.error;
			return json({
				preferences: preferenceShape(null, ''),
				consentText: SMS_CONSENT_TEXT,
				consentVersion: SMS_CONSENT_VERSION,
				welcomeQueued: false,
				verificationRequired: false,
				verificationQueued: false,
				verificationExpiresAt: null
			});
		}
		const phoneForSubscription = submittedPhone || existing?.phone_e164 || '';

		if (phoneForSubscription) {
			if (submittedPhone) {
				const phoneOwner = await service
					.from('sms_subscriptions')
					.select('user_id')
					.eq('phone_e164', submittedPhone)
					.neq('user_id', user.id)
					.limit(1)
					.maybeSingle();
				if (phoneOwner.error) throw phoneOwner.error;
				if (phoneOwner.data) {
					return json(
						{ error: 'That mobile number is already associated with another account.' },
						{ status: 409 }
					);
				}
			}
			const now = new Date().toISOString();
			const nextStatus =
				existing?.status === 'blocked' ? 'blocked' : activeRequested ? 'active' : 'paused';
			const subscriptionPayload = {
				user_id: user.id,
				phone_e164: phoneForSubscription,
				status: nextStatus,
				...categories,
				consent_version: activeRequested
					? SMS_CONSENT_VERSION
					: existing?.consent_version || SMS_CONSENT_VERSION,
				consent_text: activeRequested
					? SMS_CONSENT_TEXT
					: existing?.consent_text || SMS_CONSENT_TEXT,
				consent_source: activeRequested ? consentSource : existing?.consent_source || 'profile',
				phone_verified_at: null,
				verification_code_hash: null,
				verification_expires_at: null,
				verification_attempts: 0,
				verification_last_sent_at: null,
				opted_in_at:
					activeRequested && nextStatus === 'active'
						? !existing ||
							existing.status !== 'active' ||
							existing.phone_e164 !== phoneForSubscription
							? now
							: existing.opted_in_at || now
						: existing?.opted_in_at || null,
				opted_out_at: activeRequested ? null : existing?.opted_out_at || now,
				updated_at: now
			};
			const subscriptionResult = await service
				.from('sms_subscriptions')
				.upsert(subscriptionPayload, { onConflict: 'user_id' })
				.select('*')
				.single();
			if (subscriptionResult.error) throw subscriptionResult.error;

			const changed =
				!existing ||
				existing.status !== nextStatus ||
				existing.phone_e164 !== phoneForSubscription ||
				CATEGORY_KEYS.some((key) => existing[key] !== categories[key]);
			if (changed) {
				await service.from('sms_consent_events').insert({
					subscription_id: subscriptionResult.data.id,
					user_id: user.id,
					phone_e164: phoneForSubscription,
					event_type: activeRequested ? 'web_opt_in' : 'web_pause',
					status: nextStatus,
					consent_version: SMS_CONSENT_VERSION,
					consent_text: SMS_CONSENT_TEXT,
					source: activeRequested ? consentSource : existing?.consent_source || 'profile'
				});
			}

			if (activeRequested) {
				await cancelSmsVerificationOutboxForPhone(service, phoneForSubscription);
			}
			if (existing?.phone_e164 && existing.phone_e164 !== phoneForSubscription) {
				await cancelSmsOutboxForPhone(
					service,
					existing.phone_e164,
					'Cancelled because the SMS phone number changed.'
				);
				await closeSmsThreadsForPhone(service, user.id, existing.phone_e164);
			}
			if (!activeRequested) {
				await cancelSmsOutboxForPhone(
					service,
					phoneForSubscription,
					'Cancelled from SMS preferences.'
				);
			}

			let welcomeQueued = false;
			if (
				activeRequested &&
				nextStatus === 'active' &&
				(!existing || existing.status !== 'active' || existing.phone_e164 !== phoneForSubscription)
			) {
				const result = await enqueueSms({
					supabase: service,
					userId: user.id,
					phoneE164: phoneForSubscription,
					kind: 'opt_in',
					body: '3FP: You are subscribed to selected updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.',
					dedupeKey: `sms-opt-in:${user.id}:${phoneForSubscription}:${SMS_CONSENT_VERSION}`,
					context: { subject: 'SMS subscription' },
					createdByUserId: user.id,
					requireSubscription: true
				});
				welcomeQueued = result.queued === true;
			}

			const profileUpdate = await profileWriteClient
				.from('profiles')
				.update({ phone: submittedPhone || null, updated_at: new Date().toISOString() })
				.eq('user_id', user.id);
			if (profileUpdate.error) throw profileUpdate.error;

			return json({
				preferences: preferenceShape(
					subscriptionResult.data,
					phoneProvided ? submittedPhone : undefined
				),
				consentText: SMS_CONSENT_TEXT,
				consentVersion: SMS_CONSENT_VERSION,
				welcomeQueued,
				verificationRequired: false,
				verificationQueued: false,
				verificationExpiresAt: null
			});
		}

		const profileUpdate = await profileWriteClient
			.from('profiles')
			.update({ phone: null, updated_at: new Date().toISOString() })
			.eq('user_id', user.id);
		if (profileUpdate.error) throw profileUpdate.error;
		return json({
			preferences: preferenceShape(existing, ''),
			consentText: SMS_CONSENT_TEXT,
			consentVersion: SMS_CONSENT_VERSION,
			welcomeQueued: false
		});
	} catch (error) {
		console.error('Unable to save SMS preferences', error);
		if (error?.code === '23505') {
			return json(
				{ error: 'That mobile number is already associated with another account.' },
				{ status: 409 }
			);
		}
		return json({ error: 'Unable to save SMS preferences.' }, { status: 500 });
	}
}
