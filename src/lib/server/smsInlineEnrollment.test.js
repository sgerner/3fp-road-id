import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
	RIDE_RSVP_SMS_CATEGORIES,
	SMS_INLINE_DEFAULT_CONSENT_TEXT,
	VOLUNTEER_MANAGE_SMS_CATEGORIES,
	VOLUNTEER_SIGNUP_SMS_CATEGORIES,
	createSingleFlightPreferencesLoader,
	emptySmsPreferences,
	getInlineSmsMode,
	getSelectedNewCategoryKeys,
	resolveInlineConsentSource,
	saveInlineSmsPreferences,
	submitRegistrationThenSms,
	validateInlineSmsInput
} from '../sms/inlineEnrollment.js';

test('inline default consent text matches SMS_CONSENT_TEXT verbatim and avoids repeated disclosures', () => {
	const serverSmsSource = readFileSync(resolve('src/lib/server/sms.js'), 'utf8');
	const match = serverSmsSource.match(/export const SMS_CONSENT_TEXT =\s*\n?\s*'([^']+)';/);
	assert.ok(match, 'expected SMS_CONSENT_TEXT constant in src/lib/server/sms.js');
	assert.equal(SMS_INLINE_DEFAULT_CONSENT_TEXT, match[1]);

	const inlineComponentSource = readFileSync(
		resolve('src/lib/components/sms/SmsInlineSection.svelte'),
		'utf8'
	);
	assert.equal(inlineComponentSource.includes('<dialog'), false);
	assert.equal(
		existsSync(resolve('src/lib/components/sms/SmsContextOptIn.svelte')),
		false,
		'standalone modal SmsContextOptIn widget should be removed'
	);

	const combinedRenderedDisclosure = `${SMS_INLINE_DEFAULT_CONSENT_TEXT} SMS is optional. See our Terms and Privacy Policy.`;
	assert.equal((combinedRenderedDisclosure.match(/Message frequency varies\./gi) || []).length, 1);
	assert.equal(
		(combinedRenderedDisclosure.match(/Message and data rates may apply\./gi) || []).length,
		1
	);
	assert.equal((combinedRenderedDisclosure.match(/\bSTOP\b/g) || []).length, 1);
	assert.equal((combinedRenderedDisclosure.match(/\bSTART\b/g) || []).length, 1);
	assert.equal((combinedRenderedDisclosure.match(/\bHELP\b/g) || []).length, 1);
});

test('hides already active SMS categories and surfaces read-only compliance states', () => {
	const unsubscribed = getInlineSmsMode(
		{ ...emptySmsPreferences(), status: 'unsubscribed', ride_reminders: true },
		RIDE_RSVP_SMS_CATEGORIES
	);
	assert.equal(unsubscribed.mode, 'unsubscribed');
	assert.deepEqual(unsubscribed.availableCategories, []);

	const blocked = getInlineSmsMode(
		{ ...emptySmsPreferences(), status: 'blocked' },
		VOLUNTEER_SIGNUP_SMS_CATEGORIES
	);
	assert.equal(blocked.mode, 'blocked');
	assert.deepEqual(blocked.availableCategories, []);

	const partialActive = getInlineSmsMode(
		{
			...emptySmsPreferences(),
			status: 'active',
			phone: '+14805550123',
			ride_reminders: true,
			admin_messages: false
		},
		RIDE_RSVP_SMS_CATEGORIES
	);
	assert.equal(partialActive.mode, 'editable');
	assert.deepEqual(
		partialActive.availableCategories.map((item) => item.key),
		['admin_messages']
	);
	assert.deepEqual(
		partialActive.activeCategories.map((item) => item.key),
		['ride_reminders']
	);

	const allActive = getInlineSmsMode(
		{
			...emptySmsPreferences(),
			status: 'active',
			phone: '+14805550123',
			ride_reminders: true,
			admin_messages: true
		},
		RIDE_RSVP_SMS_CATEGORIES
	);
	assert.equal(allActive.mode, 'all_active');
	assert.deepEqual(allActive.availableCategories, []);

	const pausedWithSavedFlags = getInlineSmsMode(
		{
			...emptySmsPreferences(),
			status: 'paused',
			volunteer_reminders: true,
			admin_messages: true
		},
		VOLUNTEER_SIGNUP_SMS_CATEGORIES
	);
	assert.equal(pausedWithSavedFlags.mode, 'editable');
	assert.equal(pausedWithSavedFlags.availableCategories.length, 2);
});

test('requires mobile phone and explicit consent only when new SMS categories are checked', () => {
	assert.deepEqual(
		validateInlineSmsInput({
			selectedKeys: [],
			phone: '',
			consentChecked: false
		}),
		{ ok: true, phoneError: '', consentError: '', error: '' }
	);

	const missingBoth = validateInlineSmsInput({
		selectedKeys: ['volunteer_reminders'],
		phone: '   ',
		consentChecked: false
	});
	assert.equal(missingBoth.ok, false);
	assert.ok(missingBoth.phoneError);
	assert.ok(missingBoth.consentError);

	const missingConsent = validateInlineSmsInput({
		selectedKeys: ['ride_reminders'],
		phone: '(480) 555-0123',
		consentChecked: false
	});
	assert.equal(missingConsent.ok, false);
	assert.equal(missingConsent.phoneError, '');
	assert.ok(missingConsent.consentError);

	const valid = validateInlineSmsInput({
		selectedKeys: ['ride_reminders', 'admin_messages'],
		phone: '(480) 555-0123',
		consentChecked: true
	});
	assert.equal(valid.ok, true);
});

