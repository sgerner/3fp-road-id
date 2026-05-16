import test from 'node:test';
import assert from 'node:assert/strict';
import {
	domainMatchesManagedZone,
	resolveSenderSelection,
	shouldAutoUpdateExistingDnsRecord
} from './emailDomainRules.js';

test('domainMatchesManagedZone matches exact domains and subdomains only on label boundaries', () => {
	assert.equal(domainMatchesManagedZone('example.org', 'example.org'), true);
	assert.equal(domainMatchesManagedZone('mail.example.org', 'example.org'), true);
	assert.equal(domainMatchesManagedZone('deep.mail.example.org', 'example.org'), true);
	assert.equal(domainMatchesManagedZone('fakeexample.org', 'example.org'), false);
	assert.equal(domainMatchesManagedZone('example.org.uk', 'example.org'), false);
});

test('resolveSenderSelection keeps explicit unverified selections from falling back silently', () => {
	const rows = [
		{ id: 'verified-default', is_default: true, ses_verified_for_sending: true },
		{ id: 'pending-choice', is_default: false, ses_verified_for_sending: false }
	];

	assert.deepEqual(resolveSenderSelection(rows, null), {
		status: 'verified',
		selected: rows[0],
		preferred: null
	});
	assert.deepEqual(resolveSenderSelection(rows, 'pending-choice'), {
		status: 'unverified',
		selected: null,
		preferred: rows[1]
	});
	assert.deepEqual(resolveSenderSelection(rows, 'missing-id'), {
		status: 'missing',
		selected: null,
		preferred: null
	});
});

test('shouldAutoUpdateExistingDnsRecord protects optional records with existing values', () => {
	assert.equal(shouldAutoUpdateExistingDnsRecord({ required: true }, { id: 'rec_1' }), true);
	assert.equal(shouldAutoUpdateExistingDnsRecord({ required: false }, { id: 'rec_2' }), false);
});
