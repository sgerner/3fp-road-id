import assert from 'node:assert/strict';
import test from 'node:test';
import {
	confirmationMatches,
	describeWorkspaceAuthError,
	exactText,
	normalizeWorkspaceAliases,
	normalizeErrorMessage,
	sameEmail
} from './googleWorkspaceRules.js';

test('exactText preserves password whitespace', () => {
	assert.equal(exactText('  correct horse  '), '  correct horse  ');
});

test('normalizes aliases returned on users and alias resources', () => {
	assert.deepEqual(normalizeWorkspaceAliases(['team@3fp.org', { alias: 'help@3fp.org' }, null]), [
		'team@3fp.org',
		'help@3fp.org'
	]);
});

test('confirmation must match the requested action and target', () => {
	assert.equal(confirmationMatches(' DELETE abc123 ', 'DELETE', 'abc123'), true);
	assert.equal(confirmationMatches('DELETE user@3fp.org', 'DELETE', 'abc123'), false);
});

test('email comparison is case insensitive', () => {
	assert.equal(sameEmail('Admin@3FP.org', 'admin@3fp.org'), true);
});

test('describes unauthorized client errors clearly', () => {
	assert.match(
		describeWorkspaceAuthError(new Error('unauthorized_client'), '1234567890'),
		/client ID 1234567890/
	);
});

test('normalizes structured error messages', () => {
	assert.equal(normalizeErrorMessage([{ error: 1 }, 'Invalid Password']), 'Invalid Password');
});
