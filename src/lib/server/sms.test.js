import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeE164PhoneNumber } from '../utils/phone.js';
import {
	buildSmsContextKey,
	classifySmsKeyword,
	smsSegmentCount,
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
	assert.equal(smsSegmentCount('é'.repeat(70)), 1);
	assert.equal(smsSegmentCount('é'.repeat(71)), 2);
});

test('SMS validation adds opt-out language and rejects external links', () => {
	const validated = validateSmsBody('Ride details: https://3fp.org/ride/example', {
		appendStopFooter: true
	});
	assert.match(validated.body, /Reply STOP to opt out/);
	assert.throws(() => validateSmsBody('Visit https://example.com'), /only include links/);
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
