import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;

test(
	'Learn catalog migration reclassifies safety guides and enforces admin/service-role BEFORE trigger semantics on PostgreSQL 17',
	{ skip: !databaseUrl },
	() => {
		if (!databaseUrl) return;
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const dbName = `learn_catalog_guard_test_${process.pid}`;

		/**
		 * @param {string} connection
		 * @param {string} sql
		 */
		const runSync = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			}).trim();

		/**
		 * @param {string} connection
		 * @param {string} sql
		 * @param {RegExp} pattern
		 */
		const assertSqlRejects = (connection, sql, pattern) => {
			assert.throws(
				() => runSync(connection, sql),
				/** @param {any} err */
				(err) => {
					const stderr = String(err?.stderr || err?.message || '');
					assert.match(stderr, pattern);
					return true;
				}
			);
		};

		runSync(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		runSync(databaseUrl, `create database ${dbName}`);
		url.pathname = `/${dbName}`;
		const testDbUrl = url.toString();

		const memberUser = '00000000-0000-0000-0000-0000000000c1';
		const adminUser = '00000000-0000-0000-0000-0000000000a9';
		const reportArticleId = '11111111-1111-4111-8111-111111111101';
		const crashArticleId = '11111111-1111-4111-8111-111111111102';
		const regularArticleId = '11111111-1111-4111-8111-111111111103';
		const reportChunkId = '22222222-2222-4222-8222-222222222201';
		const regularChunkId = '22222222-2222-4222-8222-222222222202';

		try {
			runSync(
				testDbUrl,
				`
				create schema if not exists auth;
				create table auth.users (id uuid primary key);
				create or replace function auth.uid() returns uuid language sql stable as $$
					select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
				$$;
				create or replace function auth.role() returns text language sql stable as $$
					select nullif(current_setting('request.jwt.claim.role', true), '');
				$$;
				grant usage on schema public, auth to anon, authenticated, service_role;

				create table public.profiles (
					user_id uuid primary key references auth.users (id) on delete cascade,
					admin boolean not null default false
				);

				create or replace function public.is_learn_admin()
				returns boolean
				language sql
				stable
				security definer
				set search_path = public, pg_temp
				as $$
					select exists (
						select 1
						from public.profiles
						where user_id = auth.uid()
							and admin = true
					);
				$$;
				grant execute on function public.is_learn_admin() to anon, authenticated, service_role;

				create table public.learn_articles (
					id uuid primary key default gen_random_uuid(),
					created_at timestamptz not null default timezone('utc', now()),
					updated_at timestamptz not null default timezone('utc', now()),
					created_by_user_id uuid not null references auth.users (id) on delete restrict,
					updated_by_user_id uuid not null references auth.users (id) on delete restrict,
					title text not null,
					slug text not null unique,
					summary text,
					body_markdown text not null default '',
					editor_mode text not null default 'wysiwyg',
					category_slug text not null default 'general',
					category_name text not null default 'General',
					subcategory_slug text,
					subcategory_name text,
					sort_order integer not null default 0,
					import_source_path text unique,
					cover_image_url text,
					reader_summary text,
					key_takeaways jsonb not null default '[]'::jsonb,
					is_published boolean not null default true,
					last_revision_number integer not null default 0,
					tags jsonb not null default '[]'::jsonb,
					audience jsonb not null default '[]'::jsonb,
					difficulty_level text not null default 'all-levels',
					ride_type text not null default 'mixed',
					geo_scope text not null default 'global',
					geo_city text,
					geo_state text,
					content_type text not null default 'reference',
					is_evergreen boolean not null default true,
					metadata_confidence numeric(4, 2) not null default 0.50,
					search_document tsvector,
					article_embedding text,
					search_updated_at timestamptz
				);

				create table public.learn_article_chunks (
					id uuid primary key default gen_random_uuid(),
					article_id uuid not null references public.learn_articles (id) on delete cascade,
					chunk_index integer not null,
					heading text,
					chunk_text text not null,
					chunk_chars integer not null default 0,
					tags jsonb not null default '[]'::jsonb,
					search_document tsvector,
					embedding text,
					created_by_user_id uuid references auth.users (id) on delete set null,
					updated_by_user_id uuid references auth.users (id) on delete set null,
					created_at timestamptz not null default timezone('utc', now()),
					updated_at timestamptz not null default timezone('utc', now()),
					constraint learn_article_chunks_article_chunk_unique unique (article_id, chunk_index)
				);

				alter table public.learn_articles enable row level security;
				alter table public.learn_article_chunks enable row level security;

				create policy learn_articles_select_public
					on public.learn_articles for select to anon, authenticated
					using (is_published = true or auth.uid() is not null);
				create policy learn_articles_insert_authenticated
					on public.learn_articles for insert to authenticated
					with check (
						auth.uid() is not null
						and created_by_user_id = auth.uid()
						and updated_by_user_id = auth.uid()
					);
				create policy learn_articles_update_authenticated
					on public.learn_articles for update to authenticated
					using (auth.uid() is not null)
					with check (auth.uid() is not null and updated_by_user_id = auth.uid());
				create policy learn_articles_delete_admin
					on public.learn_articles for delete to authenticated
					using (public.is_learn_admin());

				create policy learn_article_chunks_select_visible
					on public.learn_article_chunks for select to anon, authenticated
					using (
						exists (
							select 1 from public.learn_articles
							where id = article_id and (is_published = true or auth.uid() is not null)
						)
					);
				create policy learn_article_chunks_insert_authenticated
					on public.learn_article_chunks for insert to authenticated
					with check (auth.uid() is not null);
				create policy learn_article_chunks_update_authenticated
					on public.learn_article_chunks for update to authenticated
					using (auth.uid() is not null)
					with check (auth.uid() is not null);
				create policy learn_article_chunks_delete_authenticated
					on public.learn_article_chunks for delete to authenticated
					using (auth.uid() is not null);
				create policy learn_articles_service_role
					on public.learn_articles for all to service_role
					using (true) with check (true);
				create policy learn_article_chunks_service_role
					on public.learn_article_chunks for all to service_role
					using (true) with check (true);

				grant select on public.learn_articles, public.learn_article_chunks to anon;
				grant select, insert, update, delete on public.learn_articles, public.learn_article_chunks to authenticated;
				grant all on public.profiles, public.learn_articles, public.learn_article_chunks to service_role;

				insert into auth.users (id) values ('${memberUser}'), ('${adminUser}');
				insert into public.profiles (user_id, admin) values
					('${memberUser}', false),
					('${adminUser}', true);

				-- Seed pre-migration rows with stale content_type values
				insert into public.learn_articles (
					id, created_by_user_id, updated_by_user_id, title, slug, summary, body_markdown,
					category_slug, category_name, import_source_path, content_type
				) values
					(
						'${crashArticleId}', '${adminUser}', '${adminUser}',
						'Crash Response', 'crash-response', 'Steps to take after a bike crash.',
						'Move out of traffic.', 'safety-and-education', 'Safety & Education',
						'education/crash-response.md', 'toolkit'
					),
					(
						'${regularArticleId}', '${memberUser}', '${memberUser}',
						'Group Ride Checklist', 'group-ride-checklist', 'How to host a neighborhood ride.',
						'Bring spare tubes.', 'ride-organization', 'Ride Organization',
						'community/meetups.md', 'ride_guide'
					);

				${fs.readFileSync(
					'supabase/migrations/20261124041500_learn_search_reclassify_and_report_guard.sql',
					'utf8'
				)}
				`
			);

			// 1. Reclassification updates Crash Response to 'safety' and leaves unrelated articles untouched
			const typesAfterMigration = runSync(
				testDbUrl,
				`select slug || ':' || content_type from public.learn_articles order by slug;`
			);
			assert.equal(typesAfterMigration, 'crash-response:safety\ngroup-ride-checklist:ride_guide');

			// 2. Non-admin authenticated user cannot create the protected report article
			assertSqlRejects(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				insert into public.learn_articles (
					id, created_by_user_id, updated_by_user_id, title, slug, body_markdown
				) values (
					'${reportArticleId}', '${memberUser}', '${memberUser}',
					'Fake Report', 'safer-cycling-better-messages', 'Tampered'
				);
				commit;
				`,
				/managed from its authoritative report source/i
			);

			// 3. service_role can insert/sync the protected report article and its chunks
			runSync(
				testDbUrl,
				`
				begin;
				set local role service_role;
				set local "request.jwt.claim.role" = 'service_role';
				insert into public.learn_articles (
					id, created_by_user_id, updated_by_user_id, title, slug, summary, body_markdown,
					category_slug, category_name, import_source_path, content_type
				) values (
					'${reportArticleId}', '${adminUser}', '${adminUser}',
					'Safer Cycling, Better Messages', 'safer-cycling-better-messages',
					'Evidence-based passing and safety messaging report.',
					'## Overview\nPassing distance research.',
					'advocacy-and-policy', 'Advocacy & Policy',
					'src/lib/content/safetyReport.json', 'safety'
				);
				insert into public.learn_article_chunks (
					id, article_id, chunk_index, heading, chunk_text
				) values
					('${reportChunkId}', '${reportArticleId}', 0, 'Overview', 'Passing distance research.'),
					('${regularChunkId}', '${regularArticleId}', 0, 'Checklist', 'Bring spare tubes.');
				commit;
				`
			);

			// 4. Non-admin authenticated user cannot overwrite protected content, rename slug, or mutate/reassign chunks
			assertSqlRejects(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				update public.learn_articles
				set body_markdown = 'Tampered body', updated_by_user_id = '${memberUser}'
				where id = '${reportArticleId}';
				commit;
				`,
				/cannot be overwritten in the wiki editor/i
			);

			assertSqlRejects(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				update public.learn_article_chunks
				set article_id = '${regularArticleId}'
				where id = '${reportChunkId}';
				commit;
				`,
				/chunks are managed from the authoritative report source/i
			);

			assertSqlRejects(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				update public.learn_article_chunks
				set article_id = '${reportArticleId}', chunk_index = 9
				where id = '${regularChunkId}';
				commit;
				`,
				/chunks are managed from the authoritative report source/i
			);

			assertSqlRejects(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				delete from public.learn_article_chunks where id = '${reportChunkId}';
				commit;
				`,
				/chunks are managed from the authoritative report source/i
			);

			// 5. Non-admin authenticated user CAN adjust sort_order / subcategory placement on the protected entry
			const reordered = runSync(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${memberUser}';
				update public.learn_articles
				set sort_order = 4,
					subcategory_slug = 'safety-research',
					subcategory_name = 'Safety Research',
					updated_by_user_id = '${memberUser}'
				where id = '${reportArticleId}';
				commit;
				select sort_order || ':' || subcategory_slug from public.learn_articles where id = '${reportArticleId}';
				`
			);
			assert.equal(reordered, '4:safety-research');

			// 6. Learn admin (authenticated + is_learn_admin() = true) CAN edit and delete protected rows & chunks (including cascade)
			const adminEdited = runSync(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${adminUser}';
				update public.learn_articles
				set summary = 'Admin-verified summary.', updated_by_user_id = '${adminUser}'
				where id = '${reportArticleId}';
				update public.learn_article_chunks
				set chunk_text = 'Admin-verified chunk text.'
				where id = '${reportChunkId}';
				commit;
				select summary from public.learn_articles where id = '${reportArticleId}';
				`
			);
			assert.equal(adminEdited, 'Admin-verified summary.');

			const remainingAfterAdminDelete = runSync(
				testDbUrl,
				`
				begin;
				set local role authenticated;
				set local "request.jwt.claim.role" = 'authenticated';
				set local "request.jwt.claim.sub" = '${adminUser}';
				delete from public.learn_articles where id = '${reportArticleId}';
				commit;
				select
					(select count(*) from public.learn_articles where id = '${reportArticleId}') || ':' ||
					(select count(*) from public.learn_article_chunks where article_id = '${reportArticleId}');
				`
			);
			assert.equal(remainingAfterAdminDelete, '0:0');
		} finally {
			runSync(databaseUrl, `drop database if exists ${dbName} with (force)`);
		}
	}
);
