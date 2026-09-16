-- Exposed views are read-only projections. The default Supabase grants include
-- broad table privileges, so make the view boundary explicit and prevent an
-- updatable projection from becoming a write path around base-table RLS.

do $view_grants$
declare
  view_row record;
begin
  for view_row in
    select n.nspname as schema_name, c.relname as view_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
  loop
    execute format(
      'revoke all on table %I.%I from anon, authenticated, public',
      view_row.schema_name,
      view_row.view_name
    );
    execute format(
      'grant select on table %I.%I to anon, authenticated',
      view_row.schema_name,
      view_row.view_name
    );
  end loop;
end
$view_grants$;

-- Keep the two projection views intentionally owner-secured for their safe,
-- column-limited public output. Their write surface is removed above.
