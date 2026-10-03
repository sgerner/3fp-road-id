import { randomUUID } from 'node:crypto';

const PROVIDER_NAMES = {
	mercury: 'Mercury',
	stripe: 'Stripe',
	stripe_financial_connections: 'Linked bank accounts'
};

const SAFE_ERRORS = {
	connection_setup: 'This provider connection is not configured yet.',
	credentials_missing: 'The provider credentials are not configured for this group.',
	provider_auth: 'The provider rejected its credentials. Review the connection settings.',
	relay_auth:
		'The Mercury relay rejected the signed request. An administrator must review the relay configuration.',
	relay_access:
		'Mercury relay access was rejected without a confirmed upstream response. An administrator must review the relay endpoint.',
	provider_permission:
		'The provider denied access to this account. Reconnect the account or review its permissions.',
	provider_rate_limited: 'The provider rate limited this sync. It will retry automatically.',
	provider_unavailable:
		'The provider is temporarily unavailable. This sync will retry automatically.',
	provider_refresh_pending:
		'The provider is refreshing transaction data. Imported activity will update when the refresh completes.',
	provider_refresh_failed:
		'The provider could not refresh transaction data. The previous imported data is still available.',
	sync_in_progress: 'A sync for this provider is already in progress.',
	sync_backoff: 'This provider is waiting before its next automatic retry.',
	sync_failed: 'The provider sync failed. It will retry automatically.'
};

export function providerSyncBackoffMs(consecutiveFailures) {
	const failures = Math.max(1, Math.floor(Number(consecutiveFailures) || 1));
	return Math.min(5 * 60_000 * 2 ** Math.min(failures - 1, 8), 24 * 60 * 60_000);
}

export function sanitizeProviderSyncError(error, provider) {
	const name = String(error?.name || '');
	const type = String(error?.type || '');
	const code = String(error?.code || '');
	const message = String(error?.message || '');
	const status = Number(error?.statusCode || error?.status || error?.httpStatus || 0);
	const signal = `${name} ${type} ${code} ${message}`.toLowerCase();

	if (Object.hasOwn(SAFE_ERRORS, code)) return { code, message: SAFE_ERRORS[code] };
	let errorCode = 'sync_failed';
	if (/api key is not configured|credentials are not configured/.test(signal)) {
		errorCode = 'credentials_missing';
	} else if (
		/no .*(accounts|donations|connection).*(linked|connected|configured)|before linking bank|not configured yet/.test(
			signal
		)
	) {
		errorCode = 'connection_setup';
	} else if (status === 401 || /authenticationerror|invalid api key|unauthorized/.test(signal)) {
		errorCode = 'provider_auth';
	} else if (
		status === 403 ||
		/account_invalid|permissionerror|permission denied|not authorized|forbidden/.test(signal)
	) {
		errorCode = 'provider_permission';
	} else if (status === 429 || /ratelimit|rate limit|too many requests/.test(signal)) {
		errorCode = 'provider_rate_limited';
	} else if (
		status >= 500 ||
		/timeout|timed out|econnreset|enotfound|temporarily unavailable|networkerror/.test(signal)
	) {
		errorCode = 'provider_unavailable';
	} else if (/refresh.*pending|pending.*refresh/.test(signal)) {
		errorCode = 'provider_refresh_pending';
	} else if (/refresh.*failed|failed.*refresh/.test(signal)) {
		errorCode = 'provider_refresh_failed';
	}

	const providerName = PROVIDER_NAMES[provider] || 'Bank provider';
	let safeMessage = SAFE_ERRORS[errorCode];
	if (errorCode === 'connection_setup') {
		safeMessage = `${providerName} is not connected for this group.`;
	} else if (errorCode === 'credentials_missing' && provider === 'mercury') {
		safeMessage = 'A Mercury API key is not configured for this group.';
	}
	return { code: errorCode, message: safeMessage };
}

export async function beginProviderSyncRun(auth, provider, options = {}) {
	const trigger = ['cron', 'webhook', 'manual', 'system'].includes(options.trigger)
		? options.trigger
		: 'manual';
	const runId = randomUUID();
	const { data, error } = await auth.serviceSupabase.rpc('claim_group_accounting_provider_sync', {
		p_group_id: auth.group.id,
		p_provider: provider,
		p_run_id: runId,
		p_trigger: trigger,
		p_force: options.force ?? trigger !== 'cron',
		p_lease_seconds: options.leaseSeconds ?? 600
	});
	if (error) throw new Error('Unable to start provider sync monitoring.');
	return data && typeof data === 'object' ? data : { acquired: false, reason: 'sync_failed' };
}

export async function finishProviderSyncRun(auth, runId, status, result = {}, failure = null) {
	const reportedFailure =
		failure ||
		(result.error_code
			? {
					code: result.error_code,
					message: result.error_message || SAFE_ERRORS[result.error_code] || ''
				}
			: null);
	const safeFailure = reportedFailure
		? sanitizeProviderSyncError(reportedFailure, result.provider)
		: { code: null, message: null };
	const { data, error } = await auth.serviceSupabase.rpc('finish_group_accounting_provider_sync', {
		p_run_id: runId,
		p_status: status,
		p_inserted_count: Math.max(0, Number(result.inserted) || 0),
		p_updated_count: Math.max(0, Number(result.updated) || 0),
		p_correction_count: Math.max(0, Number(result.corrections) || 0),
		p_skipped_count: Math.max(0, Number(result.skipped) || 0),
		p_error_code: safeFailure.code,
		p_error_message: safeFailure.message
	});
	if (error) throw new Error('Unable to record provider sync status.');
	return data;
}

export async function withProviderSync(auth, provider, options, sync) {
	const started = await beginProviderSyncRun(auth, provider, options);
	if (!started.acquired) {
		const skipCode = started.reason === 'backoff' ? 'sync_backoff' : 'sync_in_progress';
		return {
			inserted: 0,
			updated: 0,
			corrections: 0,
			skipped: 0,
			sync_status: 'skipped',
			skip_reason: skipCode,
			next_sync_at: started.next_sync_at || null,
			message: SAFE_ERRORS[skipCode]
		};
	}

	try {
		const result = (await sync()) || {};
		const status = ['pending', 'partial'].includes(result.sync_status)
			? result.sync_status
			: 'succeeded';
		await finishProviderSyncRun(auth, started.run_id || started.runId, status, {
			...result,
			provider
		});
		return { ...result, sync_status: status };
	} catch (error) {
		const safeFailure = sanitizeProviderSyncError(error, provider);
		try {
			await finishProviderSyncRun(
				auth,
				started.run_id || started.runId,
				'failed',
				{ provider },
				error
			);
		} catch {
			// Preserve the provider failure; monitoring failures never expose provider details.
		}
		const safeError = new Error(safeFailure.message);
		safeError.code = safeFailure.code;
		throw safeError;
	}
}
