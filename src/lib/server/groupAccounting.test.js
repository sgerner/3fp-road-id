import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGroupStripeConnection } from './groupStripeConnection.js';

function createSupabaseStub(donationAccount) {
	return {
		from(table) {
			assert.equal(table, 'donation_accounts');
			const filters = {};
			return {
				select(columns) {
					assert.equal(columns, 'stripe_account_id, charges_enabled');
					return this;
				},
				eq(column, value) {
					filters[column] = value;
					return this;
				},
				maybeSingle() {
					assert.equal(filters.group_id, 'group_1');
					return { data: donationAccount, error: null };
				}
			};
		}
	};
}

test('loadGroupStripeConnection reports a linked Stripe account', async () => {
	const connection = await loadGroupStripeConnection({
		group: { id: 'group_1' },
		serviceSupabase: createSupabaseStub({
			stripe_account_id: 'acct_123',
			charges_enabled: true
		})
	});

	assert.deepEqual(connection, {
		connected: true,
		charges_enabled: true,
		stripe_account_id: 'acct_123'
	});
});

test('loadGroupStripeConnection reports an unlinked group as disconnected', async () => {
	const connection = await loadGroupStripeConnection({
		group: { id: 'group_1' },
		serviceSupabase: createSupabaseStub(null)
	});

	assert.deepEqual(connection, {
		connected: false,
		charges_enabled: false,
		stripe_account_id: null
	});
});
