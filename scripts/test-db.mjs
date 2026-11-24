import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_EXCLUDED_CONTAINERS =
	'studio,edge-runtime,logflare,vector,imgproxy,mailpit,realtime,supavisor,postgres-meta';
const LOCAL_WORKDIR = path.resolve('.cache/supabase-local');
const SYNTHETIC_BASELINE_VERSION = '00000000000000';
const SYNTHETIC_BASELINE_FILENAME = `${SYNTHETIC_BASELINE_VERSION}_baseline_pre_2025_schema.sql`;

const TRANSACTIONAL_SUITES = [
	'supabase/tests/baseline_safety.sql',
	'supabase/tests/ride_rsvp_privacy.sql',
	'supabase/tests/event_host_group_authorization.sql',
	'supabase/tests/activity_participant_rpc_grants.sql'
];

const ACCOUNTING_SUITES = [
	'supabase/tests/group_accounting_integrity.sql',
	'supabase/tests/group_accounting_sync_integrity.sql',
	'supabase/tests/group_accounting_mercury_transfers.sql',
	'supabase/tests/group_accounting_receipts.sql',
	'supabase/tests/group_accounting_statement_reconciliation.sql'
];

const dbUrl =
	process.env.SUPABASE_DB_URL || process.env.ACCOUNTING_TEST_DATABASE_URL || DEFAULT_DB_URL;
const parsedUrl = new URL(dbUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)) {
	throw new Error(`Refusing to run SQL test suites against non-local host: ${parsedUrl.hostname}`);
}

const startOnly = process.argv.includes('--start-only');
const stopOnly = process.argv.includes('--stop');
const skipReset = process.argv.includes('--skip-reset');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function prepareLocalSupabaseWorkdir() {
	const supabaseDir = path.join(LOCAL_WORKDIR, 'supabase');
	const migrationsDir = path.join(supabaseDir, 'migrations');
	fs.rmSync(migrationsDir, { recursive: true, force: true });
	fs.mkdirSync(migrationsDir, { recursive: true });

	fs.copyFileSync(path.resolve('supabase/config.toml'), path.join(supabaseDir, 'config.toml'));
	fs.copyFileSync(
		path.resolve('supabase/tests/baseline_pre_2025_schema.sql'),
		path.join(migrationsDir, SYNTHETIC_BASELINE_FILENAME)
	);

	const repoMigrationsDir = path.resolve('supabase/migrations');
	for (const entry of fs.readdirSync(repoMigrationsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
		fs.copyFileSync(path.join(repoMigrationsDir, entry.name), path.join(migrationsDir, entry.name));
	}
}

/**
 * @param {string} connectionUrl
 */
function isDatabaseReachable(connectionUrl) {
	try {
		execFileSync('psql', [connectionUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', 'select 1;'], {
			stdio: 'ignore'
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string[]} args
 */
function runSupabaseCli(args) {
	prepareLocalSupabaseWorkdir();
	execFileSync(npxBin, ['supabase', '--workdir', LOCAL_WORKDIR, ...args], {
		stdio: 'inherit'
	});
}

/**
 * @param {string} connectionUrl
 */
function pruneSyntheticBaselineMigrationRecord(connectionUrl) {
	execFileSync(
		'psql',
		[
			connectionUrl,
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-q',
			'-c',
			`delete from supabase_migrations.schema_migrations where version = '${SYNTHETIC_BASELINE_VERSION}';`
		],
		{ stdio: 'ignore' }
	);
}

/**
 * @param {string} connectionUrl
 * @param {string} relativeFilePath
 * @param {{ wrapInTransaction?: boolean }} [options]
 */
function runSqlSuite(connectionUrl, relativeFilePath, { wrapInTransaction = false } = {}) {
	const absolutePath = path.resolve(relativeFilePath);
	const rawSql = fs.readFileSync(absolutePath, 'utf8');
	const sql = wrapInTransaction
		? `begin;\nset local client_min_messages = warning;\n${rawSql}\nrollback;\n`
		: `set client_min_messages = warning;\n${rawSql}`;

	execFileSync('psql', [connectionUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
		input: sql,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'inherit']
	});
	console.log(`✔ ${relativeFilePath}`);
}

if (stopOnly) {
	runSupabaseCli(['stop']);
	process.exit(0);
}

if (!isDatabaseReachable(dbUrl)) {
	console.log('Starting minimal local Supabase containers...');
	runSupabaseCli(['start', '-x', SUPABASE_EXCLUDED_CONTAINERS]);
	pruneSyntheticBaselineMigrationRecord(dbUrl);
} else if (!startOnly && !skipReset) {
	console.log('Resetting local Supabase database across all migrations...');
	runSupabaseCli(['db', 'reset']);
	pruneSyntheticBaselineMigrationRecord(dbUrl);
}

if (startOnly) {
	console.log('Local Supabase stack is ready.');
	process.exit(0);
}

for (const suite of TRANSACTIONAL_SUITES) {
	runSqlSuite(dbUrl, suite);
}

for (const suite of ACCOUNTING_SUITES) {
	runSqlSuite(dbUrl, suite, { wrapInTransaction: true });
}

console.log(
	`All ${TRANSACTIONAL_SUITES.length + ACCOUNTING_SUITES.length} Supabase SQL suites passed.`
);
