import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAwsSesCredentials } from './awsSesCredentials.js';

test('prefers a complete SES credential pair', () => {
	assert.deepEqual(
		selectAwsSesCredentials({
			AWS_SES_ACCESS_KEY_ID: 'ses-access',
			AWS_SES_SECRET_ACCESS_KEY: 'ses-secret',
			AWS_SESSION_TOKEN: 'ses-session',
			AWS_ACCESS_KEY_ID: 'shared-access',
			AWS_SECRET_ACCESS_KEY: 'shared-secret'
		}),
		{
			accessKeyId: 'ses-access',
			secretAccessKey: 'ses-secret',
			sessionToken: 'ses-session'
		}
	);
});

test('does not combine partial credentials from different variable families', () => {
	assert.equal(
		selectAwsSesCredentials({
			AWS_SES_ACCESS_KEY_ID: 'ses-access',
			AWS_SECRET_ACCESS_KEY: 'shared-secret',
			AWS_BEDROCK_SESSION_TOKEN: 'bedrock-session'
		}),
		null
	);
});

test('falls back to the next complete credential pair', () => {
	assert.deepEqual(
		selectAwsSesCredentials({
			AWS_SES_ACCESS_KEY_ID: 'incomplete-ses-access',
			AWS_ACCESS_KEY_ID: 'shared-access',
			AWS_SECRET_ACCESS_KEY: 'shared-secret',
			AWS_SESSION_TOKEN: 'shared-session'
		}),
		{
			accessKeyId: 'shared-access',
			secretAccessKey: 'shared-secret',
			sessionToken: 'shared-session'
		}
	);
});

test('uses Bedrock credentials only as a complete final fallback pair', () => {
	assert.deepEqual(
		selectAwsSesCredentials({
			AWS_BEDROCK_ACCESS_KEY_ID: 'bedrock-access',
			AWS_BEDROCK_SECRET_ACCESS_KEY: 'bedrock-secret',
			AWS_BEDROCK_SESSION_TOKEN: 'bedrock-session'
		}),
		{
			accessKeyId: 'bedrock-access',
			secretAccessKey: 'bedrock-secret',
			sessionToken: 'bedrock-session'
		}
	);
});
