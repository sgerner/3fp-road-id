import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
	SMS_INLINE_DEFAULT_CONSENT_TEXT,
	VOLUNTEER_MANAGE_SMS_CATEGORIES,
	VOLUNTEER_SIGNUP_SMS_CATEGORIES,
	createSingleFlightPreferencesLoader,
	emptySmsPreferences,
	getInlineSmsMode,
	getSelectedNewCategoryKeys,
	resolveInlineConsentSource,
	saveInlineSmsPreferences,
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
		{ ...emptySmsPreferences(), status: 'unsubscribed', volunteer_reminders: true },
		VOLUNTEER_SIGNUP_SMS_CATEGORIES
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
			volunteer_reminders: true,
			admin_messages: false
		},
		VOLUNTEER_SIGNUP_SMS_CATEGORIES
	);
	assert.equal(partialActive.mode, 'editable');
	assert.deepEqual(
		partialActive.availableCategories.map((item) => item.key),
		['admin_messages']
	);
	assert.deepEqual(
		partialActive.activeCategories.map((item) => item.key),
		['volunteer_reminders']
	);

	const allActive = getInlineSmsMode(
		{
			...emptySmsPreferences(),
			status: 'active',
			phone: '+14805550123',
			volunteer_reminders: true,
			admin_messages: true
		},
		VOLUNTEER_SIGNUP_SMS_CATEGORIES
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
		selectedKeys: ['volunteer_reminders'],
		phone: '(480) 555-0123',
		consentChecked: false
	});
	assert.equal(missingConsent.ok, false);
	assert.equal(missingConsent.phoneError, '');
	assert.ok(missingConsent.consentError);

	const valid = validateInlineSmsInput({
		selectedKeys: ['volunteer_reminders', 'admin_messages'],
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

test('keeps SMS preferences caches isolated by signed-in user', async () => {
	let fetchCalls = 0;
	const loader = createSingleFlightPreferencesLoader(async (url, init) => {
		assert.equal(url, '/api/sms/preferences');
		assert.equal(init, undefined);
		fetchCalls += 1;
		return new Response(
			JSON.stringify({
				preferences: {
					phone: fetchCalls === 1 ? '+14805550101' : '+14805550102',
					status: 'active',
					admin_messages: true
				},
				consentText: SMS_INLINE_DEFAULT_CONSENT_TEXT
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	});

	const userA = await loader.load({ cacheKey: 'user-a' });
	const userB = await loader.load({ cacheKey: 'user-b' });
	const cachedUserA = await loader.load({ cacheKey: 'user-a' });

	assert.equal(userA.preferences.phone, '+14805550101');
	assert.equal(userB.preferences.phone, '+14805550102');
	assert.equal(cachedUserA.preferences.phone, '+14805550101');
	assert.equal(fetchCalls, 2);
	assert.equal(loader.getCached({ cacheKey: 'user-b' })?.preferences.phone, '+14805550102');
});

test('flags 400 and 409 phone errors and inactive categories with retry messages on volunteer SMS saves', async () => {
	assert.equal(
		resolveInlineConsentSource('volunteer-signup', ['volunteer_reminders', 'admin_messages']),
		'volunteer-signup'
	);
	assert.equal(
		resolveInlineConsentSource('volunteer-signup', ['admin_messages']),
		'volunteer-signup-admin-messages'
	);
	assert.equal(
		resolveInlineConsentSource('volunteer-management', ['admin_messages']),
		'volunteer-management'
	);
	assert.equal(resolveInlineConsentSource('unknown-context', ['admin_messages']), 'profile');

	const conflictResult = await saveInlineSmsPreferences({
		phone: '(480) 555-0123',
		selectedKeys: ['admin_messages'],
		source: resolveInlineConsentSource('volunteer-signup', ['admin_messages']),
		registrationLabel: 'shift signup',
		fetchImpl: async (url, init) => {
			assert.equal(url, '/api/sms/preferences');
			assert.equal(init?.method, 'PUT');
			const parsed = JSON.parse(String(init?.body ?? '{}'));
			assert.equal(parsed.source, 'volunteer-signup-admin-messages');
			assert.equal(parsed.sms_consent, true);
			assert.equal(parsed.admin_messages, true);
			return new Response(
				JSON.stringify({
					error: 'That mobile number is already associated with another account.'
				}),
				{ status: 409, headers: { 'Content-Type': 'application/json' } }
			);
		}
	});

	assert.equal(conflictResult.ok, false);
	assert.equal(conflictResult.status, 409);
	assert.equal(conflictResult.phoneInvalid, true);
	assert.match(conflictResult.retryMessage, /Your shift signup is saved/i);
	assert.match(conflictResult.retryMessage, /retry SMS signup/i);

	const invalidPhoneResult = await saveInlineSmsPreferences({
		phone: '123',
		selectedKeys: ['volunteer_reminders'],
		source: resolveInlineConsentSource('volunteer-signup', ['volunteer_reminders']),
		registrationLabel: 'shift signup',
		fetchImpl: async (_url, init) => {
			const parsed = JSON.parse(String(init?.body ?? '{}'));
			assert.equal(parsed.source, 'volunteer-signup');
			return new Response(JSON.stringify({ error: 'Enter a valid mobile number.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	});
	assert.equal(invalidPhoneResult.ok, false);
	assert.equal(invalidPhoneResult.status, 400);
	assert.equal(invalidPhoneResult.phoneInvalid, true);
	assert.match(invalidPhoneResult.retryMessage, /Your shift signup is saved/i);

	const inactiveResult = await saveInlineSmsPreferences({
		phone: '(480) 555-0155',
		selectedKeys: ['volunteer_reminders'],
		source: resolveInlineConsentSource('volunteer-signup', ['volunteer_reminders']),
		registrationLabel: 'shift signup',
		fetchImpl: async () =>
			new Response(
				JSON.stringify({
					preferences: {
						phone: '+14805550155',
						status: 'paused',
						volunteer_reminders: false
					},
					consentText: SMS_INLINE_DEFAULT_CONSENT_TEXT
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
	});
	assert.equal(inactiveResult.ok, false);
	assert.equal(inactiveResult.status, 200);
	assert.equal(inactiveResult.phoneInvalid, false);
	assert.match(inactiveResult.retryMessage, /Your shift signup is saved/i);
	assert.match(inactiveResult.retryMessage, /retry SMS signup/i);

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
