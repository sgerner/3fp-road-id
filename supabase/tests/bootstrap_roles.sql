-- Cluster-wide roles required by local database fixtures. Never run in production.
begin;

-- Advisory locks are scoped to the connected database, so every fixture runner
-- must use the shared base database URL before creating its isolated database.
select pg_advisory_xact_lock(301202611);

do $$ begin
	if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
	if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
	if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

commit;
