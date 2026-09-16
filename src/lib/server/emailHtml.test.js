import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeEmailHtml } from './emailHtml.js';

test('email HTML sanitizer removes scripts, executable URLs, and event handlers', () => {
	const result = sanitizeEmailHtml(
		'<div><img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)" onclick="alert(4)">Join</a><script>alert(5)</script><meta http-equiv="refresh" content="0;url=https://attacker.test"></div>'
	);

	assert.doesNotMatch(result, /<script|<meta|javascript:|onerror|onclick|alert\([1-5]\)/i);
	assert.match(result, /Join/);
});

test('email HTML sanitizer keeps safe formatting and links while constraining CSS', () => {
	const result = sanitizeEmailHtml(
		'<p style="color:#123456;background-image:url(https://attacker.test/x);position:fixed">Hello <a href="https://example.com" target="_blank">there</a></p>'
	);

	assert.match(result, /color:#123456/i);
	assert.doesNotMatch(result, /url\s*\(|position:fixed/i);
	assert.match(result, /href="https:\/\/example\.com"/);
	assert.match(result, /rel="noopener noreferrer"/);
	assert.match(result, /target="_blank"/);
});
