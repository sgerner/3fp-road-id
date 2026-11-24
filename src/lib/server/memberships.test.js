import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

const MOCK_MODULES = {
	'test-mock:env-public': `
		export const PUBLIC_URL_BASE = 'https://3fp.org';
		export const PUBLIC_SUPABASE_URL = 'https://ci-placeholder.supabase.co';
		export const PUBLIC_SUPABASE_ANON_KEY = 'ci-placeholder';
		export const PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
	`,
	'test-mock:session': `
		export async function resolveVerifiedSession(cookies) {
			return globalThis.__membershipTestHarness.resolveVerifiedSession(cookies);
		}
	`,
	'test-mock:supabase': `
		export function createRequestSupabaseClient(accessToken) {
			return globalThis.__membershipTestHarness.createRequestSupabaseClient(accessToken);
		}
		export function createServiceSupabaseClient() {
			return globalThis.__membershipTestHarness.createServiceSupabaseClient();
		}
	`,
	'test-mock:stripe': `
		export function getStripeClient() {
			return globalThis.__membershipTestHarness.getStripeClient();
		}
		export function resolvePublicBaseUrl(url) {
			if (url?.origin) return String(url.origin).replace(/\\/+$/, '');
			return 'https://3fp.org';
		}
	`,
	'test-mock:email': `
		export async function sendServerEmail(payload) {
			globalThis.__membershipTestHarness.sentEmails.push(payload);
			return { ok: true };
		}
	`,
	'test-mock:group-email-domains': `
		export async function getGroupEmailSenderConfig() {
			return null;
		}
		export async function sendGroupManagedEmail(payload) {
			globalThis.__membershipTestHarness.sentEmails.push(payload);
			return { ok: true };
		}
	`
};

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/env/public') {
			return { url: 'test-mock:env-public', shortCircuit: true };
		}
		if (specifier === '#lib/server/session') {
			return { url: 'test-mock:session', shortCircuit: true };
		}
		if (specifier === '#lib/server/supabaseClient') {
			return { url: 'test-mock:supabase', shortCircuit: true };
		}
		if (specifier === '#lib/server/stripe') {
			return { url: 'test-mock:stripe', shortCircuit: true };
		}
		if (specifier === '#lib/server/email') {
			return { url: 'test-mock:email', shortCircuit: true };
		}
		if (specifier === '#lib/server/groupEmailDomains') {
			return { url: 'test-mock:group-email-domains', shortCircuit: true };
		}
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (!specifier.endsWith('.js')) {
				return nextResolve(`${specifier}.js`, context);
			}
			throw error;
		}
	},
	load(url, context, nextLoad) {
		if (Object.hasOwn(MOCK_MODULES, url)) {
			return {
				format: 'module',
				source: MOCK_MODULES[url],
				shortCircuit: true
			};
		}
		return nextLoad(url, context);
	}
});

const {
	createMembershipCheckout,
	createMembershipPaymentIntent,
	finalizeMembershipPaymentIntent,
	handleMembershipStripeEvent,
	joinMembership
} = await import('./memberships.js');
const { POST: postMembershipRoute } =
	await import('../../routes/api/groups/[slug]/membership/+server.js');
const { load: loadMembershipPage } =
	await import('../../routes/groups/[slug]/membership/+page.server.js');

function createInMemorySupabase(tables, options = {}) {
	const { role = 'service', operations = [] } = options;
	let idCounter = 100;

	return {
		from(table) {
			if (role === 'request' && table === 'group_membership_billing') {
				throw new Error('permission denied for table group_membership_billing');
			}
			if (!tables[table]) tables[table] = [];

			let mode = 'select';
			let payload = null;
			let upsertConflict = null;
			const filters = [];
			const orderSpecs = [];
			let rowLimit = null;

			const matchesRow = (row) =>
				filters.every((filter) => {
					if (filter.type === 'eq') return row?.[filter.key] === filter.value;
					if (filter.type === 'neq') return row?.[filter.key] !== filter.value;
					if (filter.type === 'in') return filter.values.includes(row?.[filter.key]);
					return true;
				});

			const execute = async () => {
				operations.push({ role, table, mode });
				const store = tables[table];

				if (mode === 'insert') {
					const items = Array.isArray(payload) ? payload : [payload];
					const inserted = items.map((item) => {
						const row = {
							id: item.id || `${table}_${++idCounter}`,
							...structuredClone(item)
						};
						store.push(row);
						return structuredClone(row);
					});
					return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
				}

				if (mode === 'update') {
					const updated = [];
					for (const row of store) {
						if (matchesRow(row)) {
							Object.assign(row, structuredClone(payload));
							updated.push(structuredClone(row));
						}
					}
					return { data: updated, error: null };
				}

				if (mode === 'upsert') {
					const items = Array.isArray(payload) ? payload : [payload];
					const conflictKeys = String(upsertConflict || 'id')
						.split(',')
						.map((entry) => entry.trim())
						.filter(Boolean);
					const upserted = items.map((item) => {
						const existing = store.find((row) =>
							conflictKeys.every((key) => row?.[key] === item?.[key])
						);
						if (existing) {
							Object.assign(existing, structuredClone(item));
							return structuredClone(existing);
						}
						const created = {
							id: item.id || `${table}_${++idCounter}`,
							...structuredClone(item)
						};
						store.push(created);
						return structuredClone(created);
					});
					return { data: Array.isArray(payload) ? upserted : upserted[0], error: null };
				}

				if (mode === 'delete') {
					const remaining = [];
					const deleted = [];
					for (const row of store) {
						if (matchesRow(row)) {
							deleted.push(structuredClone(row));
						} else {
							remaining.push(row);
						}
					}
					tables[table] = remaining;
					return { data: deleted, error: null };
				}

				let rows = store.filter(matchesRow).map((row) => structuredClone(row));
				for (const spec of [...orderSpecs].reverse()) {
					rows.sort((a, b) => {
						const left = a?.[spec.column] ?? '';
						const right = b?.[spec.column] ?? '';
						if (left === right) return 0;
						const cmp = left < right ? -1 : 1;
						return spec.ascending ? cmp : -cmp;
					});
				}
				if (typeof rowLimit === 'number') {
					rows = rows.slice(0, rowLimit);
				}
				return { data: rows, error: null };
			};

			const builder = {
				select() {
					return builder;
				},
				insert(nextPayload) {
					mode = 'insert';
					payload = nextPayload;
					return builder;
				},
				update(nextPayload) {
					mode = 'update';
					payload = nextPayload;
					return builder;
				},
				upsert(nextPayload, opts = {}) {
					mode = 'upsert';
					payload = nextPayload;
					upsertConflict = opts.onConflict || 'id';
					return builder;
				},
				delete() {
					mode = 'delete';
					return builder;
				},
				eq(key, value) {
					filters.push({ type: 'eq', key, value });
					return builder;
				},
				neq(key, value) {
					filters.push({ type: 'neq', key, value });
					return builder;
				},
				in(key, values) {
					filters.push({ type: 'in', key, values });
					return builder;
				},
				order(column, { ascending = true } = {}) {
					orderSpecs.push({ column, ascending });
					return builder;
				},
				limit(count) {
					rowLimit = count;
					return builder;
				},
				async single() {
					const res = await execute();
					if (res.error) return res;
					const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
					if (!row) return { data: null, error: { message: 'Row not found' } };
					return { data: row, error: null };
				},
				async maybeSingle() {
					const res = await execute();
					if (res.error) return res;
					if (Array.isArray(res.data)) {
						if (res.data.length > 1) {
							return { data: null, error: { message: 'Multiple rows returned' } };
						}
						return { data: res.data[0] ?? null, error: null };
					}
					return { data: res.data ?? null, error: null };
				},
				then(onFulfilled, onRejected) {
					return execute().then(onFulfilled, onRejected);
				}
			};
			return builder;
		}
	};
}

