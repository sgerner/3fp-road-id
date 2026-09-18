-- Read-only postflight check for the PostGIS schema remediation documented in
-- docs/supabase-postgis-security.md. Run in the SQL Editor or with psql.
-- Passing means PostGIS and spatial_ref_sys are absent, or both live outside
-- public. This does not modify extension-owned objects.

do $verify_postgis_schema$
declare
  postgis_schema text;
  spatial_ref_exists boolean;
begin
  select n.nspname
    into postgis_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'postgis';

  if postgis_schema = 'public' then
    raise exception 'PostGIS is still installed in public';
  end if;

  if to_regclass('public.spatial_ref_sys') is not null then
    raise exception 'spatial_ref_sys is still present in public';
  end if;

  if postgis_schema is not null then
    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = postgis_schema
        and c.relname = 'spatial_ref_sys'
        and c.relkind in ('r', 'p')
    )
      into spatial_ref_exists;

    if not spatial_ref_exists then
      raise exception
        'PostGIS is installed in %, but spatial_ref_sys is not there',
        postgis_schema;
    end if;
  else
    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relname = 'spatial_ref_sys'
        and c.relkind in ('r', 'p')
    )
      into spatial_ref_exists;

    if spatial_ref_exists then
      raise exception
        'spatial_ref_sys exists, but the PostGIS extension is not installed';
    end if;
  end if;

end;
$verify_postgis_schema$;

select
  e.extname,
  e.extversion,
  n.nspname as extension_schema,
  c.relname as spatial_ref_sys,
  c.relrowsecurity as rls_enabled
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
left join pg_class c
  on c.relnamespace = n.oid
 and c.relname = 'spatial_ref_sys'
 and c.relkind in ('r', 'p')
where e.extname = 'postgis';
