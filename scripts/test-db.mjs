import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_EXCLUDED_CONTAINERS =
	'studio,edge-runtime,logflare,vector,imgproxy,mailpit,realtime,supavisor,postgres-meta';

const TRANSACTIONAL_SUITES = [
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

const skipReset = process.argv.includes('--skip-reset');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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

function runSupabaseCli(args) {
	execFileSync(npxBin, ['supabase', ...args], {
		stdio: 'inherit'
	});
}

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

if (!isDatabaseReachable(dbUrl)) {
	console.log('Starting minimal local Supabase containers...');
	runSupabaseCli(['start', '-x', SUPABASE_EXCLUDED_CONTAINERS]);
} else if (!skipReset) {
	console.log('Resetting local Supabase database across all migrations...');
	runSupabaseCli(['db', 'reset']);
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