function setupHarness({
	user = { id: 'user_1', email: 'rider@example.org' },
	accessMode = 'public',
	contributionMode = 'donation',
	memberships = [],
	billing = [],
	tierChangeRequests = [],
	applications = [],
	stripeMock = {}
} = {}) {
	const operations = [];
	const tables = {
		groups: [
			{
				id: 'group_1',
				slug: 'tempe-bicycle-action-group',
				name: 'Tempe Bicycle Action Group',
				website_url: 'https://biketempe.org',
				social_links: {},
				public_contact_email: 'info@biketempe.org'
			}
		],
		profiles: [
			{
				user_id: 'user_1',
				email: 'rider@example.org',
				full_name: 'Casey Rider',
				phone: null,
				admin: false,
				metadata: {}
			}
		],
		group_members: [],
		donation_accounts: [
			{
				id: 'acct_row_1',
				group_id: 'group_1',
				stripe_account_id: 'acct_tbag',
				charges_enabled: true
			}
		],
		group_membership_programs: [
			{
				id: 'prog_1',
				group_id: 'group_1',
				enabled: true,
				access_mode: accessMode,
				contribution_mode: contributionMode,
				default_tier_id: 'tier_free',
				policy_version: 1
			}
		],
		group_membership_tiers: [
			{
				id: 'tier_free',
				program_id: 'prog_1',
				name: 'Neighbor',
				amount_cents: 0,
				monthly_amount_cents: null,
				annual_amount_cents: null,
				currency: 'usd',
				billing_type: 'one_time',
				interval_unit: null,
				interval_count: null,
				allow_custom_amount: false,
				min_amount_cents: null,
				is_default: true,
				is_active: true,
				sort_order: 0
			},
			{
				id: 'tier_supporter',
				program_id: 'prog_1',
				name: 'Supporter',
				amount_cents: 500,
				monthly_amount_cents: 500,
				annual_amount_cents: 5000,
				currency: 'usd',
				billing_type: 'recurring',
				interval_unit: 'month',
				interval_count: 1,
				allow_custom_amount: false,
				min_amount_cents: null,
				stripe_product_id: 'prod_supporter',
				stripe_monthly_price_id: 'price_supporter_month',
				stripe_annual_price_id: 'price_supporter_year',
				stripe_account_id: 'acct_tbag',
				is_default: false,
				is_active: true,
				sort_order: 1
			},
			{
				id: 'tier_advocate',
				program_id: 'prog_1',
				name: 'Advocate',
				amount_cents: 1500,
				monthly_amount_cents: 1500,
				annual_amount_cents: 15000,
				currency: 'usd',
				billing_type: 'recurring',
				interval_unit: 'month',
				interval_count: 1,
				allow_custom_amount: false,
				min_amount_cents: null,
				stripe_product_id: 'prod_advocate',
				stripe_monthly_price_id: 'price_advocate_month',
				stripe_annual_price_id: 'price_advocate_year',
				stripe_account_id: 'acct_tbag',
				is_default: false,
				is_active: true,
				sort_order: 2
			},
			{
				id: 'tier_custom',
				program_id: 'prog_1',
				name: 'Pay What You Want',
				amount_cents: 0,
				monthly_amount_cents: 0,
				annual_amount_cents: 0,
				currency: 'usd',
				billing_type: 'recurring',
				interval_unit: 'month',
				interval_count: 1,
				allow_custom_amount: true,
				min_amount_cents: 0,
				stripe_product_id: 'prod_custom',
				stripe_account_id: 'acct_tbag',
				is_default: false,
				is_active: true,
				sort_order: 3
			},
			{
				id: 'tier_lifetime',
				program_id: 'prog_1',
				name: 'Lifetime Supporter',
				amount_cents: 10000,
				monthly_amount_cents: null,
				annual_amount_cents: null,
				currency: 'usd',
				billing_type: 'one_time',
				interval_unit: null,
				interval_count: null,
				allow_custom_amount: false,
				min_amount_cents: null,
				is_default: false,
				is_active: true,
				sort_order: 4
			}
		],
		group_membership_form_fields: [
			{
				id: 'field_1',
				program_id: 'prog_1',
				field_type: 'textarea',
				label: 'Why join?',
				required: false,
				active: true,
				sort_order: 1
			}
		],
		group_memberships: structuredClone(memberships),
		group_membership_billing: structuredClone(billing),
		group_membership_tier_change_requests: structuredClone(tierChangeRequests),
		group_membership_applications: structuredClone(applications),
		group_membership_audit_log: []
	};

	const serviceSupabase = createInMemorySupabase(tables, { role: 'service', operations });
	const requestSupabase = createInMemorySupabase(tables, { role: 'request', operations });

	globalThis.__membershipTestHarness = {
		tables,
		operations,
		sentEmails: [],
		async resolveVerifiedSession() {
			if (!user) return { accessToken: null, user: null };
			return { accessToken: 'token_user_1', user };
		},
		createRequestSupabaseClient() {
			return requestSupabase;
		},
		createServiceSupabaseClient() {
			return serviceSupabase;
		},
		getStripeClient() {
			return stripeMock;
		}
	};

	return { tables, operations };
}

