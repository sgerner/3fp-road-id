import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import {
	autoMatchFeedItems,
	syncMercuryTransactions,
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

	for (const task of [
		['stripe_financial_connections', syncStripeFinancialConnectionsTransactions],
		['mercury', syncMercuryTransactions],
		['stripe', syncStripeTransactions]
	]) {
		const [key, fn] = task;
		try {
			result[key] = await fn(auth);
		} catch (error) {
			result.errors.push({ provider: key, message: error?.message || 'Sync failed.' });
		}
	}

	try {
		result.auto_match = await autoMatchFeedItems(auth);
	} catch (error) {
		result.errors.push({ provider: 'auto_match', message: error?.message || 'Auto-match failed.' });
	}

	return result;
}

export async function POST({ request }) {
	if (!(await isAuthorized(request))) return json({ error: 'Unauthorized' }, { status: 401 });
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return json({ error: 'Service role is not configured.' }, { status: 500 });

	const { data: groups, error } = await serviceSupabase
		.from('groups')
		.select('id,slug,name')
		.order('name', { ascending: true });
	if (error) return json({ error: error.message }, { status: 500 });

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
