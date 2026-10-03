import assert from 'node:assert/strict';
import test from 'node:test';
import {
	sanitizeProviderSyncError,
	providerSyncBackoffMs,
	withProviderSync
} from './groupAccountingSync.js';

test('provider failures expose safe messages and preserve known error classifications', () => {
	const secret = 'sk_live_secret_do_not_expose';
	for (const error of [
		{ message: `Invalid API key ${secret}`, statusCode: 401 },
		{ message: `key ${secret} cannot access account`, code: 'account_invalid' },
		{ message: secret, statusCode: 503 }
	]) {
		const result = sanitizeProviderSyncError(error, 'stripe');
		assert.ok(!result.message.includes(secret));
		assert.notEqual(result.code, 'sync_failed');
	}
	assert.equal(
		sanitizeProviderSyncError({ code: 'provider_refresh_pending', message: secret }, 'stripe').code,
		'provider_refresh_pending'
	);
	assert.equal(sanitizeProviderSyncError({ message: secret }, 'mercury').code, 'sync_failed');
	assert.equal(
		sanitizeProviderSyncError({ code: 'relay_auth', message: secret, httpStatus: 401 }, 'mercury')
			.code,
		'relay_auth'
	);
	assert.equal(
		sanitizeProviderSyncError({ code: 'relay_access', message: secret, httpStatus: 401 }, 'mercury')
			.code,
		'relay_access'
	);
	for (const [httpStatus, expected] of [
		[401, 'provider_auth'],
		[403, 'provider_permission'],
		[429, 'provider_rate_limited'],
		[503, 'provider_unavailable']
	]) {
		const result = sanitizeProviderSyncError({ message: secret, httpStatus }, 'mercury');
		assert.equal(result.code, expected);
		assert.ok(!result.message.includes(secret));
	}
	assert.equal(providerSyncBackoffMs(1), 300000);
	assert.ok(providerSyncBackoffMs(100) <= 86400000);
});

test('provider leases prevent duplicate fetches and success is recorded only after the fetch finishes', async () => {
	const calls = [];
	const auth = {
		group: { id: 'group' },
		serviceSupabase: {
			async rpc(name, args) {
				calls.push([name, args]);
				return {
					data: name.startsWith('claim') ? { acquired: true, run_id: 'run' } : { recorded: true },
					error: null
				};
			}
		}
	};
	const result = await withProviderSync(auth, 'stripe', { trigger: 'cron' }, async () => {
		assert.equal(calls.length, 1);
		return { inserted: 2 };
	});
	assert.equal(result.sync_status, 'succeeded');
	assert.equal(calls[1][1].p_status, 'succeeded');
	assert.equal(calls[1][1].p_inserted_count, 2);
	auth.serviceSupabase.rpc = async () => ({
		data: { acquired: false, reason: 'backoff' },
		error: null
	});
	const skipped = await withProviderSync(auth, 'stripe', { trigger: 'cron' }, () => {
		throw Error('must not fetch');
	});
	assert.equal(skipped.skip_reason, 'sync_backoff');
});