test('in-place recurring upgrade reuses active membership row and cancels pending tier change requests', async () => {
	const canceledSubscriptions = [];
	const { tables } = setupHarness({
		memberships: [
			{
				id: 'mem_existing',
				group_id: 'group_1',
				user_id: 'user_1',
				tier_id: 'tier_free',
				status: 'active',
				source: 'online',
				started_at: '2026-01-01T00:00:00.000Z',
				renews_at: null,
				ends_at: null,
				cancel_at_period_end: false,
				interval_unit: null,
				contribution_amount_cents: 0,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			}
		],
		tierChangeRequests: [
			{
				id: 'req_pending',
				membership_id: 'mem_existing',
				requested_tier_id: 'tier_supporter',
				status: 'pending',
				created_at: '2026-02-01T00:00:00.000Z',
				updated_at: '2026-02-01T00:00:00.000Z'
			}
		],
		stripeMock: {
			paymentIntents: {
				async retrieve(id) {
					return {
						id,
						status: 'succeeded',
						customer: 'cus_new',
						invoice: 'in_new',
						metadata: {}
					};
				}
			},
			invoices: {
				async retrieve(id) {
					return {
						id,
						status: 'paid',
						paid: true,
						subscription: 'sub_new',
						payment_intent: 'pi_upgrade_1'
					};
				}
			},
			subscriptions: {
				async retrieve(id) {
					return {
						id,
						status: 'active',
						customer: 'cus_new',
						latest_invoice: {
							id: 'in_new',
							status: 'paid',
							paid: true,
							subscription: id,
							payment_intent: 'pi_upgrade_1'
						},
						metadata: {
							membership_flow: 'group_membership',
							membership_group_id: 'group_1',
							membership_user_id: 'user_1',
							membership_tier_id: 'tier_advocate',
							membership_billing_type: 'recurring',
							membership_interval_unit: 'year',
							membership_amount_cents: '15000',
							membership_tier_price_id: 'price_advocate_year'
						}
					};
				},
				async cancel(id, params, opts) {
					canceledSubscriptions.push({ id, params, opts });
					return { id, status: 'canceled' };
				}
			}
		}
	});

	const result = await finalizeMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { payment_intent_id: 'pi_upgrade_1' },
		fetchImpl: null
	});

	assert.equal(result.ok, true);
	assert.equal(result.data.completed, true);
	assert.equal(result.data.membership_id, 'mem_existing');
	assert.equal(tables.group_memberships.length, 1, 'must reuse existing membership row');
	assert.equal(tables.group_memberships[0].tier_id, 'tier_advocate');
	assert.equal(tables.group_memberships[0].interval_unit, 'year');
	assert.equal(tables.group_memberships[0].contribution_amount_cents, 15000);
	assert.ok(tables.group_memberships[0].renews_at, 'recurring upgrade sets renews_at');
	assert.equal(tables.group_membership_tier_change_requests[0].status, 'cancelled');
	assert.equal(tables.group_membership_billing[0].stripe_subscription_id, 'sub_new');
	assert.equal(canceledSubscriptions.length, 0);
});

test('upgrading to a one-time tier clears renews_at and cancels superseded subscription after billing update', async () => {
	const callOrder = [];
	const { tables, operations } = setupHarness({
		memberships: [
			{
				id: 'mem_sub',
				group_id: 'group_1',
				user_id: 'user_1',
				tier_id: 'tier_supporter',
				status: 'active',
				source: 'online',
				started_at: '2026-01-01T00:00:00.000Z',
				renews_at: '2026-12-01T00:00:00.000Z',
				ends_at: null,
				cancel_at_period_end: true,
				interval_unit: 'month',
				contribution_amount_cents: 500,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			}
		],
		billing: [
			{
				id: 'bill_1',
				membership_id: 'mem_sub',
				stripe_customer_id: 'cus_old',
				stripe_subscription_id: 'sub_superseded',
				stripe_price_id: 'price_supporter_month',
				last_payment_status: 'paid'
			}
		],
		tierChangeRequests: [
			{
				id: 'req_1',
				membership_id: 'mem_sub',
				requested_tier_id: 'tier_advocate',
				status: 'pending'
			}
		],
		stripeMock: {
			paymentIntents: {
				async retrieve(id) {
					return {
						id,
						status: 'succeeded',
						customer: 'cus_lifetime',
						metadata: {
							membership_flow: 'group_membership',
							membership_group_id: 'group_1',
							membership_user_id: 'user_1',
							membership_tier_id: 'tier_lifetime',
							membership_billing_type: 'one_time',
							membership_interval_unit: '',
							membership_amount_cents: '10000'
						}
					};
				}
			},
			subscriptions: {
				async cancel(id, params, opts) {
					callOrder.push({
						step: 'stripe.subscriptions.cancel',
						id,
						stripeAccount: opts?.stripeAccount,
						billingSubscriptionAtCancelTime:
							tables.group_membership_billing[0]?.stripe_subscription_id,
						opsCount: operations.length
					});
					return { id, status: 'canceled' };
				}
			}
		}
	});

	const result = await finalizeMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { payment_intent_id: 'pi_lifetime_1' },
		fetchImpl: null
	});

	assert.equal(result.ok, true);
	assert.equal(result.data.completed, true);
	assert.equal(tables.group_memberships.length, 1);
	assert.equal(tables.group_memberships[0].tier_id, 'tier_lifetime');
	assert.equal(tables.group_memberships[0].renews_at, null, 'one-time tier clears renews_at');
	assert.equal(tables.group_memberships[0].interval_unit, null);
	assert.equal(tables.group_memberships[0].cancel_at_period_end, false);
	assert.equal(tables.group_memberships[0].contribution_amount_cents, 10000);
	assert.equal(tables.group_membership_tier_change_requests[0].status, 'cancelled');

	assert.equal(callOrder.length, 1);
	assert.equal(callOrder[0].id, 'sub_superseded');
	assert.equal(callOrder[0].stripeAccount, 'acct_tbag');
	assert.equal(
		callOrder[0].billingSubscriptionAtCancelTime,
		null,
		'group_membership_billing must be updated before canceling superseded subscription'
	);

	// Verify customer.subscription.deleted webhook for the old subscription does not cancel the upgraded membership
	const webhookResult = await handleMembershipStripeEvent({
		type: 'customer.subscription.deleted',
		account: 'acct_tbag',
		data: {
			object: {
				id: 'sub_superseded',
				status: 'canceled'
			}
		}
	});
	assert.equal(webhookResult.ok, true);
	assert.equal(webhookResult.matched, false);
	assert.equal(tables.group_memberships[0].status, 'active');
	assert.equal(tables.group_memberships[0].tier_id, 'tier_lifetime');
});

