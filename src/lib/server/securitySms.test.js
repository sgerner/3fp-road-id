import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { readAuthenticatedSignalWirePayload, verifySignalWireWebhookRequest } from './security.js';

const signingKey = 'PSK_test_signing_key';
const url = 'https://3fp.org/api/webhooks/signalwire/inbound';

function sha1Base64(value) {
	return createHmac('sha1', signingKey).update(value).digest('base64');
}

test('validates SignalWire raw-body signatures and rejects body changes', () => {
	const body = JSON.stringify({ from: '+14802869717', body: 'HELP' });
	const signature = sha1Base64(`${url}${body}`);
	const request = new Request(url, {
		method: 'POST',
		headers: { 'x-signalwire-signature': signature },
		body
	});
	assert.equal(verifySignalWireWebhookRequest(request, body, signingKey), true);
	assert.equal(verifySignalWireWebhookRequest(request, `${body} `, signingKey), false);
});

test('accepts raw-body signatures under the compatibility header', () => {
	const body = 'From=%2B14802869717&Body=STOP';
	const request = new Request(url, {
		method: 'POST',
		headers: { 'x-twilio-signature': sha1Base64(`${url}${body}`) },
		body
	});
	assert.equal(verifySignalWireWebhookRequest(request, body, signingKey), true);
});

test('accepts canonical compatibility form signatures', () => {
	const body = 'To=%2B18556980165&Body=HELP&From=%2B14802869717';
	const canonical = 'BodyHELPFrom+14802869717To+18556980165';
	const request = new Request(url, {
		method: 'POST',
		headers: { 'x-twilio-signature': sha1Base64(`${url}${canonical}`) },
		body
	});
	assert.equal(verifySignalWireWebhookRequest(request, body, signingKey), true);
});

test('authenticates JSON SignalWire payloads with the exact signed request body', async () => {
	const body = JSON.stringify({ MessageSid: 'SM123', Status: 'delivered' });
	const request = new Request(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signalwire-signature': sha1Base64(`${url}${body}`)
		},
		body
	});

	const result = await readAuthenticatedSignalWirePayload(request, signingKey);

	assert.deepEqual(result, {
		ok: true,
		payload: { MessageSid: 'SM123', Status: 'delivered' }
	});
});

test('reads authenticated URL-encoded SignalWire payloads', async () => {
	const body = 'From=%2B12025550123&Body=HELP';
	const request = new Request(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'x-twilio-signature': sha1Base64(`${url}${body}`)
		},
		body
	});

	const result = await readAuthenticatedSignalWirePayload(request, signingKey);

	assert.deepEqual(result, {
		ok: true,
		payload: { From: '+12025550123', Body: 'HELP' }
	});
});

test('reports SignalWire auth, JSON parsing, and body-size failures with their original statuses', async () => {
	const invalidSignatureBody = '{}';
	const invalidSignatureRequest = new Request(url, {
		method: 'POST',
		headers: { 'x-signalwire-signature': 'invalid' },
		body: invalidSignatureBody
	});
	assert.deepEqual(await readAuthenticatedSignalWirePayload(invalidSignatureRequest, signingKey), {
		ok: false,
		status: 401,
		error: 'Webhook authentication failed.'
	});

	const invalidJsonBody = '{';
	const invalidJsonRequest = new Request(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signalwire-signature': sha1Base64(`${url}${invalidJsonBody}`)
		},
		body: invalidJsonBody
	});
	assert.deepEqual(await readAuthenticatedSignalWirePayload(invalidJsonRequest, signingKey), {
		ok: false,
		status: 400,
		error: 'Invalid webhook payload.'
	});

	const largeBody = 'x'.repeat(64 * 1024 + 1);
	const largeBodyRequest = new Request(url, {
		method: 'POST',
		body: largeBody
	});
	assert.deepEqual(await readAuthenticatedSignalWirePayload(largeBodyRequest, signingKey), {
		ok: false,
		status: 413,
		error: 'Request body is too large.'
	});
});
