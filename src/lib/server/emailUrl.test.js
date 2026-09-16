import assert from 'node:assert/strict';
import test from 'node:test';
import { safeHttpUrl } from '../security/urls.js';

test('safe HTTP URL helper rejects executable, relative, and credentialed URLs', () => {
	assert.equal(safeHttpUrl('javascript:alert(1)'), '');
	assert.equal(safeHttpUrl('//attacker.example/path'), '');
	assert.equal(safeHttpUrl('/relative/path'), '');
	assert.equal(safeHttpUrl('https://user:pass@example.com/'), '');
});

test('safe HTTP URL helper normalizes bare hosts and accepts HTTP(S)', () => {
	assert.equal(safeHttpUrl('example.com'), 'https://example.com/');
	assert.equal(safeHttpUrl('https://example.com/path'), 'https://example.com/path');
});
