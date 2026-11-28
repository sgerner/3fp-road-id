import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';

let mockSupabaseClient = null;
let mockStripeClient = null;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/env/private') {
			return {
				shortCircuit: true,
				url: [
					'data:text/javascript,',
					'export const PRINTFUL_CLIENT_ID = "pf-client-id";',
					'export const PRINTFUL_CLIENT_SECRET = "pf-client-secret";',
					'export const PRINTFUL_OAUTH_STATE_SECRET = "pf-state-secret";',
					'export const PRINTFUL_OAUTH_SCOPE = "";',
					'export const STRIPE_SECRET_KEY = "sk_test_mock";',
					'export const SUPABASE_SERVICE_ROLE_KEY = "service-role-key";'
				].join(' ')
			};
		}
		if (specifier === '$app/env/public') {
			return {
				shortCircuit: true,
				url: [
					'data:text/javascript,',
					'export const PUBLIC_URL_BASE = "https://3fp.org";',
					'export const PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_mock";',
					'export const PUBLIC_SUPABASE_URL = "https://example.supabase.co";',
					'export const PUBLIC_SUPABASE_ANON_KEY = "anon-key";'
				].join(' ')
			};
		}
		if (specifier === '#lib/server/supabaseClient') {
			return {
				shortCircuit: true,
				url: 'data:text/javascript,export function createServiceSupabaseClient() { return globalThis.__testMerchSupabase?.(); }'
			};
		}
		if (specifier === '#lib/server/stripe') {
			return {
				shortCircuit: true,
				url: [
					'data:text/javascript,',
					'export function getStripeClient() { return globalThis.__testMerchStripe?.(); }',
					'export function getStripePublishableKey() { return "pk_test_mock"; }',
					'export function resolvePublicBaseUrl() { return "https://3fp.org"; }'
				].join(' ')
			};
		}
		if (specifier === '#lib/server/session') {
			return {
				shortCircuit: true,
				url: 'data:text/javascript,export async function resolveVerifiedSession() { return { user: null }; }'
			};
		}
		if (specifier === '#lib/server/email') {
			return {
				shortCircuit: true,
				url: 'data:text/javascript,export async function sendServerEmail() { return { ok: true }; }'
			};
		}
		if (specifier.startsWith('#lib/') && !path.extname(specifier)) {
			return nextResolve(
				pathToFileURL(path.resolve('src/lib', `${specifier.slice(5)}.js`)).href,
				context
			);
		}
		return nextResolve(specifier, context);
	}
});

/** @type {any} */ (globalThis).__testMerchSupabase = () => mockSupabaseClient;
/** @type {any} */ (globalThis).__testMerchStripe = () => mockStripeClient;

const { calculatePrintfulShippingRatesV2, refreshPrintfulAccessToken } =
	await import('./printful.js');
const { calculateMerchQuote } = await import('./merch.js');
const { POST: postQuote } = await import('../../routes/api/merch/quote/+server.js');
const { POST: postCreatePaymentIntent } =
	await import('../../routes/api/merch/create-payment-intent/+server.js');
const { POST: postUpdatePaymentIntent } =
	await import('../../routes/api/merch/update-payment-intent/+server.js');
const { POST: postCreateCheckoutSession } =
	await import('../../routes/api/merch/create-checkout-session/+server.js');

const originalFetch = globalThis.fetch;

