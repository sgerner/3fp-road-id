import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;

test(
	'event host group authorization and sponsorship request RLS enforce co-host preservation and server-managed approvals',
	{ skip: !databaseUrl },
	() => {
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const name = `event_sponsorship_test_${process.pid}`;
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			});

		run(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		run(databaseUrl, `create database ${name}`);
		url.pathname = `/${name}`;

		try {
			const bootstrapSql = `
				create schema if not exists auth;
				create schema if not exists private;
				grant usage on schema public to anon, authenticated, service_role;
				grant usage on schema auth to anon, authenticated, service_role;

				create table auth.users (
					id uuid primary key,
					email text
				);

				create or replace function auth.uid()
				returns uuid
				language sql
				stable
				as $$
					select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
				$$;
				grant execute on function auth.uid() to anon, authenticated, service_role;

				create table public.profiles (
					user_id uuid primary key references auth.users(id) on delete cascade,
					email text,
					full_name text,
					admin boolean not null default false
				);
				grant select on public.profiles to anon, authenticated, service_role;

				create table public.groups (
					id uuid primary key,
					name text not null,
					slug text unique not null,
					microsite_slug text,
					city text,
					state_region text,
					is_published boolean not null default true
				);
				grant select on public.groups to anon, authenticated, service_role;

				create table public.group_members (
					group_id uuid not null references public.groups(id) on delete cascade,
					user_id uuid not null references auth.users(id) on delete cascade,
					role text not null,
					primary key (group_id, user_id)
				);
				grant select on public.group_members to authenticated, service_role;

				create or replace function public.is_site_admin()
				returns boolean
				language sql
				stable
				security invoker
				set search_path = public
				as $$
					select exists (
						select 1
						from public.profiles p
						where p.user_id = auth.uid()
							and p.admin = true
					);
				$$;
				grant execute on function public.is_site_admin() to anon, authenticated, service_role;

				create or replace function public.can_manage_group(target_group_id uuid)
				returns boolean
				language sql
				stable
				security definer
				set search_path = public
				as $$
					select exists (
						select 1
						from public.group_members gm
						where gm.group_id = target_group_id
							and gm.user_id = auth.uid()
							and gm.role in ('owner', 'admin')
					);
				$$;
				grant execute on function public.can_manage_group(uuid) to anon, authenticated, service_role;

				create table public.activity_events (
					id uuid primary key,
					activity_type text not null default 'ride',
					host_user_id uuid references auth.users(id),
					created_by_user_id uuid not null references auth.users(id),
					host_group_id uuid references public.groups(id),
					title text not null,
					slug text unique not null,
					status text not null default 'published',
					starts_at timestamptz not null,
					ends_at timestamptz not null,
					start_location_name text not null
				);

				create table public.activity_hosts (
					activity_event_id uuid not null references public.activity_events(id) on delete cascade,
					user_id uuid not null references auth.users(id) on delete cascade,
					primary key (activity_event_id, user_id)
				);

				create or replace function public.activity_is_published(target_activity_event_id uuid)
				returns boolean
				language sql
				stable
				security definer
				set search_path = public
				as $$
					select exists (
						select 1 from public.activity_events ae
						where ae.id = target_activity_event_id and ae.status = 'published'
					);
				$$;

				create or replace function public.can_manage_activity(target_activity_event_id uuid)
				returns boolean
				language sql
				stable
				security definer
				set search_path = public
				as $$
					select exists (
						select 1
						from public.activity_events ae
						where ae.id = target_activity_event_id
							and (
								ae.host_user_id = auth.uid()
								or ae.created_by_user_id = auth.uid()
								or exists (
									select 1 from public.activity_hosts ah
									where ah.activity_event_id = ae.id and ah.user_id = auth.uid()
								)
								or (ae.host_group_id is not null and public.can_manage_group(ae.host_group_id))
							)
					);
				$$;
				grant execute on function public.activity_is_published(uuid) to anon, authenticated, service_role;
				grant execute on function public.can_manage_activity(uuid) to anon, authenticated, service_role;

				alter table public.activity_events enable row level security;
				grant select, insert, update, delete on public.activity_events to authenticated;
				grant all on public.activity_events to service_role;
				grant select on public.activity_hosts to anon, authenticated, service_role;
				create policy activity_events_service_role_all on public.activity_events
					for all to service_role using (true) with check (true);
				create policy activity_events_select on public.activity_events
					for select using (public.activity_is_published(id) or public.can_manage_activity(id));
				create policy activity_events_update on public.activity_events
					for update using (public.can_manage_activity(id))
					with check (public.can_manage_activity(id));

				create table public.volunteer_events (
					id uuid primary key,
					host_user_id uuid references auth.users(id),
					created_by_user_id uuid not null references auth.users(id),
					host_group_id uuid references public.groups(id),
					title text not null,
					slug text unique not null,
					status text not null default 'published',
					event_start timestamptz not null,
					event_end timestamptz not null
				);

				create table public.volunteer_event_hosts (
					event_id uuid not null references public.volunteer_events(id) on delete cascade,
					user_id uuid not null references auth.users(id) on delete cascade,
					created_at timestamptz not null default now(),
					primary key (event_id, user_id)
				);

				alter table public.volunteer_events enable row level security;
				alter table public.volunteer_event_hosts enable row level security;
				grant select, insert, update, delete on public.volunteer_events to authenticated;
				grant all on public.volunteer_events to service_role;
				grant select, insert, update, delete on public.volunteer_event_hosts to authenticated;
				grant all on public.volunteer_event_hosts to service_role;
				create policy volunteer_events_service_role_all on public.volunteer_events
					for all to service_role using (true) with check (true);

				${fs.readFileSync('supabase/migrations/20261118180400_authorize_event_host_group_changes.sql', 'utf8')}
				${fs.readFileSync('supabase/migrations/20261122000000_support_event_sponsorship_requests.sql', 'utf8')}

				create policy volunteer_events_update on public.volunteer_events
					for update to authenticated
					using (public.can_manage_volunteer_event(id))
					with check (public.can_manage_volunteer_event(id));
			`;

			run(url.toString(), bootstrapSql);
			run(
				url.toString(),
				fs.readFileSync('supabase/tests/event_host_group_authorization.sql', 'utf8')
			);
		} finally {
			run(databaseUrl, `drop database ${name} with (force)`);
		}
	}
);
