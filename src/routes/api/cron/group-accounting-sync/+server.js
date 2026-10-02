import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import {
	autoMatchFeedItems,
	syncStripeFinancialConnectionsTransactions,
	syncStripeTransactions
} from '$lib/server/groupAccounting';

async function isAuthorized(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-cron-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('group_accounting_sync', providedSecret);
}

async function syncGroup(serviceSupabase, group) {
	const auth = {
		group,
		userId: null,
		serviceSupabase
	};
	const result = {
		group_id: group.id,
		stripe_financial_connections: null,
		mercury: null,
		stripe: null,
		auto_match: null,
		errors: []
	};
	const { data: settings, error: settingsError } = await serviceSupabase
		.from('group_accounting_settings')
		.select('enabled')
		.eq('group_id', group.id)
		.maybeSingle();
	if (settingsError) {
		result.errors.push({ provider: 'settings', message: settingsError.message });
		return result;
	}
	if (settings?.enabled !== true) return result;

	const [
		{ data: connections, error: connectionsError },
		{ data: donationAccount, error: donationError }
	] = await Promise.all([
		serviceSupabase
			.from('group_accounting_bank_connections')
			.select('provider,status,config')
			.eq('group_id', group.id),
		serviceSupabase
			.from('donation_accounts')
			.select('stripe_account_id')
			.eq('group_id', group.id)
			.maybeSingle()
	]);
	if (connectionsError) {
		result.errors.push({ provider: 'connections', message: connectionsError.message });
		return result;
	}
	if (donationError) {
		result.errors.push({ provider: 'stripe', message: donationError.message });
	}
	const hasStripeFinancialConnections = (connections ?? []).some(
		(connection) =>
			connection.provider === 'stripe_financial_connections' &&
			connection.status === 'connected' &&
			Array.isArray(connection.config?.account_ids) &&
			connection.config.account_ids.length > 0
	);
	const stripeBalanceConnection = (connections ?? []).find(
		(connection) => connection.provider === 'stripe'
	);

	const tasks = [];
	if (hasStripeFinancialConnections) {
		tasks.push(['stripe_financial_connections', syncStripeFinancialConnectionsTransactions]);
	}
	if (donationAccount?.stripe_account_id && stripeBalanceConnection?.status !== 'disabled') {
		tasks.push(['stripe', syncStripeTransactions]);
	}

	for (const task of tasks) {
		const [key, fn] = task;
		try {
			result[key] = await fn(auth);
		} catch (error) {
			result.errors.push({ provider: key, message: error?.message || 'Sync failed.' });
		}
	}

	if (tasks.length) {
		try {
			result.auto_match = await autoMatchFeedItems(auth);
		} catch (error) {
			result.errors.push({
				provider: 'auto_match',
				message: error?.message || 'Auto-match failed.'
			});
		}
	}

	return result;
}

export async function POST({ request }) {
	if (!(await isAuthorized(request))) return json({ error: 'Unauthorized' }, { status: 401 });
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return json({ error: 'Service role is not configured.' }, { status: 500 });

	const groups = [];
	const pageSize = 500;
	for (let offset = 0; ; offset += pageSize) {
		const { data: settings, error: settingsError } = await serviceSupabase
			.from('group_accounting_settings')
			.select('group_id')
			.eq('enabled', true)
			.order('group_id', { ascending: true })
			.range(offset, offset + pageSize - 1);
		if (settingsError) return json({ error: settingsError.message }, { status: 500 });
		const groupIds = (settings ?? []).map((setting) => setting.group_id).filter(Boolean);
		if (groupIds.length) {
			const { data: groupRows, error: groupError } = await serviceSupabase
				.from('groups')
				.select('id,slug,name')
				.in('id', groupIds);
			if (groupError) return json({ error: groupError.message }, { status: 500 });
			groups.push(...(groupRows ?? []));
		}
		if ((settings ?? []).length < pageSize) break;
	}
	groups.sort((left, right) => left.name.localeCompare(right.name));

	const results = [];
	for (const group of groups ?? []) {
		results.push(await syncGroup(serviceSupabase, group));
	}

	return json({
		ok: true,
		groups: results.length,
		results
	});
}