function createMerchSupabaseMock(initialTables = {}) {
	const tables = {
		merch_stores: [
			{
				id: 'store-main',
				slug: 'main',
				name: '3 Feet Please Merch',
				recipient_type: 'main',
				printful_store_id: 15281123,
				printful_sync_enabled: true
			}
		],
		merch_products: [
			{
				id: 'prod-jersey',
				store_id: 'store-main',
				name: '3FP Jersey',
				slug: '3fp-jersey',
				image_url: 'https://3fp.org/jersey.png',
				status: 'active'
			}
		],
		merch_product_variants: [
			{
				id: 'var-jersey-m',
				product_id: 'prod-jersey',
				name: 'Medium',
				sku: '3FP-J-M',
				option_values: { size: 'M' },
				partner_provider: 'printful',
				partner_variant_ref: JSON.stringify({
					product_id: '401',
					variant_id: '9001',
					catalog_variant_id: '4012'
				}),
				price_cents: 4500,
				is_active: true
			}
		],
		merch_partner_accounts: [
			{
				id: 'acct-pf-1',
				store_id: 'store-main',
				partner_provider: 'printful',
				access_token: 'stale-access-token',
				refresh_token: 'valid-refresh-token',
				access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
				refresh_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
				connected_at: '2026-03-12T04:03:07.265Z',
				last_error: null
			}
		],
		merch_tax_settings: [],
		merch_fulfillment_methods: [
			{
				id: 'method-manual-flat',
				store_id: 'store-main',
				name: 'Flat Rate USPS',
				method_type: 'shipping',
				base_fee_cents: 500,
				requires_address: true,
				rate_rule_mode: 'flat',
				is_active: true
			}
		],
		merch_shipping_rules: [],
		donation_accounts: [
			{
				id: 'main',
				stripe_account_id: 'acct_connected_123',
				charges_enabled: true
			}
		],
		merch_orders: [],
		merch_order_items: [],
		...initialTables
	};

	let idSeq = 1;

	return {
		tables,
		from(table) {
			const filters = [];
			/** @type {'select' | 'insert' | 'update' | 'upsert' | 'delete'} */
			let action = 'select';
			/** @type {any} */
			let writePayload = null;
			/** @type {string} */
			let conflictColumns = '';

			const getSource = () => {
				if (!Array.isArray(tables[table])) tables[table] = [];
				return tables[table];
			};

			const matchesFilters = (row) =>
				filters.every((filter) => {
					if (filter.type === 'eq') return row?.[filter.column] === filter.value;
					if (filter.type === 'in') return filter.values.includes(row?.[filter.column]);
					if (filter.type === 'is') return (row?.[filter.column] ?? null) === filter.value;
					return true;
				});

			const execute = () => {
				const rows = getSource();
				if (action === 'select') {
					return { data: rows.filter(matchesFilters), error: null };
				}
				if (action === 'insert') {
					const items = Array.isArray(writePayload) ? writePayload : [writePayload];
					const inserted = items.map((entry) => {
						const record = { id: entry?.id || `${table}-${idSeq++}`, ...entry };
						rows.push(record);
						return record;
					});
					return { data: inserted, error: null };
				}
				if (action === 'update') {
					const updated = [];
					for (const row of rows) {
						if (matchesFilters(row)) {
							Object.assign(row, writePayload);
							updated.push(row);
						}
					}
					return { data: updated, error: null };
				}
				if (action === 'upsert') {
					const cols = conflictColumns
						.split(',')
						.map((col) => col.trim())
						.filter(Boolean);
					const items = Array.isArray(writePayload) ? writePayload : [writePayload];
					const upserted = items.map((entry) => {
						const existing = cols.length
							? rows.find((row) => cols.every((col) => row?.[col] === entry?.[col]))
							: null;
						if (existing) {
							Object.assign(existing, entry);
							return existing;
						}
						const record = { id: entry?.id || `${table}-${idSeq++}`, ...entry };
						rows.push(record);
						return record;
					});
					return { data: upserted, error: null };
				}
				if (action === 'delete') {
					const kept = rows.filter((row) => !matchesFilters(row));
					tables[table] = kept;
					return { data: [], error: null };
				}
				return { data: [], error: null };
			};

			const builder = {
				select() {
					return builder;
				},
				insert(payload) {
					action = 'insert';
					writePayload = payload;
					return builder;
				},
				update(payload) {
					action = 'update';
					writePayload = payload;
					return builder;
				},
				upsert(payload, options = {}) {
					action = 'upsert';
					writePayload = payload;
					conflictColumns = options.onConflict || '';
					return builder;
				},
				delete() {
					action = 'delete';
					return builder;
				},
				eq(column, value) {
					filters.push({ type: 'eq', column, value });
					return builder;
				},
				in(column, values) {
					filters.push({ type: 'in', column, values });
					return builder;
				},
				is(column, value) {
					filters.push({ type: 'is', column, value });
					return builder;
				},
				order() {
					return builder;
				},
				limit() {
					return builder;
				},
				async maybeSingle() {
					const res = execute();
					return { data: res.data?.[0] ?? null, error: res.error };
				},
				async single() {
					const res = execute();
					return { data: res.data?.[0] ?? null, error: res.error };
				},
				then(onFulfilled, onRejected) {
					return Promise.resolve(execute()).then(onFulfilled, onRejected);
				}
			};
			return builder;
		}
	};
}

/**
 * @param {string} urlPath
 * @param {any} body
 * @param {string} [ip]
 * @returns {any}
 */
