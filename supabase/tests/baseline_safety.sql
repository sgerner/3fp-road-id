begin;

-- 1. Verify post-migration state uses hardened private.create_profile_on_new_user()
-- and does not expose public.create_profile_on_new_user().
do $$
declare
	trigger_fn regproc;
begin
	if to_regprocedure('public.create_profile_on_new_user()') is not null then
		raise exception 'public.create_profile_on_new_user() must not remain in public schema after migrations';
	end if;

	if to_regprocedure('private.create_profile_on_new_user()') is null then
		raise exception 'private.create_profile_on_new_user() must exist after migrations';
	end if;

	select t.tgfoid::regproc
	into trigger_fn
	from pg_trigger t
	where t.tgrelid = 'auth.users'::regclass
		and t.tgname = 'new_user_profile_trigger'
		and not t.tgisinternal;

	if trigger_fn is distinct from 'private.create_profile_on_new_user'::regproc then
		raise exception 'Expected auth.users.new_user_profile_trigger to target private.create_profile_on_new_user, got %', trigger_fn;
	end if;
end $$;

-- 2. Simulate a non-empty production map.get_improvements() implementation.
create or replace function map.get_improvements()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, map, public
as $$
	select '[{"id": "prod-sentinel"}]'::jsonb;
$$;

-- 3. Re-execute baseline_pre_2025_schema.sql against the already-migrated database.
\i supabase/tests/baseline_pre_2025_schema.sql

-- 4. Verify neither map.get_improvements() nor auth.users.new_user_profile_trigger was overwritten.
do $$
declare
	improvements jsonb;
	fn_config text[];
	trigger_fn regproc;
begin
	select map.get_improvements() into improvements;
	if improvements <> '[{"id": "prod-sentinel"}]'::jsonb then
		raise exception 'baseline_pre_2025_schema.sql overwrote map.get_improvements(): got %', improvements;
	end if;

	select p.proconfig
	into fn_config
	from pg_proc p
	where p.oid = 'map.get_improvements()'::regprocedure;

	if fn_config is null or not ('search_path=pg_catalog, map, public' = any(fn_config)) then
		raise exception 'baseline_pre_2025_schema.sql lost map.get_improvements() search_path config: %', fn_config;
	end if;

	if to_regprocedure('public.create_profile_on_new_user()') is not null then
		raise exception 'baseline_pre_2025_schema.sql re-exposed public.create_profile_on_new_user()';
	end if;

	select t.tgfoid::regproc
	into trigger_fn
	from pg_trigger t
	where t.tgrelid = 'auth.users'::regclass
		and t.tgname = 'new_user_profile_trigger'
		and not t.tgisinternal;

	if trigger_fn is distinct from 'private.create_profile_on_new_user'::regproc then
		raise exception 'baseline_pre_2025_schema.sql reset auth.users.new_user_profile_trigger to %', trigger_fn;
	end if;
end $$;

rollback;