test('recurring-to-recurring custom or interval upgrade updates billing to new subscription before canceling prior subscription', async () => {
	const cancelSnapshots = [];
	const { tables } = setupHarness({
		memberships: [
			{
				id: 'mem_rec',
				group_id: 'group_1',
				user_id: 'user_1',
				tier_id: 'tier_supporter',
				status: 'active',
				source: 'online',
				started_at: '2026-01-01T00:00:00.000Z',
				renews_at: '2026-02-01T00:00:00.000Z',
				ends_at: null,
				cancel_at_period_end: false,
				interval_unit: 'month',
				contribution_amount_cents: 500,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			}
		],
		billing: [
			{
				id: 'bill_rec',
				membership_id: 'mem_rec',
				stripe_customer_id: 'cus_rec',
				stripe_subscription_id: 'sub_old_monthly',
				stripe_price_id: 'price_supporter_month',
				last_payment_status: 'paid'
			}
		],
		stripeMock: {
			paymentIntents: {
				async retrieve(id) {
					return {
						id,
						status: 'succeeded',
						customer: 'cus_rec',
						invoice: 'in_custom_annual',
						metadata: {}
					};
				}
			},
			invoices: {
				async retrieve(id) {
					return {
						id,
						status: 'paid',
						paid: true,
						subscription: 'sub_new_annual',
						payment_intent: 'pi_custom_annual'
					};
				}
			},
			subscriptions: {
				async retrieve(id) {
					return {
						id,
						status: 'active',
						customer: 'cus_rec',
						latest_invoice: {
							id: 'in_custom_annual',
							status: 'paid',
							paid: true,
							subscription: id,
							payment_intent: 'pi_custom_annual'
						},
						metadata: {
							membership_flow: 'group_membership',
							membership_group_id: 'group_1',
							membership_user_id: 'user_1',
							membership_tier_id: 'tier_custom',
							membership_billing_type: 'recurring',
							membership_interval_unit: 'year',
							membership_amount_cents: '12000',
							membership_tier_price_id: 'price_custom_annual_12000'
						}
					};
				},
				async cancel(id, _params, opts) {
					cancelSnapshots.push({
						canceledId: id,
						stripeAccount: opts?.stripeAccount,
						storedSubscriptionId: tables.group_membership_billing[0]?.stripe_subscription_id
					});
					return { id, status: 'canceled' };
				}
			}
		}
	});

	const result = await finalizeMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { payment_intent_id: 'pi_custom_annual' },
		fetchImpl: null
	});

	assert.equal(result.ok, true);
	assert.equal(result.data.completed, true);
	assert.equal(tables.group_memberships.length, 1);
	assert.equal(tables.group_memberships[0].id, 'mem_rec');
	assert.equal(tables.group_memberships[0].tier_id, 'tier_custom');
	assert.equal(tables.group_memberships[0].interval_unit, 'year');
	assert.equal(tables.group_memberships[0].contribution_amount_cents, 12000);
	assert.equal(cancelSnapshots.length, 1);
	assert.deepEqual(cancelSnapshots[0], {
		canceledId: 'sub_old_monthly',
		stripeAccount: 'acct_tbag',
		storedSubscriptionId: 'sub_new_annual'
	});

	const deletedWebhook = await handleMembershipStripeEvent({
		type: 'customer.subscription.deleted',
		account: 'acct_tbag',
		data: { object: { id: 'sub_old_monthly', status: 'canceled' } }
	});
	assert.equal(deletedWebhook.ok, true);
	assert.equal(deletedWebhook.matched, false);
	assert.equal(tables.group_memberships[0].status, 'active');
});

test('private_request programs allow active members to create upgrade payment intents while blocking unapproved non-members', async () => {
	// 1. Active member with a completed historical application can upgrade
	const { tables } = setupHarness({
		accessMode: 'private_request',
		contributionMode: 'paid',
		memberships: [
			{
				id: 'mem_private_active',
				group_id: 'group_1',
				user_id: 'user_1',
				tier_id: 'tier_supporter',
				status: 'active',
				interval_unit: 'month',
				contribution_amount_cents: 500,
				created_at: '2026-01-01T00:00:00.000Z'
			}
		],
		applications: [
			{
				id: 'app_completed',
				group_id: 'group_1',
				user_id: 'user_1',
				status: 'completed',
				selected_tier_id: 'tier_supporter'
			}
		],
		stripeMock: {
			customers: {
				async create() {
					return { id: 'cus_priv' };
				}
			},
			products: {
				async update(id) {
					return { id };
				}
			},
			prices: {
				async create() {
					return { id: 'price_custom_2500' };
				}
			},
			subscriptions: {
				async create() {
					return {
						id: 'sub_priv_upgrade',
						customer: 'cus_priv',
						latest_invoice: {
							id: 'in_priv',
							payment_intent: {
								id: 'pi_priv_upgrade',
								client_secret: 'pi_priv_upgrade_secret_123'
							}
						}
					};
				}
			}
		}
	});

	const upgradeIntent = await createMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: {
			tier_id: 'tier_custom',
			billing_interval: 'month',
			custom_amount_cents: 2500,
			application_id: 'app_completed'
		},
		requestUrl: new URL('https://3fp.org/groups/tempe-bicycle-action-group/membership')
	});

	assert.equal(upgradeIntent.ok, true);
	assert.equal(upgradeIntent.data.requires_payment, true);
	assert.equal(upgradeIntent.data.payment_intent_id, 'pi_priv_upgrade');
	assert.equal(upgradeIntent.data.subscription_id, 'sub_priv_upgrade');
	assert.equal(
		tables.group_membership_applications[0].status,
		'completed',
		'completed application must not revert to payment_pending'
	);

	// 2. Non-member without approved application is still blocked
	setupHarness({
		accessMode: 'private_request',
		contributionMode: 'paid',
		memberships: [],
		applications: [
			{
				id: 'app_submitted',
				group_id: 'group_1',
				user_id: 'user_1',
				status: 'submitted',
				selected_tier_id: 'tier_supporter'
			}
		]
	});

	const missingAppRes = await createMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { tier_id: 'tier_supporter', billing_interval: 'month' },
		requestUrl: new URL('https://3fp.org/groups/tempe-bicycle-action-group/membership')
	});
	assert.equal(missingAppRes.ok, false);
	assert.equal(missingAppRes.status, 400);

	const unapprovedAppRes = await createMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: {
			tier_id: 'tier_supporter',
			billing_interval: 'month',
			application_id: 'app_submitted'
		},
		requestUrl: new URL('https://3fp.org/groups/tempe-bicycle-action-group/membership')
	});
	assert.equal(unapprovedAppRes.ok, false);
	assert.equal(unapprovedAppRes.status, 409);
});

