import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { geocodeLocation } from '../src/lib/server/ride-imports.js';
import { inferGeocodeCountryCodeFromLocation } from '../src/lib/server/weeklyrides-imports.js';

const WEEKLYRIDES_SOURCE_PATTERN = 'https://www.weeklyrides.com/%';
const DEFAULT_SLEEP_MS = 250;
const IN_CLAUSE_CHUNK_SIZE = 40;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAmbiguousLocation(location) {
	const normalized = safeTrim(location).toLowerCase();
	if (!normalized) return true;
	if (normalized === 'tbd') return true;
	if (normalized.startsWith('tbd,')) return true;
	if (normalized.includes('to be determined')) return true;
	if (normalized.includes('unknown')) return true;
	return false;
}

function chunk(values, size) {
	const chunks = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function parseArgs(argv) {
	const options = {
		dryRun: false,
		limit: null,
		sleepMs: DEFAULT_SLEEP_MS,
		force: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--dry-run') {
			options.dryRun = true;
			continue;
		}
		if (arg === '--force') {
			options.force = true;
			continue;
		}
		if (arg === '--limit' && next) {
			options.limit = Math.max(1, Number.parseInt(next, 10) || 0) || null;
			index += 1;
			continue;
		}
		if (arg === '--sleep-ms' && next) {
			options.sleepMs = Math.max(0, Number.parseInt(next, 10) || 0);
			index += 1;
			continue;
		}
		if (arg === '--help') {
			console.log(`Usage: node scripts/geocode-weeklyrides-imported.mjs [options]

Options:
  --dry-run         Compute geocodes without writing to database
  --force           Re-geocode all weeklyrides rows even if coords already exist
  --limit <n>       Process only first n unique addresses
  --sleep-ms <n>    Delay between geocode requests (default: 250ms)
  --help            Show this message`);
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

async function loadWeeklyridesRows(supabase) {
	const rows = [];
	let from = 0;
	const pageSize = 500;
	while (true) {
		const to = from + pageSize - 1;
		const { data, error } = await supabase
			.from('activity_events')
			.select('id,title,source_event_id,start_location_address,start_latitude,start_longitude')
			.ilike('source_event_id', WEEKLYRIDES_SOURCE_PATTERN)
			.order('created_at', { ascending: true })
			.range(from, to);
		if (error) throw error;
		const batch = data || [];
		rows.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}
	return rows;
}

async function updateCoordinates(supabase, ids, latitude, longitude, dryRun) {
	if (dryRun || !ids.length) return;
	for (const idChunk of chunk(ids, IN_CLAUSE_CHUNK_SIZE)) {
		const { error } = await supabase
			.from('activity_events')
			.update({
				start_latitude: latitude,
				start_longitude: longitude,
				updated_at: new Date().toISOString()
			})
			.in('id', idChunk);
		if (error) throw error;
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

	const rows = await loadWeeklyridesRows(supabase);
	const byAddress = new Map();
	for (const row of rows) {
		const address = safeTrim(row.start_location_address);
		if (!address) continue;
		if (!byAddress.has(address)) byAddress.set(address, []);
		byAddress.get(address)?.push(row);
	}

	let addresses = Array.from(byAddress.keys());
	if (Number.isInteger(options.limit) && options.limit > 0) {
		addresses = addresses.slice(0, options.limit);
	}

	let processedAddresses = 0;
	let geocodedAddresses = 0;
	let skippedAmbiguous = 0;
	let failedAddresses = 0;
	let updatedRows = 0;

	for (const address of addresses) {
		processedAddresses += 1;
		const rowsForAddress = byAddress.get(address) || [];
		if (!rowsForAddress.length) continue;
		if (isAmbiguousLocation(address)) {
			skippedAmbiguous += 1;
			continue;
		}

		const allHaveCoordinates = rowsForAddress.every((row) => {
			const lat = Number(row.start_latitude);
			const lng = Number(row.start_longitude);
			return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
		});
		if (!options.force && allHaveCoordinates) continue;

		const countryCodes = inferGeocodeCountryCodeFromLocation(address);
		const match = await geocodeLocation(address, { countryCodes, limit: 1 });
		if (!match) {
			failedAddresses += 1;
			if (options.sleepMs > 0) await sleep(options.sleepMs);
			continue;
		}

		await updateCoordinates(
			supabase,
			rowsForAddress.map((row) => row.id),
			match.latitude,
			match.longitude,
			options.dryRun
		);
		geocodedAddresses += 1;
		updatedRows += rowsForAddress.length;

		if (options.sleepMs > 0) await sleep(options.sleepMs);
	}

	console.log(
		JSON.stringify(
			{
				totalRows: rows.length,
				uniqueAddresses: byAddress.size,
				processedAddresses,
				geocodedAddresses,
				skippedAmbiguous,
				failedAddresses,
				updatedRows,
				dryRun: options.dryRun,
				force: options.force
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
