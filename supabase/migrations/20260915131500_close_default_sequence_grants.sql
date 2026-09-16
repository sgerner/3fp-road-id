-- Keep future migrations from recreating broad browser DML/sequence grants,
-- and remove the remaining public access to sequences that are not used by a
-- browser-write path.

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, public;
alter default privileges for role postgres in schema storage
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, public;
alter default privileges for role postgres in schema storage
  revoke all on sequences from anon, authenticated, public;

revoke all on all sequences in schema public from anon, authenticated, public;

do $sequence_grants$
declare
  sequence_row record;
begin
  for sequence_row in
    select distinct
      seq_ns.nspname as sequence_schema,
      seq.relname as sequence_name,
      bool_or(
        'anon' = any (p.roles)
        or 'public' = any (p.roles)
      ) as allow_anon
    from pg_class seq
    join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
    join pg_depend dep
      on dep.objid = seq.oid
     and dep.classid = 'pg_class'::regclass
     and dep.deptype in ('a', 'i')
    join pg_class table_rel on table_rel.oid = dep.refobjid
    join pg_namespace table_ns on table_ns.oid = table_rel.relnamespace
    join pg_policies p
      on p.schemaname = table_ns.nspname
     and p.tablename = table_rel.relname
    where seq.relkind = 'S'
      and seq_ns.nspname = 'public'
      and table_ns.nspname = 'public'
      and table_rel.relkind in ('r', 'p')
      and p.cmd in ('INSERT', 'ALL')
      and (
        'authenticated' = any (p.roles)
        or 'anon' = any (p.roles)
        or 'public' = any (p.roles)
      )
      and coalesce(p.with_check, 'true') <> 'false'
    group by seq_ns.nspname, seq.relname
  loop
    execute format(
      'grant usage, select on sequence %I.%I to authenticated',
      sequence_row.sequence_schema,
      sequence_row.sequence_name
    );
    if sequence_row.allow_anon then
      execute format(
        'grant usage, select on sequence %I.%I to anon',
        sequence_row.sequence_schema,
        sequence_row.sequence_name
      );
    end if;
  end loop;
end
$sequence_grants$;