test('redirect finalization handles succeeded, processing, and failed states in server load and preserves recurring failures', async () => {
	const mockFetch = async (path) => {
		if (String(path).startsWith('/api/v1/groups')) {
			return {
				ok: true,
				async json() {
					return {
						data: {
							id: 'group_1',
							slug: 'tempe-bicycle-action-group',
							name: 'Tempe Bicycle Action Group'
						}
					};
				}
			};
		}
		if (String(path).includes('/membership/program')) {
			return {
				ok: true,
				async json() {
					return {
						data: {
							program: { id: 'prog_1', enabled: true, contribution_mode: 'donation' },
							tiers: []
						}
					};
				}
			};
		}
		return {
			ok: false,
			async json() {
				return {};
			}
		};
	};

	// 1. Succeeded redirect finalizes BEFORE loading group_memberships and exposes has_stripe_subscription
	{
		const { operations } = setupHarness({
			memberships: [
				{
					id: 'mem_1',
					group_id: 'group_1',
					user_id: 'user_1',
					tier_id: 'tier_free',
					status: 'active',
					created_at: '2026-01-01T00:00:00.000Z'
				}
			],
			stripeMock: {
				paymentIntents: {
					async retrieve(id) {
						return {
							id,
							status: 'succeeded',
							customer: 'cus_redir',
							invoice: 'in_redir',
							metadata: {}
						};
					}
				},
				invoices: {
					async retrieve(id) {
						return {
							id,
							status: 'paid',
							paid: true,
							subscription: 'sub_redir',
							payment_intent: 'pi_redir_ok'
						};
					}
				},
				subscriptions: {
					async retrieve(id) {
						return {
							id,
							status: 'active',
							customer: 'cus_redir',
							latest_invoice: {
								id: 'in_redir',
								status: 'paid',
								paid: true,
								subscription: id,
								payment_intent: 'pi_redir_ok'
							},
							metadata: {
								membership_flow: 'group_membership',
								membership_group_id: 'group_1',
								membership_user_id: 'user_1',
								membership_tier_id: 'tier_supporter',
								membership_billing_type: 'recurring',
								membership_interval_unit: 'month',
								membership_amount_cents: '500',
								membership_tier_price_id: 'price_supporter_month'
							}
						};
					}
				}
			}
		});

		const pageData = await loadMembershipPage({
			params: { slug: 'tempe-bicycle-action-group' },
			url: new URL(
				'https://3fp.org/groups/tempe-bicycle-action-group/membership?payment_intent=pi_redir_ok&redirect_status=succeeded'
			),
			fetch: mockFetch,
			cookies: {}
		});

		assert.equal(pageData.payment_redirect.status, 'succeeded');
		assert.equal(pageData.payment_redirect.completed, true);
		assert.equal(pageData.my_memberships.length, 1);
		assert.equal(
			pageData.my_memberships[0].tier_id,
			'tier_supporter',
			'load must return upgraded membership updated during redirect finalization'
		);
		assert.equal(pageData.has_stripe_subscription, true);

		const serviceMembershipUpdateIdx = operations.findIndex(
			(op) => op.role === 'service' && op.table === 'group_memberships' && op.mode === 'update'
		);
		const requestMembershipsSelectIdx = operations.findIndex(
			(op) => op.role === 'request' && op.table === 'group_memberships' && op.mode === 'select'
		);
		assert.ok(
			serviceMembershipUpdateIdx >= 0 && serviceMembershipUpdateIdx < requestMembershipsSelectIdx,
			'finalizeMembershipPaymentIntent must run before loading group_memberships'
		);
	}

	// 2. Processing redirect reports processing status without activating prematurely
	{
		setupHarness({
			memberships: [],
			stripeMock: {
				paymentIntents: {
					async retrieve(id) {
						return {
							id,
							status: 'processing',
							customer: 'cus_proc',
							invoice: 'in_proc',
							metadata: {}
						};
					}
				},
				invoices: {
					async retrieve(id) {
						return {
							id,
							status: 'open',
							paid: false,
							subscription: 'sub_proc',
							payment_intent: 'pi_redir_proc'
						};
					}
				},
				subscriptions: {
					async retrieve(id) {
						return {
							id,
							status: 'incomplete',
							customer: 'cus_proc',
							latest_invoice: {
								id: 'in_proc',
								status: 'open',
								paid: false,
								subscription: id,
								payment_intent: 'pi_redir_proc'
							},
							metadata: {
								membership_flow: 'group_membership',
								membership_group_id: 'group_1',
								membership_user_id: 'user_1',
								membership_tier_id: 'tier_supporter',
								membership_billing_type: 'recurring',
								membership_interval_unit: 'month',
								membership_amount_cents: '500'
							}
						};
					}
				}
			}
		});

		const pageData = await loadMembershipPage({
			params: { slug: 'tempe-bicycle-action-group' },
			url: new URL(
				'https://3fp.org/groups/tempe-bicycle-action-group/membership?payment_intent=pi_redir_proc&redirect_status=processing'
			),
			fetch: mockFetch,
			cookies: {}
		});

		assert.equal(pageData.payment_redirect.status, 'processing');
		assert.equal(pageData.payment_redirect.completed, false);
		assert.equal(pageData.my_memberships.length, 0);
	}

	// 3. Failed redirect_status skips Stripe retrieve and failed recurring PaymentIntent preserves failed status
	{
		let stripeCalled = false;
		setupHarness({
			memberships: [],
			stripeMock: {
				paymentIntents: {
					async retrieve(id) {
						stripeCalled = true;
						return {
							id,
							status: 'requires_payment_method',
							customer: 'cus_fail',
							invoice: 'in_fail',
							metadata: {}
						};
					}
				},
				invoices: {
					async retrieve(id) {
						return {
							id,
							status: 'open',
							paid: false,
							subscription: 'sub_fail',
							payment_intent: 'pi_redir_fail'
						};
					}
				},
				subscriptions: {
					async retrieve(id) {
						return {
							id,
							status: 'incomplete',
							customer: 'cus_fail',
							latest_invoice: {
								id: 'in_fail',
								status: 'open',
								paid: false,
								subscription: id,
								payment_intent: 'pi_redir_fail'
							},
							metadata: {
								membership_flow: 'group_membership',
								membership_group_id: 'group_1',
								membership_user_id: 'user_1',
								membership_tier_id: 'tier_supporter',
								membership_billing_type: 'recurring',
								membership_interval_unit: 'month',
								membership_amount_cents: '500'
							}
						};
					}
				}
			}
		});

		const failedRedirectData = await loadMembershipPage({
			params: { slug: 'tempe-bicycle-action-group' },
			url: new URL(
				'https://3fp.org/groups/tempe-bicycle-action-group/membership?payment_intent=pi_redir_fail&redirect_status=failed'
			),
			fetch: mockFetch,
			cookies: {}
		});

		assert.equal(stripeCalled, false, 'redirect_status=failed must skip Stripe finalization');
		assert.equal(failedRedirectData.payment_redirect.status, 'failed');
		assert.equal(failedRedirectData.payment_redirect.completed, false);

		const directFinalizeFailed = await finalizeMembershipPaymentIntent({
			cookies: {},
			groupSlug: 'tempe-bicycle-action-group',
			payload: { payment_intent_id: 'pi_redir_fail' },
			fetchImpl: null
		});
		assert.equal(stripeCalled, true);
		assert.equal(directFinalizeFailed.ok, true);
		assert.equal(directFinalizeFailed.data.completed, false);
		assert.equal(
			directFinalizeFailed.data.payment_status,
			'requires_payment_method',
			'failed recurring PaymentIntent status must be preserved instead of overwritten with processing'
		);

		const spoofedSucceededData = await loadMembershipPage({
			params: { slug: 'tempe-bicycle-action-group' },
			url: new URL(
				'https://3fp.org/groups/tempe-bicycle-action-group/membership?payment_intent=pi_redir_fail&redirect_status=succeeded'
			),
			fetch: mockFetch,
			cookies: {}
		});
		assert.equal(spoofedSucceededData.payment_redirect.status, 'failed');
		assert.equal(spoofedSucceededData.payment_redirect.completed, false);
	}
});

