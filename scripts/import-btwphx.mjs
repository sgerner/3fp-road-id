import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_CREATED_BY_USER_ID } from '../src/lib/server/ride-imports.js';
import { importBtwPhxCalendar } from '../src/lib/server/btwphx-imports.js';

function parseArgs(argv) {
	const options = {
		createdByUserId: DEFAULT_CREATED_BY_USER_ID,
		publish: true,
		dryRun: false,
		onlyNew: true,
		requireGeocoding: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];

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
		if (arg === '--all') {
			options.onlyNew = false;
			continue;
		}
		if (arg === '--require-geocoding') {
			options.requireGeocoding = true;
			continue;
		}
		if (arg === '--allow-missing-geocode') {
			options.requireGeocoding = false;
			continue;
		}
		if (arg === '--help') {
			console.log(`Usage: node scripts/import-btwphx.mjs [options]

Options:
  --created-by-user-id <uuid>   Organizer user id for inserted rides
  --draft                       Insert rides as draft instead of published
  --dry-run                     Parse and map source without writing to the database
  --all                         Import all events (ignore pre-filter by existing source_event_id)
  --require-geocoding           Require geocoding
  --allow-missing-geocode       Allow imports when geocoding fails (default)
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
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
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
	if (!serviceKey)
		throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');

	const supabase = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const result = await importBtwPhxCalendar(supabase, options);
	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
