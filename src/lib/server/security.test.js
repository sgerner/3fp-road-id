import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
	fetchPublicHttp,
	isPublicHttpUrl,
	readFormData,
	verifyVercelWebhookRequest
} from './security.js';

test('Vercel webhook verification uses the original bytes and preserves legacy signatures', () => {
	const secret = 'test-webhook-secret';
	const body = Buffer.from('{ "type": "domain.event", "name": "vélo" }\n');
	for (const algorithm of ['sha1', 'sha256']) {
		const signature = createHmac(algorithm, secret).update(body).digest('hex');
		const request = new Request('https://example.com/api/vercel/webhook', {
			headers: { 'x-vercel-signature': signature }
		});
		assert.equal(verifyVercelWebhookRequest(request, body, secret), true);
		assert.equal(verifyVercelWebhookRequest(request, body.subarray(0, -1), secret), false);
		assert.equal(verifyVercelWebhookRequest(request, body, ''), false);
	}
});

test('public HTTP validation blocks local, special-use, and nonstandard-port targets', async () => {
	assert.equal(await isPublicHttpUrl('http://127.0.0.1/'), false);
	assert.equal(await isPublicHttpUrl('http://10.0.0.1/'), false);
	assert.equal(await isPublicHttpUrl('http://169.254.169.254/'), false);
	assert.equal(await isPublicHttpUrl('http://100.64.0.1/'), false);
	assert.equal(await isPublicHttpUrl('https://[::1]/'), false);
	assert.equal(await isPublicHttpUrl('https://[::ffff:7f00:1]/'), false);
	assert.equal(await isPublicHttpUrl('https://[2001:db8::1]/'), false);
	assert.equal(await isPublicHttpUrl('http://192.0.0.1/'), false);
	assert.equal(await isPublicHttpUrl('http://192.0.77.2/'), true);
	assert.equal(await isPublicHttpUrl('http://example.com:8080/'), false);
	assert.equal(await isPublicHttpUrl('http://localhost/'), false);
});

test('public HTTP fetch refuses local targets without making a request', async () => {
	assert.equal(await fetchPublicHttp('http://127.0.0.1:80/'), null);
});

test('bounded form reader preserves multipart fields and rejects oversized bodies', async () => {
	const form = new FormData();
	form.set('name', 'Community ride');
	const request = new Request('https://example.test/groups/new', { method: 'POST', body: form });
	const parsed = await readFormData(request, { maxBytes: 4096 });
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.get('name'), 'Community ride');

	const oversized = await readFormData(
		new Request('https://example.test/groups/new', { method: 'POST', body: 'too large' }),
		{ maxBytes: 4 }
	);
	assert.equal(oversized.ok, false);
	assert.equal(oversized.status, 413);
});