test('POST /api/groups/[slug]/membership cancels active Stripe subscription when downgrading to a free tier and rolls back on Stripe error', async () => {
	// 1. Successful downgrade to Neighbor free tier cancels subscription on connected account after clearing billing row
	{
		const cancelSnapshots = [];
		const { tables } = setupHarness({
			contributionMode: 'donation',
			memberships: [
				{
					id: 'mem_paid_active',
					group_id: 'group_1',
					user_id: 'user_1',
					tier_id: 'tier_supporter',
					status: 'active',
					source: 'online',
					started_at: '2026-01-01T00:00:00.000Z',
					renews_at: '2026-02-01T00:00:00.000Z',
					ends_at: null,
					cancel_at_period_end: false,
					interval_unit: 'month',
					contribution_amount_cents: 500,
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-01-01T00:00:00.000Z'
				}
			],
			billing: [
				{
					id: 'bill_paid_active',
					membership_id: 'mem_paid_active',
					stripe_customer_id: 'cus_paid_1',
					stripe_subscription_id: 'sub_paid_active_1',
					stripe_price_id: 'price_supporter_month',
					last_payment_status: 'paid',
					next_billing_at: '2026-02-01T00:00:00.000Z'
				}
			],
			tierChangeRequests: [
				{
					id: 'req_pending_down',
					membership_id: 'mem_paid_active',
					user_id: 'user_1',
					current_tier_id: 'tier_supporter',
					requested_tier_id: 'tier_advocate',
					status: 'pending'
				}
			],
			stripeMock: {
				subscriptions: {
					async cancel(id, _params, opts) {
						cancelSnapshots.push({
							id,
							stripeAccount: opts?.stripeAccount,
							billingSubscriptionAtCancelTime:
								tables.group_membership_billing[0]?.stripe_subscription_id
						});
						return { id, status: 'canceled' };
					}
				}
			}
		});

		const response = await postMembershipRoute({
			params: { slug: 'tempe-bicycle-action-group' },
			cookies: {},
			request: new Request('https://3fp.org/api/groups/tempe-bicycle-action-group/membership', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tier_id: 'tier_free' })
			})
		});

		assert.equal(response.status, 200);
		const body = await response.json();
		assert.deepEqual(body, { success: true, action: 'changed_immediately' });
		assert.equal(cancelSnapshots.length, 1);
		assert.deepEqual(cancelSnapshots[0], {
			id: 'sub_paid_active_1',
			stripeAccount: 'acct_tbag',
			billingSubscriptionAtCancelTime: null
		});
		assert.equal(tables.group_memberships[0].tier_id, 'tier_free');
		assert.equal(tables.group_memberships[0].contribution_amount_cents, 0);
		assert.equal(tables.group_memberships[0].renews_at, null);
		assert.equal(tables.group_memberships[0].interval_unit, null);
		assert.equal(tables.group_membership_billing[0].stripe_subscription_id, null);
		assert.equal(tables.group_membership_tier_change_requests[0].status, 'cancelled');

		const deletedWebhook = await handleMembershipStripeEvent({
			type: 'customer.subscription.deleted',
			account: 'acct_tbag',
			data: { object: { id: 'sub_paid_active_1', status: 'canceled' } }
		});
		assert.equal(deletedWebhook.ok, true);
		assert.equal(deletedWebhook.matched, false);
		assert.equal(tables.group_memberships[0].status, 'active');
		assert.equal(tables.group_memberships[0].tier_id, 'tier_free');
	}

	// 2. Stripe cancellation error restores billing row and leaves membership on paid tier with HTTP 502
	{
		const { tables } = setupHarness({
			contributionMode: 'donation',
			memberships: [
				{
					id: 'mem_paid_fail',
					group_id: 'group_1',
					user_id: 'user_1',
					tier_id: 'tier_supporter',
					status: 'active',
					source: 'online',
					started_at: '2026-01-01T00:00:00.000Z',
					renews_at: '2026-02-01T00:00:00.000Z',
					interval_unit: 'month',
					contribution_amount_cents: 500,
					created_at: '2026-01-01T00:00:00.000Z'
				}
			],
			billing: [
				{
					id: 'bill_paid_fail',
					membership_id: 'mem_paid_fail',
					stripe_customer_id: 'cus_paid_fail',
					stripe_subscription_id: 'sub_paid_fail_1',
					stripe_price_id: 'price_supporter_month',
					last_payment_status: 'paid',
					next_billing_at: '2026-02-01T00:00:00.000Z'
				}
			],
			tierChangeRequests: [
				{
					id: 'req_keep_pending',
					membership_id: 'mem_paid_fail',
					user_id: 'user_1',
					current_tier_id: 'tier_supporter',
					requested_tier_id: 'tier_advocate',
					status: 'pending'
				}
			],
			stripeMock: {
				subscriptions: {
					async cancel() {
						throw new Error('Stripe API temporarily unavailable');
					},
					async retrieve(id) {
						return { id, status: 'active' };
					}
				}
			}
		});

		await assert.rejects(
			() =>
				postMembershipRoute({
					params: { slug: 'tempe-bicycle-action-group' },
					cookies: {},
					request: new Request('https://3fp.org/api/groups/tempe-bicycle-action-group/membership', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ tier_id: 'tier_free' })
					})
				}),
			(err) => err?.status === 502
		);

		assert.equal(
			tables.group_membership_billing[0].stripe_subscription_id,
			'sub_paid_fail_1',
			'stripe_subscription_id must be restored when Stripe cancel fails'
		);
		assert.equal(tables.group_membership_billing[0].stripe_price_id, 'price_supporter_month');
		assert.equal(tables.group_memberships[0].tier_id, 'tier_supporter');
		assert.equal(tables.group_memberships[0].contribution_amount_cents, 500);
		assert.equal(tables.group_membership_tier_change_requests[0].status, 'pending');
	}
});

