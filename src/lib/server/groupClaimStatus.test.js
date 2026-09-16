import assert from 'node:assert/strict';
import test from 'node:test';
import { getGroupClaimStatus } from './groupClaimStatus.js';

function createSupabaseStub({ count = 0, error = null } = {}) {
	const calls = [];
	const builder = {
		select(columns, options) {
			calls.push({ method: 'select', columns, options });
			return this;
		},
		eq(column, value) {
			calls.push({ method: 'eq', column, value });
			return this;
		},
		then(resolve, reject) {
			return Promise.resolve({ count, error }).then(resolve, reject);
		}
	};

	return {
		calls,
		from(table) {
			assert.equal(table, 'group_members');
			return builder;
		}
	};
}

test('group claim status returns true only when an owner exists', async () => {
	const supabase = createSupabaseStub({ count: 1 });

	assert.equal(await getGroupClaimStatus(supabase, 'group_1'), true);
	assert.deepEqual(supabase.calls, [
		{ method: 'select', columns: 'user_id', options: { count: 'exact', head: true } },
		{ method: 'eq', column: 'group_id', value: 'group_1' },
		{ method: 'eq', column: 'role', value: 'owner' }
	]);
});

test('group claim status stays false for an unclaimed group', async () => {
	const supabase = createSupabaseStub({ count: 0 });

	assert.equal(await getGroupClaimStatus(supabase, 'group_1'), false);
});

test('group claim status is nullable when service access is unavailable', async () => {
	assert.equal(await getGroupClaimStatus(null, 'group_1'), null);
	assert.equal(await getGroupClaimStatus({}, null), null);
});

test('group claim status surfaces service query failures', async () => {
	const supabase = createSupabaseStub({ error: { message: 'query failed' } });

	await assert.rejects(() => getGroupClaimStatus(supabase, 'group_1'), /query failed/);
});
