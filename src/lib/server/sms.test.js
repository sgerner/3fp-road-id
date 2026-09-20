import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeE164PhoneNumber } from '../utils/phone.js';
import {
	buildSmsContextKey,
	classifySmsKeyword,
	shouldApplySmsStatus,
	smsSegmentCount,
	smsProviderMessageId,
	smsProviderStatus,
	subscriptionAllowsSms,
	validateSmsBody
} from '../utils/sms.js';

test('normalizes SMS phone numbers to E.164', () => {
	assert.equal(normalizeE164PhoneNumber('(480) 286-9717'), '+14802869717');
	assert.equal(normalizeE164PhoneNumber('+44 20 7946 0958'), '+442079460958');
	assert.equal(normalizeE164PhoneNumber('12345'), '');
});

test('counts GSM and Unicode SMS segments conservatively', () => {
	assert.equal(smsSegmentCount('a'.repeat(160)), 1);
	assert.equal(smsSegmentCount('a'.repeat(161)), 2);
	assert.equal(smsSegmentCount('é'.repeat(160)), 1);
	assert.equal(smsSegmentCount('é'.repeat(161)), 2);
	assert.equal(smsSegmentCount('^'.repeat(80)), 1);
	assert.equal(smsSegmentCount('^'.repeat(81)), 2);
	assert.equal(smsSegmentCount('🙂'.repeat(35)), 1);
	assert.equal(smsSegmentCount('🙂'.repeat(36)), 2);
});

test('SMS validation adds opt-out language and rejects external links', () => {
	const validated = validateSmsBody('Ride details: https://3fp.org/ride/example', {
		appendStopFooter: true
	});
	assert.match(validated.body, /Reply STOP to opt out/);
	assert.throws(() => validateSmsBody('Visit https://example.com'), /only include links/);
	assert.throws(() => validateSmsBody('Visit example.com'), /only include links/);
	assert.doesNotThrow(() => validateSmsBody('Visit updates.3fp.org/ride/example'));
	assert.throws(() => validateSmsBody('Visit fake3fp.org'), /only include links/);
});

test('subscription eligibility requires the current phone and enabled category', () => {
	const subscription = {
		status: 'active',
		phone_e164: '+14802869717',
		ride_reminders: true,
		volunteer_reminders: false,
		admin_messages: true,
		bike_valet_messages: false
	};
	assert.equal(
		subscriptionAllowsSms(subscription, {
			kind: 'ride_reminder',
			phoneE164: '+14802869717'
		}),
		true
	);
	assert.equal(
		subscriptionAllowsSms(subscription, {
			kind: 'volunteer_reminder',
			phoneE164: '+14802869717'
		}),
		false
	);
	assert.equal(
		subscriptionAllowsSms(subscription, {
			kind: 'admin',
			phoneE164: '+16025550123'
		}),
		false
	);
	assert.equal(
		subscriptionAllowsSms({ ...subscription, status: 'paused' }, { kind: 'admin' }),
		false
	);
});

test('delivery status updates cannot regress from terminal states', () => {
	assert.equal(shouldApplySmsStatus('queued', 'sent'), true);
	assert.equal(shouldApplySmsStatus('sent', 'delivered'), true);
	assert.equal(shouldApplySmsStatus('delivered', 'sent'), false);
	assert.equal(shouldApplySmsStatus('failed', 'sent'), false);
	assert.equal(shouldApplySmsStatus('failed', 'delivered'), true);
});

test('normalizes SignalWire REST and compatibility status payloads', () => {
	assert.equal(
		smsProviderMessageId({ id: 'rest-message-id', status: 'delivered' }),
		'rest-message-id'
	);
	assert.equal(smsProviderStatus({ id: 'rest-message-id', status: 'Delivered' }), 'delivered');
	assert.equal(
		smsProviderMessageId({ MessageSid: 'compat-message-id', MessageStatus: 'sent' }),
		'compat-message-id'
	);
	assert.equal(smsProviderStatus({ MessageStatus: 'SENT' }), 'sent');
});

test('classifies STOP, HELP, and START keywords', () => {
	assert.equal(classifySmsKeyword('STOP!!!'), 'stop');
	assert.equal(classifySmsKeyword('help'), 'help');
	assert.equal(classifySmsKeyword('START'), 'start');
	assert.equal(classifySmsKeyword('Can you help?'), null);
});

test('builds stable context keys for ride, volunteer, and bike valet threads', () => {
	assert.equal(
		buildSmsContextKey({ activityEventId: 'ride-1', activityOccurrenceId: 'occ-1' }),
		'ride:ride-1:occ-1'
	);
	assert.equal(
		buildSmsContextKey({ volunteerEventId: 'event-1', volunteerSignupId: 'signup-1' }),
		'volunteer:event-1:signup-1'
	);
	assert.equal(buildSmsContextKey({ bikeValetReference: 'claim-42' }), 'bike-valet:claim-42');
});
