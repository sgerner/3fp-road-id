import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;
test(
	'Stripe sharing is restricted to the organization and its own 3 Feet Please tenant',
	{ skip: !databaseUrl },
	() => {
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const name = `stripe_ownership_test_${process.pid}`;
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			});
		run(databaseUrl, `create database ${name}`);
		url.pathname = `/${name}`;
		try {
			run(
				url.toString(),
				`create table groups(id uuid primary key,slug text unique);
   create table donation_accounts(id text primary key,recipient_type text,group_id uuid unique references groups(id),stripe_account_id text unique);
   insert into groups values ('00000000-0000-0000-0000-000000000001','3-feet-please'),('00000000-0000-0000-0000-000000000002','other'),('00000000-0000-0000-0000-000000000003','third');
   ${fs.readFileSync('supabase/migrations/20261002215520_tenant_stripe_account_ownership.sql', 'utf8')}
   ${fs.readFileSync('supabase/migrations/20261003025417_guard_shared_stripe_account_identity.sql', 'utf8')}
   insert into donation_accounts values ('main','organization',null,'acct_primary');
   insert into donation_accounts values ('primary-group','group','00000000-0000-0000-0000-000000000001','acct_primary');
   insert into donation_accounts values ('other-group','group','00000000-0000-0000-0000-000000000002','acct_other');`
			);
			assert.throws(
				() =>
					run(
						url.toString(),
						`update donation_accounts set stripe_account_id='acct_primary' where id='other-group';`
					),
				/Each group must connect/
			);
			assert.throws(
				() =>
					run(
						url.toString(),
						`insert into donation_accounts values ('third','group','00000000-0000-0000-0000-000000000003','acct_other');`
					),
				/duplicate key/
			);
			assert.throws(
				() =>
					run(
						url.toString(),
						`update donation_accounts set stripe_account_id='acct_other' where id='main';`
					),
				/organization can share/
			);
			assert.throws(
				() => run(url.toString(), `update groups set slug='renamed' where slug='3-feet-please';`),
				/Disconnect the shared/
			);
			assert.throws(
				() =>
					run(
						url.toString(),
						`update donation_accounts set id='other-organization' where id='main'`
					),
				/organization can share/
			);
			run(
				url.toString(),
				`update donation_accounts set stripe_account_id=null where id='primary-group'; update groups set slug='renamed' where slug='3-feet-please';`
			);
		} finally {
			run(databaseUrl, `drop database ${name} with (force)`);
		}
	}
);
