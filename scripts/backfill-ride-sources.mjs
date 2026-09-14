import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { importBtwPhxCalendar } from '../src/lib/server/btwphx-imports.js';
import { importMeetupRoadCyclingTopic } from '../src/lib/server/meetup-topic-imports.js';
import { importWeeklyRidesFeed } from '../src/lib/server/weeklyrides-imports.js';

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCHES = 200;

function loadEnvFile(envPath) {
	if (!fs.existsSync(envPath)) return;
	const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		let value = trimmed.slice(eqIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

function parseArgs(argv) {
	const options = {
		batchSize: DEFAULT_BATCH_SIZE,
		source: 'all'
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--batch-size' && next) {
			options.batchSize = Math.min(50, Math.max(1, Number.parseInt(next, 10) || 0));
			index += 1;
			continue;
		}
		if (arg === '--source' && next) {
			options.source = next.toLowerCase();
			index += 1;
			continue;
		}
		if (arg === '--help') {
			console.log(`Usage: node scripts/backfill-ride-sources.mjs [options]

Options:
  --source <name>       all, btwphx, weeklyrides, or meetup-road-cycling
  --batch-size <n>      Records per write batch (default: ${DEFAULT_BATCH_SIZE})
  --help                Show this message`);
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

function getSourceConfigs() {
	return {
		btwphx: {
			label: 'BTWPHX',
			importer: importBtwPhxCalendar,
			options: { requireGeocoding: false, skipGeocoding: false }
		},
		weeklyrides: {
			label: 'WeeklyRides',
			importer: importWeeklyRidesFeed,
			options: { requireGeocoding: false, skipGeocoding: false }
		},
		'meetup-road-cycling': {
			label: 'Meetup Road Cycling',
			importer: importMeetupRoadCyclingTopic,
			options: {
				requireGeocoding: false,
				skipGeocoding: true,
				groupFetchConcurrency: 10
			}
		}
	};
}

function count(result, key) {
	return Array.isArray(result?.[key]) ? result[key].length : 0;
}

async function runImportBatches(supabase, config, batchSize) {
	let inserted = 0;
	let skippedEquivalent = 0;
	let skippedGeocoding = 0;
	let batches = 0;

	for (; batches < MAX_BATCHES; batches += 1) {
		const result = await config.importer(supabase, {
			...config.options,
			onlyNew: true,
			publish: true,
			skipImageUpload: false,
			reconcileMissingImages: false,
			limit: batchSize
		});
		const batchInserted = count(result, 'inserted');
		const batchEquivalent = count(result, 'skippedEquivalent');
		const batchGeocoding = count(result, 'skippedGeocoding');
		inserted += batchInserted;
		skippedEquivalent += batchEquivalent;
		skippedGeocoding += batchGeocoding;
		console.log(
			`${config.label} import batch ${batches + 1}: candidates=${result.candidateEventCount ?? 0}, inserted=${batchInserted}, equivalent=${batchEquivalent}, geocodeSkipped=${batchGeocoding}`
		);

		if (!result.candidateEventCount) break;
		if (!batchInserted) {
			console.warn(
				`${config.label} import stopped because the batch produced no new source records.`
			);
			break;
		}
	}

	return { batches, inserted, skippedEquivalent, skippedGeocoding };
}

async function runMaintenanceBatches(supabase, config, task, batchSize) {
	let reconciledImages = 0;
	let coordinatesUpdated = 0;
	let skippedGeocoding = 0;
	let batches = 0;

	for (; batches < MAX_BATCHES; batches += 1) {
		const result = await config.importer(supabase, {
			...config.options,
			onlyNew: false,
			publish: true,
			maintenance: task,
			limit: batchSize,
			requireGeocoding: task === 'geocoding',
			skipGeocoding: task !== 'geocoding',
			skipImageUpload: task !== 'images'
		});
		const batchImages = count(result, 'reconciledImages');
		const batchCoordinates = count(result, 'coordinatesUpdated');
		const batchGeocoding = count(result, 'skippedGeocoding');
		reconciledImages += batchImages;
		coordinatesUpdated += batchCoordinates;
		skippedGeocoding += batchGeocoding;
		console.log(
			`${config.label} ${task} batch ${batches + 1}: candidates=${result.candidateEventCount ?? 0}, images=${batchImages}, coordinates=${batchCoordinates}, geocodeSkipped=${batchGeocoding}`
		);

		if (!result.candidateEventCount) break;
		if (!batchImages && !batchCoordinates) {
			console.warn(`${config.label} ${task} stopped because the batch made no progress.`);
			break;
		}
	}

	return { batches, reconciledImages, coordinatesUpdated, skippedGeocoding };
}

async function main() {
	loadEnvFile(path.resolve('.env'));
	const options = parseArgs(process.argv.slice(2));
	const configs = getSourceConfigs();
	const sourceNames =
		options.source === 'all'
			? Object.keys(configs)
			: [options.source === 'meetup' ? 'meetup-road-cycling' : options.source];
	for (const sourceName of sourceNames) {
		if (!configs[sourceName]) throw new Error(`Unknown source: ${options.source}`);
	}

	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
	if (!supabaseUrl) throw new Error('Missing required environment variable: PUBLIC_SUPABASE_URL');
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey)
		throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
	const supabase = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const summary = {};
	for (const sourceName of sourceNames) {
		const config = configs[sourceName];
		const imported = await runImportBatches(supabase, config, options.batchSize);
		const images = await runMaintenanceBatches(supabase, config, 'images', options.batchSize);
		const geocoding = await runMaintenanceBatches(supabase, config, 'geocoding', options.batchSize);
		summary[sourceName] = { imported, images, geocoding };
	}

	console.log(JSON.stringify({ batchSize: options.batchSize, summary }, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
