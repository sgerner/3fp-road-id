import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicOrigin } from '../security/origin.js';

test('configured public origin rejects insecure or malformed values', () => {
	assert.equal(normalizePublicOrigin('javascript:alert(1)'), 'https://3fp.org');
	assert.equal(normalizePublicOrigin('http://attacker.example'), 'https://3fp.org');
	assert.equal(normalizePublicOrigin('https://user:pass@example.com'), 'https://3fp.org');
	assert.equal(normalizePublicOrigin('not a url'), 'https://3fp.org');
});

test('configured public origin keeps HTTPS and local development origins', () => {
	assert.equal(normalizePublicOrigin('https://site.example/path'), 'https://site.example');
	assert.equal(normalizePublicOrigin('http://localhost:5173'), 'http://localhost:5173');
});
