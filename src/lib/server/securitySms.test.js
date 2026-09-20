import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifySignalWireWebhookRequest } from './security.js';

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