test('donation mode zero-amount switches update existing paid membership and cancel Stripe subscription across payment-intent, checkout, and join flows', async () => {
	// 1. createMembershipPaymentIntent with $0 custom donation tier updates tier + cancels subscription
	{
		const canceledIds = [];
		const { tables } = setupHarness({
			contributionMode: 'donation',
			memberships: [
				{
					id: 'mem_don_pi',
					group_id: 'group_1',
					user_id: 'user_1',
					tier_id: 'tier_supporter',
					status: 'active',
					interval_unit: 'month',
					renews_at: '2026-02-01T00:00:00.000Z',
					contribution_amount_cents: 500,
					created_at: '2026-01-01T00:00:00.000Z'
				}
			],
			billing: [
				{
					id: 'bill_don_pi',
					membership_id: 'mem_don_pi',
					stripe_customer_id: 'cus_don_pi',
					stripe_subscription_id: 'sub_don_pi',
					stripe_price_id: 'price_supporter_month',
					last_payment_status: 'paid'
				}
			],
			stripeMock: {
				subscriptions: {
					async cancel(id) {
						canceledIds.push(id);
						return { id, status: 'canceled' };
					}
				}
			}
		});

		const res = await createMembershipPaymentIntent({
			cookies: {},
			groupSlug: 'tempe-bicycle-action-group',
			payload: {
				tier_id: 'tier_custom',
				billing_interval: 'year',
				custom_amount_cents: 0
			},
			requestUrl: new URL('https://3fp.org/groups/tempe-bicycle-action-group/membership')
		});

		assert.equal(res.ok, true);
		assert.equal(res.data.requires_payment, false);
		assert.equal(res.data.membership.id, 'mem_don_pi');
		assert.equal(res.data.membership.tier_id, 'tier_custom');
		assert.equal(res.data.membership.interval_unit, 'year');
		assert.equal(res.data.membership.contribution_amount_cents, 0);
		assert.deepEqual(canceledIds, ['sub_don_pi']);
		assert.equal(tables.group_memberships[0].tier_id, 'tier_custom');
		assert.equal(tables.group_membership_billing[0].stripe_subscription_id, null);
	}

	// 2. createMembershipCheckout and joinMembership also apply requested free tier and cancel prior subscription
	{
		const canceledIds = [];
		const { tables } = setupHarness({
			contributionMode: 'donation',
			memberships: [
				{
					id: 'mem_don_co',
					group_id: 'group_1',
					user_id: 'user_1',
					tier_id: 'tier_advocate',
					status: 'active',
					interval_unit: 'month',
					renews_at: '2026-02-01T00:00:00.000Z',
					contribution_amount_cents: 1500,
					created_at: '2026-01-01T00:00:00.000Z'
				}
			],
			billing: [
				{
					id: 'bill_don_co',
					membership_id: 'mem_don_co',
					stripe_customer_id: 'cus_don_co',
					stripe_subscription_id: 'sub_don_co',
					stripe_price_id: 'price_advocate_month',
					last_payment_status: 'paid'
				}
			],
			stripeMock: {
				subscriptions: {
					async cancel(id) {
						canceledIds.push(id);
						return { id, status: 'canceled' };
					}
				}
			}
		});

		const checkoutRes = await createMembershipCheckout({
			cookies: {},
			groupSlug: 'tempe-bicycle-action-group',
			payload: {
				tier_id: 'tier_custom',
				billing_interval: 'month',
				custom_amount_cents: 0
			},
			requestUrl: new URL('https://3fp.org/groups/tempe-bicycle-action-group/membership')
		});

		assert.equal(checkoutRes.ok, true);
		assert.equal(checkoutRes.data.requires_checkout, false);
		assert.equal(checkoutRes.data.membership.tier_id, 'tier_custom');
		assert.equal(checkoutRes.data.membership.contribution_amount_cents, 0);
		assert.deepEqual(canceledIds, ['sub_don_co']);
		assert.equal(tables.group_membership_billing[0].stripe_subscription_id, null);

		const joinRes = await joinMembership({
			cookies: {},
			groupSlug: 'tempe-bicycle-action-group',
			payload: { tier_id: 'tier_free' }
		});
		assert.equal(joinRes.ok, true);
		assert.equal(joinRes.data.membership.tier_id, 'tier_free');
		assert.equal(joinRes.data.membership.renews_at, null);
		assert.equal(tables.group_memberships[0].tier_id, 'tier_free');
	}
});

