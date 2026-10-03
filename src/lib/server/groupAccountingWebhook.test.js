import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';

const target = process.env.ACCOUNTING_TEST_WEBHOOK_URL;
const secret = process.env.ACCOUNTING_TEST_WEBHOOK_SECRET;
test(
	'signed Financial Connections completion reaches accounting handling instead of the ignored-event path',
	{ skip: !target || !secret },
	async () => {
		const url = new URL(target);
		assert.ok(
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
			'Webhook smoke tests must use a local development server.'
		);
		const payload = JSON.stringify({
			id: 'evt_accounting_refresh_local_probe',
			object: 'event',
			type: 'financial_connections.account.refreshed_transactions',
			livemode: true,
			data: {
				object: {
					id: 'fca_accounting_local_probe_not_linked',
					transaction_refresh: {
						id: 'fctxnr_local_probe',
						status: 'succeeded',
						last_attempted_at: Math.floor(Date.now() / 1000)
					}
				}
			}
		});
		const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
		const result = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'stripe-signature': signature },
			body: payload
		});
		assert.equal(result.status, 200);
		const body = await result.json();
		assert.equal(body.received, true);
		assert.equal(
			body.ignored,
			undefined,
			'The refresh handler must run even when no tenant matches this harmless probe.'
		);
		const rejected = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'stripe-signature': signature },
			body: payload + ' '
		});
		assert.equal(rejected.status, 400, 'Changing the signed payload must be rejected.');
	}
);
