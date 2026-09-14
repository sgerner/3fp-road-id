import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { importWeeklyRidesFeed } from '$lib/server/weeklyrides-imports';
import { importBtwPhxCalendar } from '$lib/server/btwphx-imports';
import { importMeetupRoadCyclingTopic } from '$lib/server/meetup-topic-imports';

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 50;
const SOURCE_ALIASES = new Map([
	['weeklyrides', 'weeklyrides'],
	['btwphx', 'btwphx'],
	['meetup', 'meetup-road-cycling'],
	['meetup-road-cycling', 'meetup-road-cycling'],
	['meetup_road_cycling', 'meetup-road-cycling']
]);

async function enforceCronSecret(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret');

	const verified = await getCronSecretVerifier('rides_import_weeklyrides', providedSecret || '');
	if (!verified) return json({ error: 'Unauthorized cron request' }, { status: 401 });
	return null;
}

function parsePositiveInteger(value, fallback) {
	const parsed = Number.parseInt(String(value ?? '').trim(), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, MAX_BATCH_SIZE);
}

function parseBoolean(value, fallback = false) {
	const normalized = String(value || '')
		.trim()
		.toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function parseRequest(query) {
	const source = SOURCE_ALIASES.get((query.get('source') || '').trim().toLowerCase());
	const maintenance = (query.get('task') || query.get('maintenance') || '').trim().toLowerCase();
	const limit = parsePositiveInteger(query.get('limit'), DEFAULT_BATCH_SIZE);
	const dryRun = parseBoolean(query.get('dry_run') ?? query.get('dryRun'));
	return { source, maintenance, limit, dryRun };
}

async function handleMaintenance(event) {
	const unauthorized = await enforceCronSecret(event.request);
	if (unauthorized) return unauthorized;

	const supabase = createServiceSupabaseClient();
	if (!supabase) return json({ error: 'Ride maintenance is not configured.' }, { status: 500 });

	const { source, maintenance, limit, dryRun } = parseRequest(event.url.searchParams);
	if (!source || !['images', 'geocoding'].includes(maintenance)) {
		return json(
			{
				error: 'Provide a valid source and maintenance task (images or geocoding).'
			},
			{ status: 400 }
		);
	}
	if (
		maintenance === 'geocoding' &&
		!['btwphx', 'weeklyrides', 'meetup-road-cycling'].includes(source)
	) {
		return json(
			{ error: 'Geocoding maintenance is not supported for the requested source.' },
			{ status: 400 }
		);
	}

	try {
		const options = {
			dryRun,
			onlyNew: false,
			publish: true,
			maintenance,
			limit,
			requireGeocoding: maintenance === 'geocoding'
		};
		let result;
		if (source === 'weeklyrides') {
			result = await importWeeklyRidesFeed(supabase, options);
		} else if (source === 'btwphx') {
			result = await importBtwPhxCalendar(supabase, options);
		} else {
			result = await importMeetupRoadCyclingTopic(supabase, {
				...options,
				skipGeocoding: maintenance !== 'geocoding',
				groupFetchConcurrency: 10
			});
		}

		return json({
			data: result,
			meta: { source, maintenance, limit, dryRun }
		});
	} catch (error) {
		console.error('Unable to run ride maintenance', error);
		return json({ error: error?.message || 'Unable to run ride maintenance.' }, { status: 500 });
	}
}

export const GET = handleMaintenance;
export const POST = handleMaintenance;
