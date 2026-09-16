import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeInternalPath } from '../security/navigation.js';
import { safeNavigationUrl } from '../security/urls.js';

test('internal redirect validation allows same-origin paths and rejects external destinations', () => {
	assert.equal(isSafeInternalPath('/groups/example/manage/social?social=connected'), true);
	assert.equal(isSafeInternalPath('/'), true);
	assert.equal(isSafeInternalPath('//attacker.example/path'), false);
	assert.equal(isSafeInternalPath('/\\\\attacker.example'), false);
	assert.equal(isSafeInternalPath('https://attacker.example'), false);
	assert.equal(isSafeInternalPath('/%2f%2fattacker.example'), false);
	assert.equal(isSafeInternalPath('/%0aheader'), false);
	assert.equal(isSafeInternalPath('/path\nheader'), false);
});

test('navigation URLs allow only safe internal, web, mail, and telephone targets', () => {
	assert.equal(safeNavigationUrl('/groups/example?tab=about'), '/groups/example?tab=about');
	assert.equal(safeNavigationUrl('example.org/contact'), 'https://example.org/contact');
	assert.equal(safeNavigationUrl('mailto:hello@example.org'), 'mailto:hello@example.org');
	assert.equal(safeNavigationUrl('tel:+1-555-0100'), 'tel:+1-555-0100');
	assert.equal(safeNavigationUrl('javascript:alert(1)'), '');
	assert.equal(safeNavigationUrl('//attacker.example'), '');
	assert.equal(safeNavigationUrl('https://user:pass@example.org'), '');
	assert.equal(safeNavigationUrl('https://example.org/%0aheader'), 'https://example.org/%0aheader');
});
