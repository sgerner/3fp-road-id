import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;

test(
	'proximity RPC migrations apply cleanly and enforce 250-mile, 50-state, and overseas guards in PostgreSQL',
	{ skip: !databaseUrl },
	() => {
		if (!databaseUrl) return;
		const url = new URL(databaseUrl);
		assert.ok(
			['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
			'Use an isolated local PostgreSQL server.'
		);
		const databaseName = `proximity_rpc_test_${process.pid}`;
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			});

		run(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		run(databaseUrl, `create database ${databaseName};`);
		url.pathname = `/${databaseName}`;

		try {
			const root = path.resolve('supabase');
			const sql = [
				fs.readFileSync(path.join(root, 'tests/proximity_bootstrap.sql'), 'utf8'),
				...[
					'20260301100851_create_activity_and_ride_tables.sql',
					'20260303061834_add_ride_images.sql',
					'20260401090000_optimize_groups_search_and_filters.sql',
					'20261124035028_add_proximity_rpcs.sql'
				].map((name) => fs.readFileSync(path.join(root, 'migrations', name), 'utf8')),
				fs.readFileSync(path.join(root, 'tests/proximity_rpcs.sql'), 'utf8')
			].join('\n');

			assert.match(
				run(url.toString(), `set client_min_messages=warning;\n${sql}`),
				/proximity database checks passed/
			);
		} finally {
			run(databaseUrl, `drop database ${databaseName};`);
		}
	}
);
