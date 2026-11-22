import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { normalizeE164PhoneNumber } from '../utils/phone.js';
import {
	buildSmsContextKey,
	classifySmsKeyword,
	measureSmsBudget,
	resolveSmsThreadReplyKind,
	shouldApplySmsStatus,
	smsSegmentCount,
	smsProviderMessageId,
	smsProviderStatus,
	subscriptionAllowsSms,
	validateSmsBody
} from '../utils/sms.js';

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/env/private' || specifier === '$app/env/public') {
			return {
				shortCircuit: true,
				url: 'data:text/javascript,export const PUBLIC_URL_BASE = "https://3fp.org"; export const PUBLIC_SUPABASE_URL = "https://example.supabase.co"; export const PUBLIC_SUPABASE_ANON_KEY = "anon";'
			};
		}
		if (specifier.startsWith('#lib/') && !path.extname(specifier)) {
			return nextResolve(
				pathToFileURL(path.resolve('src/lib', `${specifier.slice(5)}.js`)).href,
				context
			);
		}
		return nextResolve(specifier, context);
	}
});

const { hasSmsInboxAccess } = await import('./sms.js');

function createSmsAccessSupabaseStub(tables = {}) {
	return {
		from(table) {
			const filters = [];
			const evaluateRows = () => {
				const source = Array.isArray(tables[table]) ? tables[table] : [];
				return source.filter((row) =>
					filters.every((filter) => {
						if (filter.type === 'eq') return row?.[filter.column] === filter.value;
						if (filter.type === 'in') return filter.values.includes(row?.[filter.column]);
						return true;
					})
				);
			};

			const builder = {
				select() {
					return builder;
				},
				eq(column, value) {
					filters.push({ type: 'eq', column, value });
					return builder;
				},
				in(column, values) {
					filters.push({ type: 'in', column, values });
					return builder;
				},
				limit(count) {
					return Promise.resolve({
						data: evaluateRows().slice(0, count),
						error: null
					});
				},
				maybeSingle() {
					const rows = evaluateRows();
					return Promise.resolve({
						data: rows[0] ?? null,
						error: null
					});
				}
			};
			return builder;
		}
	};
}

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

test('derives SMS reply kind from thread bike valet reference', () => {
	assert.equal(resolveSmsThreadReplyKind(null), 'admin');
	assert.equal(resolveSmsThreadReplyKind({ activity_event_id: 'ride-1' }), 'admin');
	assert.equal(resolveSmsThreadReplyKind({ volunteer_event_id: 'event-1' }), 'admin');
	assert.equal(resolveSmsThreadReplyKind({ bike_valet_reference: '   ' }), 'admin');
	assert.equal(resolveSmsThreadReplyKind({ bike_valet_reference: 'claim-42' }), 'bike_valet');
	assert.equal(resolveSmsThreadReplyKind({ bikeValetReference: 'claim-99' }), 'bike_valet');
});

test('measures live GSM-7 and UCS-2 SMS budgets including the STOP footer', () => {
	const emptyBudget = measureSmsBudget('');
	assert.equal(emptyBudget.encoding, 'GSM-7');
	assert.equal(emptyBudget.footerUnits, 23);
	assert.equal(emptyBudget.maxMessageUnits, 436);
	assert.equal(emptyBudget.remainingUnits, 436);
	assert.equal(emptyBudget.segments, 0);
	assert.equal(emptyBudget.overLimit, false);

	const maxGsm = measureSmsBudget('a'.repeat(436));
	assert.equal(maxGsm.encoding, 'GSM-7');
	assert.equal(maxGsm.remainingUnits, 0);
	assert.equal(maxGsm.segments, 3);
	assert.equal(maxGsm.overLimit, false);
	assert.doesNotThrow(() => validateSmsBody('a'.repeat(436), { appendStopFooter: true }));

	const overGsm = measureSmsBudget('a'.repeat(437));
	assert.equal(overGsm.encoding, 'GSM-7');
	assert.equal(overGsm.remainingUnits, -1);
	assert.equal(overGsm.segments, 4);
	assert.equal(overGsm.overLimit, true);
	assert.throws(() => validateSmsBody('a'.repeat(437), { appendStopFooter: true }), /3 segments/);

	const manualStop = measureSmsBudget(`${'a'.repeat(437)} Reply STOP`);
	assert.equal(manualStop.footerIncluded, false);
	assert.equal(manualStop.footerUnits, 0);
	assert.equal(manualStop.maxMessageUnits, 459);
	assert.equal(manualStop.remainingUnits, 11);
	assert.equal(manualStop.segments, 3);
	assert.equal(manualStop.overLimit, false);

	const emojiBudget = measureSmsBudget('🚲');
	assert.equal(emojiBudget.encoding, 'UCS-2');
	assert.equal(emojiBudget.messageUnits, 2);
	assert.equal(emojiBudget.maxMessageUnits, 178);
	assert.equal(emojiBudget.remainingUnits, 176);
	assert.equal(emojiBudget.segments, 1);
	assert.equal(emojiBudget.overLimit, false);

	const maxUcs2 = measureSmsBudget(`—${'a'.repeat(177)}`);
	assert.equal(maxUcs2.encoding, 'UCS-2');
	assert.equal(maxUcs2.remainingUnits, 0);
	assert.equal(maxUcs2.segments, 3);
	assert.equal(maxUcs2.overLimit, false);
	assert.doesNotThrow(() => validateSmsBody(`—${'a'.repeat(177)}`, { appendStopFooter: true }));

	const overUcs2 = measureSmsBudget(`—${'a'.repeat(178)}`);
	assert.equal(overUcs2.encoding, 'UCS-2');
	assert.equal(overUcs2.remainingUnits, -1);
	assert.equal(overUcs2.segments, 4);
	assert.equal(overUcs2.overLimit, true);
	assert.throws(
		() => validateSmsBody(`—${'a'.repeat(178)}`, { appendStopFooter: true }),
		/3 segments/
	);
});

test('grants SMS inbox access only to admins, group managers, event hosts, and thread members', async () => {
	assert.equal(await hasSmsInboxAccess(null, 'user-1'), false);
	assert.equal(await hasSmsInboxAccess(createSmsAccessSupabaseStub(), ''), false);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				profiles: [{ user_id: 'rider-1', admin: false }],
				group_members: [{ user_id: 'rider-1', group_id: 'group-1', role: 'member' }]
			}),
			'rider-1'
		),
		false
	);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				profiles: [{ user_id: 'admin-1', admin: true }]
			}),
			'admin-1'
		),
		true
	);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				group_members: [{ user_id: 'group-admin', group_id: 'group-1', role: 'admin' }]
			}),
			'group-admin'
		),
		true
	);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				activity_hosts: [{ user_id: 'ride-cohost', activity_event_id: 'ride-1' }]
			}),
			'ride-cohost'
		),
		true
	);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				volunteer_events: [{ id: 'vol-1', host_user_id: 'vol-host' }]
			}),
			'vol-host'
		),
		true
	);

	assert.equal(
		await hasSmsInboxAccess(
			createSmsAccessSupabaseStub({
				sms_thread_members: [{ user_id: 'member-1', thread_id: 'thread-1' }]
			}),
			'member-1'
		),
		true
	);
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