function makeEvent(urlPath, body, ip = '203.0.113.10') {
	return {
		request: new Request(`https://3fp.org${urlPath}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-forwarded-for': ip
			},
			body: JSON.stringify(body)
		}),
		url: new URL(`https://3fp.org${urlPath}`),
		cookies: { get: () => undefined },
		getClientAddress: () => ip
	};
}

beforeEach(() => {
	mockSupabaseClient = createMerchSupabaseMock();
	mockStripeClient = {
		paymentIntents: {
			async create(params) {
				return {
					id: 'pi_test_123',
					client_secret: 'pi_test_123_secret_abc',
					amount: params.amount
				};
			},
			async retrieve() {
				return {
					id: 'pi_test_123',
					client_secret: 'pi_test_123_secret_abc'
				};
			},
			async update(_id, params) {
				return {
					id: 'pi_test_123',
					amount: params.amount
				};
			}
		},
		checkout: {
			sessions: {
				async create() {
					return {
						id: 'cs_test_123',
						url: 'https://checkout.stripe.com/c/pay/cs_test_123'
					};
				}
			}
		}
	};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('printful.js preserves upstream 4xx/5xx error JSON payloads on OAuth and v2 API failures', async () => {
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url.includes('/oauth/token')) {
			return new Response(
				JSON.stringify({
					error: 'invalid_grant',
					error_description: 'The refresh token has expired; reconnect Printful.'
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return new Response(
			JSON.stringify({
				error: {
					reason: 'BadRequest',
					message: 'Recipient ZIP code 97201 does not match state WA.'
				}
			}),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	};

	await assert.rejects(
		() => refreshPrintfulAccessToken({ refreshToken: 'expired-refresh' }),
		/** @param {any} err */ (err) => {
			assert.equal(err.status, 400);
			assert.equal(err.message, 'The refresh token has expired; reconnect Printful.');
			return true;
		}
	);

	await assert.rejects(
		() =>
			calculatePrintfulShippingRatesV2({
				accessToken: 'tok-123',
				storeId: 15281123,
				recipient: { country_code: 'US', state_code: 'WA', zip: '97201' },
				orderItems: [{ source: 'catalog', catalog_variant_id: 4012, quantity: 1 }]
			}),
		/** @param {any} err */ (err) => {
			assert.equal(err.status, 400);
			assert.equal(err.message, 'Recipient ZIP code 97201 does not match state WA.');
			return true;
		}
	);
});

test('calculateMerchQuote retries Printful shipping rates once with a refreshed token on 401', async () => {
	const calls = [];
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		calls.push({ url, auth: init?.headers?.Authorization || null });
		if (url.endsWith('/v2/shipping-rates') && calls.length === 1) {
			return new Response(
				JSON.stringify({ error: { message: 'Invalid or expired OAuth access token.' } }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}
		if (url.endsWith('/oauth/token')) {
			return new Response(
				JSON.stringify({
					access_token: 'fresh-access-token',
					refresh_token: 'rotated-refresh-token',
					token_type: 'Bearer',
					scope: 'orders sync_products/read product_templates/read',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return new Response(
			JSON.stringify({
				data: [
					{
						id: 'STANDARD',
						name: 'Flat Rate (Standard)',
						rate: '6.49',
						currency: 'USD',
						min_delivery_days: 4,
						max_delivery_days: 7
					}
				]
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	};

	const result = await calculateMerchQuote({
		storeId: 'store-main',
		items: [{ variantId: 'var-jersey-m', quantity: 1 }],
		shippingAddress: {
			line1: '123 Main St',
			city: 'Portland',
			state: 'OR',
			postalCode: '97201',
			country: 'US'
		}
	});

	assert.equal(result.ok, true);
	assert.equal(calls.length, 3);
	assert.equal(calls[0].auth, 'Bearer stale-access-token');
	assert.match(calls[1].url, /\/oauth\/token$/);
	assert.equal(calls[2].auth, 'Bearer fresh-access-token');
	assert.equal(result.quote.printfulShippingFeeCents, 649);
	assert.equal(result.quote.manualShippingFeeCents, 0);
	assert.equal(result.quote.totalCents, 4500 + 649);
	assert.ok(mockSupabaseClient.tables.merch_partner_accounts[0].refresh_token_expires_at);
});

test('/api/merch/quote returns HTTP 503 JSON without manual fallback rates when Printful fails', async () => {
	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				error: { message: 'Printful shipping rate service is temporarily unavailable.' }
			}),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);

	const response = await postQuote(
		makeEvent(
			'/api/merch/quote',
			{
				storeSlug: 'main',
				items: [{ variantId: 'var-jersey-m', quantity: 1 }],
				shippingAddress: {
					line1: '123 Main St',
					city: 'Portland',
					state: 'OR',
					postalCode: '97201',
					country: 'US'
				}
			},
			'198.51.100.21'
		)
	);

	assert.equal(response.status, 503);
	const body = await response.json();
	assert.equal(body.ok, false);
	assert.equal(body.code, 'service_unavailable');
	assert.equal(body.retryable, true);
	assert.equal(body.error, 'Printful shipping rate service is temporarily unavailable.');
});

test('payment intent, update, and hosted checkout endpoints return HTTP 503 on Stripe errors and preserve 12-request rate limit', async () => {
	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				data: [{ id: 'STANDARD', name: 'Standard Shipping', rate: '6.49', currency: 'USD' }]
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	const checkoutPayload = {
		storeSlug: 'main',
		items: [{ variantId: 'var-jersey-m', quantity: 1 }],
		printfulShippingOptionId: 'STANDARD',
		customer: { name: 'Jane Rider', email: 'jane@example.com', phone: '' },
		shippingAddress: {
			line1: '123 Main St',
			city: 'Portland',
			state: 'OR',
			postalCode: '97201',
			country: 'US'
		}
	};

	const okCreate = await postCreatePaymentIntent(
		makeEvent('/api/merch/create-payment-intent', checkoutPayload, '198.51.100.31')
	);
	assert.equal(okCreate.status, 200);
	const created = await okCreate.json();
	assert.equal(created.paymentIntentId, 'pi_test_123');

	// Updating quantity from 1 to 2 updates PaymentIntent total cleanly
	const okUpdate = await postUpdatePaymentIntent(
		makeEvent(
			'/api/merch/update-payment-intent',
			{
				...checkoutPayload,
				items: [{ variantId: 'var-jersey-m', quantity: 2 }],
				paymentIntentId: created.paymentIntentId,
				clientSecret: created.clientSecret
			},
			'198.51.100.32'
		)
	);
	assert.equal(okUpdate.status, 200);
	const updated = await okUpdate.json();
	assert.equal(updated.amountCents, 9000 + 649);

	// Hosted checkout fallback session succeeds
	const okSession = await postCreateCheckoutSession(
		makeEvent('/api/merch/create-checkout-session', checkoutPayload, '198.51.100.33')
	);
	assert.equal(okSession.status, 200);
	const sessionBody = await okSession.json();
	assert.equal(sessionBody.url, 'https://checkout.stripe.com/c/pay/cs_test_123');

	// Stripe upstream failures return HTTP 503 (never 502)
	mockStripeClient.paymentIntents.create = async () => {
		throw new Error('Stripe API connection error.');
	};
	const failedCreate = await postCreatePaymentIntent(
		makeEvent('/api/merch/create-payment-intent', checkoutPayload, '198.51.100.34')
	);
	assert.equal(failedCreate.status, 503);
	const failedBody = await failedCreate.json();
	assert.equal(failedBody.error, 'Stripe API connection error.');

	// Enforce 12-request limit per 10-minute window on create-payment-intent
	const rateLimitIp = '198.51.100.99';
	for (let i = 0; i < 12; i += 1) {
		const res = await postCreatePaymentIntent(
			makeEvent('/api/merch/create-payment-intent', checkoutPayload, rateLimitIp)
		);
		assert.notEqual(res.status, 429);
	}
	const thirteenth = await postCreatePaymentIntent(
		makeEvent('/api/merch/create-payment-intent', checkoutPayload, rateLimitIp)
	);
	assert.equal(thirteenth.status, 429);
});

test('guardrails hold across security.js, printful.js, merch-sync-printful, and merch checkout page', () => {
	const securitySource = fs.readFileSync('src/lib/server/security.js', 'utf8');
	assert.match(securitySource, /allowErrorBody\s*=\s*false/);

	// allowErrorBody: true is only enabled in printful.js (twice)
	const printfulSource = fs.readFileSync('src/lib/server/printful.js', 'utf8');
	const allowMatches = printfulSource.match(/allowErrorBody:\s*true/g) ?? [];
	assert.equal(allowMatches.length, 2);

	const edgeSyncSource = fs.readFileSync('supabase/functions/merch-sync-printful/index.ts', 'utf8');
	assert.match(edgeSyncSource, /\/sync-products\?limit=25/);
	assert.match(edgeSyncSource, /\/sync-variants\?limit=50/);
	assert.doesNotMatch(edgeSyncSource, /\/products\?limit=100/);
	assert.match(edgeSyncSource, /refresh_token_expires_at:\s*refreshed\.refresh_token_expires_at/);

	const checkoutSource = fs.readFileSync('src/routes/merch/checkout/+page.svelte', 'utf8');
	assert.doesNotMatch(checkoutSource, /void preparePaymentElement\(\{\s*quiet:\s*true\s*\}\)/);
	assert.match(checkoutSource, /Continue to payment/);
	assert.match(checkoutSource, /Retry payment setup/);
	assert.match(checkoutSource, /\/api\/merch\/create-checkout-session/);
	assert.equal((checkoutSource.match(/Retry shipping rates/g) ?? []).length, 2);
	assert.match(checkoutSource, /borderRadius:\s*'0px'/);
	assert.doesNotMatch(checkoutSource, /\brounded-/);
});
