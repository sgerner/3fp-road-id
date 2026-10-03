import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { syncAllBankTransactions } from '$lib/server/groupAccounting';

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
	try {
		return {
			group_id: group.id,
			...(await syncAllBankTransactions(
				{ group, userId: null, serviceSupabase },
				{ trigger: 'cron' }
			))
		};
	} catch {
		return {
			group_id: group.id,
			ok: false,
			sync_status: 'failed',
			errors: ['Unable to complete accounting sync.']
		};
	}
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

	const ok = results.every((result) => result.ok === true);
	return json({ ok, groups: results.length, results }, { status: ok ? 200 : 502 });
}
