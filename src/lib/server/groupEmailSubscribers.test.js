import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGroupEmailSignup } from './groupEmailSubscribers.js';

test('newsletter signup requires explicit consent and a valid email', () => {
	assert.equal(normalizeGroupEmailSignup({ email: 'person@example.org' }).ok, false);
	assert.equal(normalizeGroupEmailSignup({ email: 'not-an-email', consent: true }).ok, false);
});

test('newsletter signup normalizes deliverable visitor details', () => {
	assert.deepEqual(
		normalizeGroupEmailSignup({
			email: ' Rider@Example.ORG ',
			first_name: '  Casey  ',
			consent: true
		}),
		{
			ok: true,
			honeypot: false,
			email: 'rider@example.org',
			firstName: 'Casey'
		}
	);
});

test('newsletter signup honeypot succeeds without storing data', () => {
	assert.deepEqual(normalizeGroupEmailSignup({ company: 'Spam Co' }), {
		ok: true,
		honeypot: true
	});
});
