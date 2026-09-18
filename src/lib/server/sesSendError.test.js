import assert from 'node:assert/strict';
import test from 'node:test';

import { describeSesSendFailure } from './sesSendError.js';

test('explains SES send permission failures without exposing the AWS error detail', () => {
	const result = describeSesSendFailure({
		name: 'AccessDeniedException',
		message: 'Access denied for recipient volunteer@example.org',
		$metadata: { requestId: 'request-123' }
	});

	assert.equal(result.code, 'AccessDeniedException');
	assert.match(result.message, /ses:SendEmail/);
	assert.match(result.message, /request-123/);
	assert.doesNotMatch(result.message, /volunteer@example\.org/);
});

test('maps SES message rejection to recipient and suppression checks', () => {
	const result = describeSesSendFailure({ name: 'MessageRejected' });

	assert.match(result.message, /recipient address/);
	assert.match(result.message, /suppression/);
});

test('explains sandbox identity verification failures without echoing the address', () => {
	const result = describeSesSendFailure({
		name: 'MessageRejected',
		message:
			"The message can't be sent because it contains invalid content. Email address is not verified. The following identities failed the check in region US-EAST-2: sgerner@gmail.com"
	});

	assert.match(result.message, /AWS_SES_REGION/);
	assert.match(result.message, /sandbox accounts can send only to verified recipients/);
	assert.doesNotMatch(result.message, /sgerner@gmail\.com|US-EAST-2/);
});

test('uses a safe fallback for unknown errors and omits invalid request references', () => {
	const result = describeSesSendFailure({
		name: 'SomeAwsError',
		message: 'sensitive details',
		$metadata: { requestId: 'x'.repeat(161) }
	});

	assert.equal(result.code, 'SomeAwsError');
	assert.equal(result.requestId, null);
	assert.match(result.message, /server log/);
	assert.doesNotMatch(result.message, /sensitive details/);
});
