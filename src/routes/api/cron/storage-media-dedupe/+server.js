import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

const RETENTION_DAYS = 21;

async function verifyCronRequest(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('storage_media_dedupe', providedSecret);
}

async function handleCron(request) {
	const verified = await verifyCronRequest(request);
	if (!verified) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Supabase service role is not configured.' }, { status: 500 });
	}

	const { data, error } = await supabase.rpc('cleanup_storage_media_assets', {
		retention_days: RETENTION_DAYS
	});

	if (error) {
		throw error;
	}

	return json({
		data: data || {
			refreshed: 0,
			deleted: 0,
			deleted_asset_rows: 0,
			reclaimed_bytes: 0,
			retention_days: RETENTION_DAYS,
			buckets: ['ride-media', 'group-social-media']
		}
	});
}

export async function GET({ request }) {
	return handleCron(request);
}

export async function POST({ request }) {
	return handleCron(request);
}
