import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { importWeeklyRidesFeed } from '$lib/server/weeklyrides-imports';
import { importBtwPhxCalendar } from '$lib/server/btwphx-imports';

async function enforceCronSecret(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret');

	const verified = await getCronSecretVerifier('rides_import_weeklyrides', providedSecret || '');
	if (!verified) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	return null;
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

function parseSources(query) {
	const raw = query.get('source') ?? query.get('sources') ?? 'all';
	const requested = raw
		.split(',')
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	if (!requested.length || requested.includes('all')) return ['weeklyrides', 'btwphx'];
	return Array.from(new Set(requested)).filter((source) =>
		['weeklyrides', 'btwphx'].includes(source)
	);
}

async function handleCron(event) {
	const unauthorized = await enforceCronSecret(event.request);
	if (unauthorized) return unauthorized;

	const supabase = createServiceSupabaseClient();
	if (!supabase) return json({ error: 'Ride import is not configured.' }, { status: 500 });

	const query = event.url.searchParams;
	const dryRun = parseBoolean(query.get('dry_run') ?? query.get('dryRun'), false);
	const onlyNew = parseBoolean(query.get('only_new') ?? query.get('onlyNew'), true);
	const publish = parseBoolean(query.get('publish'), true);
	const sources = parseSources(query);
	if (!sources.length) {
		return json(
			{
				error: 'No valid import sources requested.',
				meta: { requestedSource: query.get('source') ?? query.get('sources') ?? null }
			},
			{ status: 400 }
		);
	}

	try {
		const result = {};
		const errors = [];

		if (sources.includes('weeklyrides')) {
			try {
				result.weeklyrides = await importWeeklyRidesFeed(supabase, {
					dryRun,
					onlyNew,
					publish
				});
			} catch (error) {
				errors.push({
					source: 'weeklyrides',
					error: error?.message || 'Unable to import WeeklyRides feed.'
				});
			}
		}

		if (sources.includes('btwphx')) {
			try {
				result.btwphx = await importBtwPhxCalendar(supabase, {
					dryRun,
					onlyNew,
					publish
				});
			} catch (error) {
				errors.push({
					source: 'btwphx',
					error: error?.message || 'Unable to import BTWPHX events.'
				});
			}
		}

		if (errors.length) {
			return json(
				{
					error: 'One or more source imports failed.',
					errors,
					data: result,
					meta: {
						dryRun,
						onlyNew,
						publish,
						sources
					}
				},
				{ status: 500 }
			);
		}

		return json({
			data: result,
			meta: {
				dryRun,
				onlyNew,
				publish,
				sources
			}
		});
	} catch (error) {
		console.error('Unable to import rides feed sources', error);
		return json(
			{
				error: error?.message || 'Unable to import ride sources.'
			},
			{ status: 500 }
		);
	}
}

export const GET = handleCron;
export const POST = handleCron;
