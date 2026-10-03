import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;
test(
	'accounting migrations preserve ledger integrity and privacy in PostgreSQL',
	{ skip: !databaseUrl },
	async () => {
		const url = new URL(databaseUrl);
		assert.ok(
			['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
			'Use an isolated local PostgreSQL server.'
		);
		const databaseName = `accounting_audit_test_${process.pid}`;
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			});
		run(databaseUrl, `create database ${databaseName};`);
		url.pathname = `/${databaseName}`;
		try {
			const root = path.resolve('supabase');
			const sql = [
				fs.readFileSync(path.join(root, 'tests/group_accounting_bootstrap.sql'), 'utf8'),
				...[
					'20260609010000_create_group_accounting_module.sql',
					'20260609020000_extend_group_accounting_production_features.sql',
					'20261002134250_harden_group_accounting_integrity_20261002.sql',
					'20261002134256_enforce_accounting_snapshot_visibility_20261002.sql',
					'20261002134257_atomic_accounting_workflows_20261002.sql',
					'20261003024701_monitor_group_accounting_provider_sync.sql',
					'20261003025416_group_accounting_followup_20261002.sql',
					'20261003030447_guard_accounting_statement_order.sql',
					'20261003160000_auto_post_mercury_internal_transfers.sql'
				].map((name) => fs.readFileSync(path.join(root, 'migrations', name), 'utf8')),
				fs.readFileSync(path.join(root, 'tests/group_accounting_integrity.sql'), 'utf8'),
				fs.readFileSync(path.join(root, 'tests/group_accounting_sync_integrity.sql'), 'utf8'),
				fs.readFileSync(path.join(root, 'tests/group_accounting_mercury_transfers.sql'), 'utf8')
			].join('\n');
			assert.match(
				run(url.toString(), `set client_min_messages=warning;\n${sql}`),
				/accounting database checks passed/
			);
			const setup = `
		insert into groups values('00000000-0000-0000-0000-000000000001','Concurrency','concurrency');
		insert into group_accounting_accounts(id,group_id,code,name,kind,subtype,normal_side,display_group) values
		('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','1000','Bank','asset','bank','debit','Cash'),
		('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','4000','Income','income','donations','credit','Income');
		select group_accounting_post_entry('00000000-0000-0000-0000-000000000001',
		'{"entry_date":"2026-01-01","entry_type":"income","description":"Concurrent reversal test","source":"test","source_id":"original"}',
		'[{"account_id":"00000000-0000-0000-0000-000000000002","debit_cents":100,"credit_cents":0},{"account_id":"00000000-0000-0000-0000-000000000003","debit_cents":0,"credit_cents":100}]');`;
			run(url.toString(), setup);
			assert.throws(
				() =>
					run(
						url.toString(),
						`insert into group_accounting_entries(group_id,entry_date,entry_type,description) values('00000000-0000-0000-0000-000000000001','2026-04-01','income','Orphan header');`
					),
				/balanced lines/
			);
			assert.throws(
				() =>
					run(
						url.toString(),
						`update group_accounting_lines set debit_cents=101 where account_id='00000000-0000-0000-0000-000000000002';`
					),
				/balanced lines/
			);
			const reverse = `select group_accounting_post_entry('00000000-0000-0000-0000-000000000001',
		jsonb_build_object('entry_date','2026-02-01','entry_type','journal','source','reversal','description','Concurrent reversal','metadata',
		jsonb_build_object('reverses_entry_id',(select id from group_accounting_entries where source='test' and source_id='original'))),
		'[{"account_id":"00000000-0000-0000-0000-000000000002","debit_cents":0,"credit_cents":100},{"account_id":"00000000-0000-0000-0000-000000000003","debit_cents":100,"credit_cents":0}]');`;
			const runConcurrent = () =>
				new Promise((resolve, reject) => {
					const child = execFile(
						'psql',
						[url.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-q'],
						(error, stdout) => (error ? reject(error) : resolve(stdout))
					);
					child.stdin.end(reverse);
				});
			const concurrent = await Promise.allSettled([runConcurrent(), runConcurrent()]);
			assert.equal(
				concurrent.filter((result) => result.status === 'fulfilled').length,
				1,
				'Only one concurrent reversal may commit.'
			);
			assert.match(
				run(
					url.toString(),
					`select count(*) as reversal_count from group_accounting_entries where group_id='00000000-0000-0000-0000-000000000001' and source='reversal';`
				),
				/1/
			);
		} finally {
			run(databaseUrl, `drop database ${databaseName};`);
		}
	}
);
