import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import {
	SMS_CONSENT_TEXT,
	SMS_CONSENT_VERSION,
	enqueueSms,
	getSmsServiceClient
} from '$lib/server/sms';

function hashVerificationCode(code) {
	return createHash('sha256').update(String(code)).digest('hex');
}

function matches(code, expectedHash) {
	const actual = Buffer.from(hashVerificationCode(code), 'hex');
	const expected = Buffer.from(String(expectedHash || ''), 'hex');
	return (
		actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected)
	);
}

function preferenceShape(subscription) {
	return {
		phone: subscription?.phone_e164 || '',
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

export async function POST(event) {
	const { user } = await getActivityClient(event.cookies);
	if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });
	const limited = enforceRateLimit(event, { name: 'sms-verification', limit: 10, key: user.id });
	if (limited) return limited;

	const parsed = await readJsonBody(event.request, { maxBytes: 8 * 1024 });
	if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
	const code = String(parsed.value?.code || '').trim();
	if (!/^\d{6}$/.test(code))
		return json({ error: 'Enter the six-digit verification code.' }, { status: 400 });

	const service = getSmsServiceClient();
	if (!service) return json({ error: 'SMS service is temporarily unavailable.' }, { status: 503 });

	try {
		const { data: subscription, error: subscriptionError } = await service
			.from('sms_subscriptions')
			.select('*')
			.eq('user_id', user.id)
			.maybeSingle();
		if (subscriptionError) throw subscriptionError;
		if (!subscription || subscription.status === 'blocked') {
			return json({ error: 'This SMS subscription cannot be verified.' }, { status: 409 });
		}
		if (!subscription.verification_code_hash || !subscription.verification_expires_at) {
			return json({ error: 'Request a new verification code from your profile.' }, { status: 409 });
		}
		if (Date.parse(subscription.verification_expires_at) <= Date.now()) {
			return json(
				{ error: 'That verification code has expired. Request a new code.' },
				{ status: 410 }
			);
		}
		if ((subscription.verification_attempts || 0) >= 5) {
			return json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 });
		}
		if (!matches(code, subscription.verification_code_hash)) {
			await service
				.from('sms_subscriptions')
				.update({
					verification_attempts: (subscription.verification_attempts || 0) + 1,
					updated_at: new Date().toISOString()
				})
				.eq('id', subscription.id);
			return json({ error: 'That verification code is incorrect.' }, { status: 400 });
		}

		const now = new Date().toISOString();
		const update = await service
			.from('sms_subscriptions')
			.update({
				status: 'active',
				phone_verified_at: now,
				verification_code_hash: null,
				verification_expires_at: null,
				verification_attempts: 0,
				opted_in_at: now,
				opted_out_at: null,
				consent_version: SMS_CONSENT_VERSION,
				consent_text: SMS_CONSENT_TEXT,
				consent_source: 'profile-verification',
				updated_at: now
			})
			.eq('id', subscription.id)
			.select('*')
			.single();
		if (update.error) throw update.error;

		const consentEvent = await service.from('sms_consent_events').insert({
			subscription_id: subscription.id,
			user_id: user.id,
			phone_e164: subscription.phone_e164,
			event_type: 'web_opt_in',
			status: 'active',
			consent_version: SMS_CONSENT_VERSION,
			consent_text: SMS_CONSENT_TEXT,
			source: 'profile-verification'
		});
		if (consentEvent.error) throw consentEvent.error;

		const welcome = await enqueueSms({
			supabase: service,
			userId: user.id,
			phoneE164: subscription.phone_e164,
			kind: 'opt_in',
			body: '3FP: You are subscribed to selected updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.',
			dedupeKey: `sms-opt-in:${user.id}:${subscription.phone_e164}:${SMS_CONSENT_VERSION}`,
			context: { subject: 'SMS subscription' },
			createdByUserId: user.id,
			requireSubscription: true
		});

		return json({
			preferences: preferenceShape(update.data),
			consentText: SMS_CONSENT_TEXT,
			consentVersion: SMS_CONSENT_VERSION,
			welcomeQueued: welcome.queued === true
		});
	} catch (error) {
		console.error('Unable to verify SMS phone', error);
		return json(
			{ error: error?.message || 'Unable to verify this phone number.' },
			{ status: 500 }
		);
	}
}