test('deduplicates concurrent and repeated SMS preferences reads to one GET request', async () => {
	let fetchCalls = 0;
	const loader = createSingleFlightPreferencesLoader(async (url) => {
		assert.equal(url, '/api/sms/preferences');
		fetchCalls += 1;
		await new Promise((r) => setTimeout(r, 10));
		return new Response(
			JSON.stringify({
				preferences: {
					phone: '+14805550199',
					status: 'active',
					admin_messages: true
				},
				consentText: SMS_INLINE_DEFAULT_CONSENT_TEXT
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	});

	const [first, second] = await Promise.all([loader.load(), loader.load()]);
	const third = await loader.load();
	assert.equal(fetchCalls, 1);
	assert.equal(first.preferences.phone, '+14805550199');
	assert.equal(second.preferences.admin_messages, true);
	assert.equal(third.preferences.status, 'active');
});

test('saves registration first and keeps registration saved with retry message on 400 or 409 SMS errors', async () => {
	const steps = [];
	const conflictFetch = async (url, init) => {
		steps.push(`sms:${init?.method}:${url}`);
		return new Response(
			JSON.stringify({ error: 'That mobile number is already associated with another account.' }),
			{ status: 409, headers: { 'Content-Type': 'application/json' } }
		);
	};

	const conflictOutcome = await submitRegistrationThenSms({
		selectedKeys: ['ride_reminders', 'admin_messages'],
		phone: '(480) 555-0123',
		consentChecked: true,
		source: resolveInlineConsentSource('ride-rsvp', ['ride_reminders', 'admin_messages']),
		registrationLabel: 'RSVP',
		fetchImpl: conflictFetch,
		register: async () => {
			steps.push('register:rsvp');
			return { ok: true, id: 'rsvp-1' };
		}
	});

	assert.deepEqual(steps, ['register:rsvp', 'sms:PUT:/api/sms/preferences']);
	assert.equal(conflictOutcome.registrationSaved, true);
	assert.equal(conflictOutcome.smsSaved, false);
	assert.equal(conflictOutcome.smsRetryNeeded, true);
	assert.equal(conflictOutcome.smsResult.status, 409);
	assert.equal(conflictOutcome.smsResult.phoneInvalid, true);
	assert.match(conflictOutcome.smsResult.retryMessage, /Your RSVP is saved/i);
	assert.match(conflictOutcome.smsResult.retryMessage, /retry SMS signup/i);

	const invalidPhoneResult = await saveInlineSmsPreferences({
		phone: '123',
		selectedKeys: ['volunteer_reminders'],
		source: resolveInlineConsentSource('volunteer-signup', ['volunteer_reminders']),
		registrationLabel: 'shift signup',
		fetchImpl: async () =>
			new Response(JSON.stringify({ error: 'Enter a valid mobile number.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
	});
	assert.equal(invalidPhoneResult.ok, false);
	assert.equal(invalidPhoneResult.status, 400);
	assert.equal(invalidPhoneResult.phoneInvalid, true);
	assert.match(invalidPhoneResult.retryMessage, /Your shift signup is saved/i);

	const retrySuccess = await saveInlineSmsPreferences({
		phone: '(480) 555-0188',
		selectedKeys: getSelectedNewCategoryKeys(VOLUNTEER_MANAGE_SMS_CATEGORIES, {
			admin_messages: true
		}),
		source: resolveInlineConsentSource('volunteer-management', ['admin_messages']),
		fetchImpl: async (_url, init) => {
			const parsed = JSON.parse(init.body);
			assert.equal(parsed.source, 'volunteer-management');
			assert.equal(parsed.sms_consent, true);
			assert.equal(parsed.admin_messages, true);
			return new Response(
				JSON.stringify({
					preferences: {
						phone: '+14805550188',
						status: 'active',
						admin_messages: true
					},
					consentText: SMS_INLINE_DEFAULT_CONSENT_TEXT
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}
	});
	assert.equal(retrySuccess.ok, true);
	assert.equal(retrySuccess.preferences.phone, '+14805550188');
});

test('volunteer management header has no SMS controls and mounts inline SMS in communications and hosts', () => {
	const managePage = readFileSync(
		resolve('src/routes/volunteer/[slug]/manage/+page.svelte'),
		'utf8'
	);
	const [, afterStickyStart] = managePage.split('<!-- ── Sticky management header');
	const [stickyHeaderMarkup, bodyPart] = (afterStickyStart || '').split('<!-- ── Section content');
	assert.ok(stickyHeaderMarkup && bodyPart);
	assert.equal(stickyHeaderMarkup.includes('<SmsInlineSection'), false);
	assert.equal(stickyHeaderMarkup.includes('<SmsContextOptIn'), false);
	assert.equal(bodyPart.includes('id="section-communications"'), true);
	assert.equal(bodyPart.includes('id="section-hosts"'), true);
	assert.equal((bodyPart.match(/<SmsInlineSection/g) || []).length, 2);

	const ridePage = readFileSync(resolve('src/routes/ride/[slug]/+page.svelte'), 'utf8');
	const volunteerPage = readFileSync(resolve('src/routes/volunteer/[slug]/+page.svelte'), 'utf8');
	assert.equal(ridePage.includes('SmsContextOptIn'), false);
	assert.equal(ridePage.includes('<dialog'), false);
	assert.equal(volunteerPage.includes('SmsContextOptIn'), false);
	assert.equal(volunteerPage.includes('<dialog'), false);
});
