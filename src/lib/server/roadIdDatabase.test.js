import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;

test(
	'Road ID claim RPC atomically creates emergency profiles, serializes concurrent claims, preserves overrides, and enforces RLS',
	{ skip: !databaseUrl },
	async () => {
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const dbName = `road_id_claim_test_${process.pid}`;

		const runSync = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			}).trim();

		const runAsync = async (connection, sql) => {
			const { stdout } = await execFileAsync(
				'psql',
				[connection, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'],
				{
					encoding: 'utf8',
					maxBuffer: 1024 * 1024
				}
			);
			return stdout.trim();
		};

		runSync(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		runSync(databaseUrl, `create database ${dbName}`);
		url.pathname = `/${dbName}`;
		const testDbUrl = url.toString();

		const userA = '00000000-0000-0000-0000-0000000000a1';
		const userB = '00000000-0000-0000-0000-0000000000b2';

		try {
			runSync(
				testDbUrl,
				`
				create schema if not exists auth;
				create table auth.users (id uuid primary key);
				create or replace function auth.uid() returns uuid language sql stable as $$
					select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
				$$;
				grant usage on schema public, auth to anon, authenticated, service_role;

				create table public.profiles (
					user_id uuid primary key references auth.users(id) on delete cascade,
					full_name text,
					phone text
				);

				create table public.road_id_profiles (
					user_id uuid primary key references auth.users(id) on delete cascade,
					full_name text,
					phone text,
					blood_type text,
					allergies text,
					medication text,
					created_at timestamptz default now()
				);

				create table public.qr_codes (
					code text primary key,
					profile_id uuid references auth.users(id),
					created_at timestamptz default now(),
					constraint qr_codes_road_id_profile_fk
						foreign key (profile_id) references public.road_id_profiles(user_id)
				);

				create table public.emergency_contacts (
					id bigserial primary key,
					profile_id uuid not null references public.road_id_profiles(user_id) on delete cascade,
					contact_name text not null,
					contact_phone text not null,
					contact_relationship text,
					created_at timestamptz default now()
				);

				alter table public.road_id_profiles enable row level security;
				alter table public.emergency_contacts enable row level security;
				alter table public.qr_codes enable row level security;

				-- Start from the legacy {public} policies (20260610014550) and the revoked
				-- table/sequence privileges (20260915130000 + 20260915131500) before running
				-- the Road ID migrations under test.
				create policy road_id_profiles_select on public.road_id_profiles
					for select using (auth.uid() = user_id);
				create policy road_id_profiles_insert on public.road_id_profiles
					for insert with check (auth.uid() = user_id);
				create policy road_id_profiles_update on public.road_id_profiles
					for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
				create policy road_id_profiles_delete on public.road_id_profiles
					for delete using (auth.uid() = user_id);

				create policy emergency_contacts_select on public.emergency_contacts
					for select using (
						exists (
							select 1 from public.road_id_profiles rp
							where rp.user_id = profile_id and rp.user_id = auth.uid()
						)
					);
				create policy emergency_contacts_insert on public.emergency_contacts
					for insert with check (
						exists (
							select 1 from public.road_id_profiles rp
							where rp.user_id = profile_id and rp.user_id = auth.uid()
						)
					);
				create policy emergency_contacts_update on public.emergency_contacts
					for update using (
						exists (
							select 1 from public.road_id_profiles rp
							where rp.user_id = profile_id and rp.user_id = auth.uid()
						)
					) with check (
						exists (
							select 1 from public.road_id_profiles rp
							where rp.user_id = profile_id and rp.user_id = auth.uid()
						)
					);
				create policy emergency_contacts_delete on public.emergency_contacts
					for delete using (
						exists (
							select 1 from public.road_id_profiles rp
							where rp.user_id = profile_id and rp.user_id = auth.uid()
						)
					);
				create policy qr_codes_select on public.qr_codes
					for select using (profile_id = auth.uid());

				revoke insert, update, delete, truncate, references, trigger
					on table public.road_id_profiles, public.emergency_contacts, public.qr_codes
					from anon, authenticated, public;
				revoke all on all sequences in schema public from anon, authenticated, public;
				grant all on public.road_id_profiles, public.emergency_contacts, public.qr_codes, public.profiles to service_role;

				insert into auth.users (id) values ('${userA}'), ('${userB}');
				insert into public.profiles (user_id, full_name, phone) values
					('${userA}', 'Maya Chen', '+14805550101'),
					('${userB}', 'Jordan Diaz', '+16025550102');
				insert into public.qr_codes (code) values ('BAND0001'), ('RACECODE'), ('SPARE002');

				${fs.readFileSync('supabase/migrations/20261121200000_unify_road_id_profile_claims.sql', 'utf8')}
				${fs.readFileSync('supabase/migrations/20261124033000_grant_authenticated_road_id_writes.sql', 'utf8')}
				`
			);

			// 1. Atomic claim seeds road_id_profiles from profiles and binds qr_codes in one transaction
			const firstClaim = runSync(
				testDbUrl,
				`set role service_role; select status || ':' || code || ':' || profile_id from public.claim_road_id_code('BAND0001', '${userA}');`
			);
			assert.equal(firstClaim, `claimed:BAND0001:${userA}`);

			const seededProfile = runSync(
				testDbUrl,
				`select full_name || '|' || phone from public.road_id_profiles where user_id = '${userA}';`
			);
			assert.equal(seededProfile, 'Maya Chen|+14805550101');

			// Idempotent retry by same owner returns already_owned
			const retrySameOwner = runSync(
				testDbUrl,
				`set role service_role; select status from public.claim_road_id_code('BAND0001', '${userA}');`
			);
			assert.equal(retrySameOwner, 'already_owned');

			// 2. Concurrent claims for the same unclaimed code serialize via FOR UPDATE
			const runConcurrentSql = (sql) =>
				new Promise((resolve, reject) => {
					const child = execFile(
						'psql',
						[testDbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'],
						{ encoding: 'utf8' },
						(err, stdout, stderr) => {
							if (err) reject(new Error(stderr || err.message));
							else resolve(stdout.trim());
						}
					);
					child.stdin.end(sql);
				});

			const [res1, res2] = await Promise.all([
				runConcurrentSql(
					`begin; set local role service_role; select status from public.claim_road_id_code('RACECODE', '${userA}'); select pg_sleep(0.25); commit;`
				),
				runConcurrentSql(
					`select pg_sleep(0.05); begin; set local role service_role; select status from public.claim_road_id_code('RACECODE', '${userB}'); commit;`
				)
			]);

			const outcomes = [
				res1.split('\n').filter(Boolean)[0],
				res2.split('\n').filter(Boolean)[0]
			].sort();
			assert.deepEqual(outcomes, ['claimed', 'conflict']);

			const raceWinner = runSync(
				testDbUrl,
				`select profile_id from public.qr_codes where code = 'RACECODE';`
			);
			assert.equal(raceWinner, userA);
			void runAsync;

			// 3. Emergency overrides are preserved when claiming additional bracelets
			runSync(
				testDbUrl,
				`update public.road_id_profiles set full_name = 'Maya L. Chen', phone = '+14805559999' where user_id = '${userA}';`
			);
			const spareClaim = runSync(
				testDbUrl,
				`set role service_role; select status from public.claim_road_id_code('SPARE002', '${userA}');`
			);
			assert.equal(spareClaim, 'claimed');

			const preservedOverrides = runSync(
				testDbUrl,
				`select full_name || '|' || phone from public.road_id_profiles where user_id = '${userA}';`
			);
			assert.equal(preservedOverrides, 'Maya L. Chen|+14805559999');

			// 4. Unlinking works only for the owner and keeps road_id_profiles + other codes intact
			const wrongUnlink = runSync(
				testDbUrl,
				`set role service_role; select public.unlink_road_id_code('BAND0001', '${userB}');`
			);
			assert.equal(wrongUnlink, 'f');

			const ownerUnlink = runSync(
				testDbUrl,
				`set role service_role; select public.unlink_road_id_code('BAND0001', '${userA}');`
			);
			assert.equal(ownerUnlink, 't');

			const remainingCodes = runSync(
				testDbUrl,
				`select string_agg(code, ',' order by code) from public.qr_codes where profile_id = '${userA}';`
			);
			assert.equal(remainingCodes, 'RACECODE,SPARE002');

			// 5. Authenticated role cannot call service-role RPCs or mutate qr_codes directly,
			//    and RLS scopes qr_codes SELECT to the owner.
			assert.throws(
				() =>
					runSync(
						testDbUrl,
						`set role authenticated; select public.claim_road_id_code('BAND0001', '${userB}');`
					),
				/permission denied/i
			);
			assert.throws(
				() =>
					runSync(
						testDbUrl,
						`set role authenticated; update public.qr_codes set profile_id = '${userB}' where code = 'BAND0001';`
					),
				/permission denied/i
			);

			const visibleToA = runSync(
				testDbUrl,
				`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userA}', true); select count(*) from public.qr_codes; commit;`
			);
			assert.equal(visibleToA.split('\n').at(-1), '2');

			const visibleToB = runSync(
				testDbUrl,
				`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userB}', true); select count(*) from public.qr_codes; commit;`
			);
			assert.equal(visibleToB.split('\n').at(-1), '0');

			// 6. Authenticated role has full owner-scoped CRUD on road_id_profiles and emergency_contacts
			//    (including sequence usage for zero-bracelet riders), while cross-user writes and anon fail.
			const unscopedPolicies = runSync(
				testDbUrl,
				`select coalesce(string_agg(policyname, ',' order by policyname), '') from pg_policies where schemaname = 'public' and tablename in ('road_id_profiles', 'emergency_contacts', 'qr_codes') and not ('authenticated' = any (roles) and cardinality(roles) = 1);`
			);
			assert.equal(unscopedPolicies, '');

			const userBCrud = runSync(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				select set_config('request.jwt.claim.sub', '${userB}', true);
				insert into public.road_id_profiles (user_id, full_name, phone, blood_type, allergies, medication)
				values ('${userB}', 'Jordan Diaz', '+16025550102', 'O+', 'Latex', 'Aspirin')
				on conflict (user_id) do update
				set blood_type = excluded.blood_type,
				    allergies = excluded.allergies,
				    medication = excluded.medication;
				insert into public.emergency_contacts (profile_id, contact_name, contact_phone, contact_relationship)
				values ('${userB}', 'Sam Diaz', '+16025550199', 'Spouse');
				update public.emergency_contacts
				set contact_phone = '+16025550188'
				where profile_id = '${userB}';
				select blood_type || '|' || (select contact_name || ':' || contact_phone from public.emergency_contacts where profile_id = '${userB}')
				from public.road_id_profiles
				where user_id = '${userB}';
				commit;
				`
			);
			assert.equal(userBCrud.split('\n').at(-1), 'O+|Sam Diaz:+16025550188');

			// User A cannot see or insert contacts for User B
			const crossUserVisible = runSync(
				testDbUrl,
				`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userA}', true); select count(*) from public.emergency_contacts where profile_id = '${userB}'; commit;`
			);
			assert.equal(crossUserVisible.split('\n').at(-1), '0');

			assert.throws(
				() =>
					runSync(
						testDbUrl,
						`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userA}', true); insert into public.emergency_contacts (profile_id, contact_name, contact_phone) values ('${userB}', 'Intruder', '+14805550000'); commit;`
					),
				/row-level security/i
			);

			const userBDeleted = runSync(
				testDbUrl,
				`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userB}', true); delete from public.emergency_contacts where profile_id = '${userB}'; select count(*) from public.emergency_contacts where profile_id = '${userB}'; commit;`
			);
			assert.equal(userBDeleted.split('\n').at(-1), '0');

			assert.throws(
				() => runSync(testDbUrl, `set role anon; select count(*) from public.road_id_profiles;`),
				/permission denied/i
			);
			assert.throws(
				() => runSync(testDbUrl, `set role anon; select count(*) from public.emergency_contacts;`),
				/permission denied/i
			);
			assert.throws(
				() => runSync(testDbUrl, `set role anon; select count(*) from public.qr_codes;`),
				/permission denied/i
			);
		} finally {
			runSync(databaseUrl, `drop database if exists ${dbName} with (force)`);
		}
	}
);