test('superseded subscription cancellation failure rolls back billing snapshot, returns retryable error, and succeeds on retry', async () => {
	let failCancel = true;
	let cancelCalls = 0;
	const { tables } = setupHarness({
		memberships: [
			{
				id: 'mem_super_retry',
				group_id: 'group_1',
				user_id: 'user_1',
				tier_id: 'tier_supporter',
				status: 'active',
				source: 'online',
				started_at: '2026-01-01T00:00:00.000Z',
				renews_at: '2026-02-01T00:00:00.000Z',
				interval_unit: 'month',
				contribution_amount_cents: 500,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			}
		],
		billing: [
			{
				id: 'bill_super_retry',
				membership_id: 'mem_super_retry',
				stripe_customer_id: 'cus_super_retry',
				stripe_subscription_id: 'sub_prior_active',
				stripe_price_id: 'price_supporter_month',
				last_payment_status: 'paid',
				next_billing_at: '2026-02-01T00:00:00.000Z'
			}
		],
		stripeMock: {
			paymentIntents: {
				async retrieve(id) {
					return {
						id,
						status: 'succeeded',
						customer: 'cus_super_retry',
						invoice: 'in_super_retry',
						metadata: {}
					};
				}
			},
			invoices: {
				async retrieve(id) {
					return {
						id,
						status: 'paid',
						paid: true,
						subscription: 'sub_replacement_annual',
						payment_intent: 'pi_super_retry'
					};
				}
			},
			subscriptions: {
				async retrieve(id) {
					if (id === 'sub_prior_active') {
						return { id, status: 'active' };
					}
					return {
						id,
						status: 'active',
						customer: 'cus_super_retry',
						latest_invoice: {
							id: 'in_super_retry',
							status: 'paid',
							paid: true,
							subscription: id,
							payment_intent: 'pi_super_retry'
						},
						metadata: {
							membership_flow: 'group_membership',
							membership_group_id: 'group_1',
							membership_user_id: 'user_1',
							membership_tier_id: 'tier_custom',
							membership_billing_type: 'recurring',
							membership_interval_unit: 'year',
							membership_amount_cents: '12000',
							membership_tier_price_id: 'price_custom_annual_12000'
						}
					};
				},
				async cancel(id) {
					cancelCalls += 1;
					if (failCancel) {
						throw new Error('Transient Stripe network failure');
					}
					return { id, status: 'canceled' };
				}
			}
		}
	});

	// 1. First finalize attempt fails to cancel sub_prior_active -> rolls back billing and preserves prior tier
	const firstAttempt = await finalizeMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { payment_intent_id: 'pi_super_retry' },
		fetchImpl: null
	});
	assert.equal(firstAttempt.ok, false);
	assert.equal(firstAttempt.status, 502);
	assert.equal(cancelCalls, 1);
	assert.equal(
		tables.group_membership_billing[0].stripe_subscription_id,
		'sub_prior_active',
		'prior subscription ID must not be lost when cancellation fails'
	);
	assert.equal(tables.group_memberships[0].tier_id, 'tier_supporter');
	assert.equal(tables.group_memberships[0].contribution_amount_cents, 500);

	// 2. Webhook invoice.paid also surfaces retryable failure while Stripe cancel is failing
	const failedWebhook = await handleMembershipStripeEvent({
		type: 'invoice.paid',
		account: 'acct_tbag',
		data: {
			object: {
				id: 'in_super_retry',
				status: 'paid',
				paid: true,
				subscription: 'sub_replacement_annual',
				customer: 'cus_super_retry'
			}
		}
	});
	assert.equal(failedWebhook.ok, false);
	assert.equal(failedWebhook.matched, true);
	assert.equal(failedWebhook.retryable, true);
	assert.equal(tables.group_membership_billing[0].stripe_subscription_id, 'sub_prior_active');
	assert.equal(tables.group_memberships[0].tier_id, 'tier_supporter');

	// 3. Once Stripe cancel recovers, retry succeeds cleanly and transitions billing + tier
	failCancel = false;
	const retryAttempt = await finalizeMembershipPaymentIntent({
		cookies: {},
		groupSlug: 'tempe-bicycle-action-group',
		payload: { payment_intent_id: 'pi_super_retry' },
		fetchImpl: null
	});
	assert.equal(retryAttempt.ok, true);
	assert.equal(retryAttempt.data.completed, true);
	assert.equal(tables.group_membership_billing[0].stripe_subscription_id, 'sub_replacement_annual');
	assert.equal(tables.group_memberships[0].tier_id, 'tier_custom');
	assert.equal(tables.group_memberships[0].interval_unit, 'year');
	assert.equal(tables.group_memberships[0].contribution_amount_cents, 12000);
});

test('membership page resets custom contribution inputs upon activation and uses shared client navigation helpers', () => {
	const svelteSource = readFileSync(
		new URL('../../routes/groups/[slug]/membership/+page.svelte', import.meta.url),
		'utf8'
	);

	assert.doesNotMatch(
		svelteSource,
		/from ['"]\$app\/navigation['"]/,
		'+page.svelte should import navigation helpers from #lib/client/navigation'
	);
	assert.match(
		svelteSource,
		/import\s*\{\s*refreshPageData,\s*replaceShallowState\s*\}\s*from\s*['"]#lib\/client\/navigation['"]/
	);
	assert.match(svelteSource, /function syncActivatedMembershipState\(/);
	assert.match(svelteSource, /customMonthlyInput\s*=\s*['"]['"]/);
	assert.match(svelteSource, /customAnnualInput\s*=\s*['"]['"]/);

	const syncCallMatches = svelteSource.match(/syncActivatedMembershipState\(/g) || [];
	assert.ok(
		syncCallMatches.length >= 6,
		`expected syncActivatedMembershipState definition + 5 activation call sites, found ${syncCallMatches.length}`
	);
});
