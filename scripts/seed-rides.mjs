import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
	DEFAULT_CREATED_BY_USER_ID,
	importRideSeedData,
	parseRideSeedJson
} from '../src/lib/server/ride-imports.js';

const DEFAULT_SOURCE_PATH = path.resolve('docs/seed_rides.json');

function parseArgs(argv) {
	const options = {
		source: DEFAULT_SOURCE_PATH,
		limit: null,
		eventId: null,
		slugPrefix: '',
		createdByUserId: DEFAULT_CREATED_BY_USER_ID,
		publish: true,
		dryRun: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--source' && next) {
			options.source = path.resolve(next);
			index += 1;
			continue;
		}
		if (arg === '--limit' && next) {
			options.limit = Number.parseInt(next, 10);
			index += 1;
			continue;
		}
		if (arg === '--event-id' && next) {
			options.eventId = next;
			index += 1;
			continue;
		}
		if (arg === '--slug-prefix' && next) {
			options.slugPrefix = next;
			index += 1;
			continue;
		}
		if (arg === '--created-by-user-id' && next) {
			options.createdByUserId = next;
			index += 1;
			continue;
		}
		if (arg === '--draft') {
			options.publish = false;
			continue;
		}
		if (arg === '--dry-run') {
			options.dryRun = true;
			continue;
		}
		if (arg === '--help') {
			console.log(`Usage: node scripts/seed-rides.mjs [options]

Options:
  --source <path>               Source JSON file (default: docs/seed_rides.json)
  --event-id <id>               Seed only one source event id
  --limit <n>                   Seed at most n events after filtering
  --slug-prefix <prefix>        Prefix all generated slugs
  --created-by-user-id <uuid>   Organizer user id for inserted rides
  --draft                       Insert rides as draft instead of published
  --dry-run                     Print mapped records without writing
  --help                        Show this message`);
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

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
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

async function main() {
	loadEnvFile(path.resolve('.env'));
	const options = parseArgs(process.argv.slice(2));
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
	if (!supabaseUrl) throw new Error('Missing required environment variable: PUBLIC_SUPABASE_URL');
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey) throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
	const supabase = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const source = parseRideSeedJson(fs.readFileSync(options.source, 'utf8'));
	const result = await importRideSeedData(supabase, source, options);
	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
