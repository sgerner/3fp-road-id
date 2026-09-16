-- Remove the default PostgREST DML grants from browser roles. RLS is still
-- required, but table privileges should describe the same write surface as
-- the policies instead of leaving every table writable in principle.

-- The donation base table is only used by trusted server-side Stripe flows.
-- Public pages read the column-limited donation_accounts_public projection.
drop policy if exists donation_accounts_manage on public.donation_accounts;
drop policy if exists donation_accounts_manage_insert on public.donation_accounts;
drop policy if exists donation_accounts_manage_update on public.donation_accounts;
drop policy if exists donation_accounts_manage_delete on public.donation_accounts;
drop policy if exists donation_accounts_insert on public.donation_accounts;
drop policy if exists donation_accounts_update on public.donation_accounts;
drop policy if exists donation_accounts_delete on public.donation_accounts;
drop policy if exists donation_accounts_select on public.donation_accounts;
drop policy if exists donation_accounts_select_manager on public.donation_accounts;
revoke all on table public.donation_accounts from anon, authenticated, public;

do $relation_grants$
declare
  relation_row record;
begin
  for relation_row in
    select n.nspname as schema_name, c.relname as relation_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'spatial_ref_sys'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table %I.%I from anon, authenticated, public',
      relation_row.schema_name,
      relation_row.relation_name
    );
  end loop;

  -- Storage owns these relations, but postgres has the grant option needed to
  -- remove the browser roles' inherited DML privileges. Do not touch the
  -- platform analytics relation or its ownership.
  for relation_row in
    select *
    from (values ('buckets'::text), ('objects'::text)) as storage_rel(relation_name)
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table storage.%I from anon, authenticated, public',
      relation_row.relation_name
    );
  end loop;
end
$relation_grants$;

-- Restore only the browser writes represented by a positive authenticated RLS
-- policy. Policies whose USING/WITH CHECK is literally false are intentional
-- deny-all guards and must not reintroduce table privileges.
do $policy_grants$
declare
  policy_row record;
begin
  for policy_row in
    select distinct
      p.schemaname as schema_name,
      p.tablename as relation_name,
      privilege_name
    from pg_policies p
    cross join lateral unnest(
      case
        when p.cmd = 'ALL' then array['INSERT', 'UPDATE', 'DELETE']::text[]
        else array[p.cmd]::text[]
      end
    ) as privileges(privilege_name)
    where p.schemaname in ('public', 'storage')
      and p.tablename <> 'spatial_ref_sys'
      and p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and 'authenticated' = any (p.roles)
      and (
        (
          privilege_name = 'INSERT'
          and coalesce(p.with_check, 'true') <> 'false'
        )
        or (
          privilege_name = 'UPDATE'
          and coalesce(p.qual, 'true') <> 'false'
          and coalesce(p.with_check, p.qual, 'true') <> 'false'
        )
        or (
          privilege_name = 'DELETE'
          and coalesce(p.qual, 'true') <> 'false'
        )
      )
  loop
    execute format(
      'grant %s on table %I.%I to authenticated',
      policy_row.privilege_name,
      policy_row.schema_name,
      policy_row.relation_name
    );
  end loop;
end
$policy_grants$;

-- These two workflows intentionally accept anonymous feedback. Their RLS
-- checks still bind authenticated feedback to auth.uid() when present.
grant insert on table public.get_involved_interest_submissions to anon, authenticated;
grant insert on table public.learn_article_feedback_events to anon, authenticated;

-- Profiles are the one table with column-scoped browser writes. The policy
-- grants above are table-level, so restore the narrower insert/update ACL.
revoke insert, update on table public.profiles from authenticated;
grant insert (
  user_id,
  full_name,
  avatar_url,
  bio,
  metadata,
  phone,
  emergency_contact_name,
  emergency_contact_phone
) on table public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  bio,
  metadata,
  phone,
  emergency_contact_name,
  emergency_contact_phone
) on table public.profiles to authenticated;

-- Serial-backed tables need sequence USAGE for their allowed browser inserts,
-- but sequences themselves should not be callable by anonymous users by
-- default. Grant only sequences owned by a table with a positive insert path.
do $sequence_grants$
declare
  sequence_row record;
begin
  for sequence_row in
    select distinct
      seq_ns.nspname as sequence_schema,
      seq.relname as sequence_name
    from pg_class seq
    join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
    join pg_depend dep
      on dep.objid = seq.oid
     and dep.classid = 'pg_class'::regclass
     and dep.deptype = 'a'
    join pg_class table_rel on table_rel.oid = dep.refobjid
    join pg_namespace table_ns on table_ns.oid = table_rel.relnamespace
    where seq.relkind = 'S'
      and seq_ns.nspname = 'public'
      and table_ns.nspname = 'public'
      and table_rel.relkind in ('r', 'p')
      and exists (
        select 1
        from pg_policies p
        where p.schemaname = table_ns.nspname
          and p.tablename = table_rel.relname
          and p.cmd in ('INSERT', 'ALL')
          and (
            'authenticated' = any (p.roles)
            or 'anon' = any (p.roles)
            or 'public' = any (p.roles)
          )
          and coalesce(p.with_check, 'true') <> 'false'
      )
  loop
    execute format(
      'revoke all on sequence %I.%I from anon, authenticated, public',
      sequence_row.sequence_schema,
      sequence_row.sequence_name
    );
    execute format(
      'grant usage, select on sequence %I.%I to authenticated',
      sequence_row.sequence_schema,
      sequence_row.sequence_name
    );
    if exists (
      select 1
      from pg_class seq
      join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
      join pg_depend dep
        on dep.objid = seq.oid
       and dep.classid = 'pg_class'::regclass
       and dep.deptype = 'a'
      join pg_class table_rel on table_rel.oid = dep.refobjid
      join pg_namespace table_ns on table_ns.oid = table_rel.relnamespace
      join pg_policies p
        on p.schemaname = table_ns.nspname
       and p.tablename = table_rel.relname
      where seq_ns.nspname = sequence_row.sequence_schema
        and seq.relname = sequence_row.sequence_name
        and p.cmd in ('INSERT', 'ALL')
        and ('anon' = any (p.roles) or 'public' = any (p.roles))
        and coalesce(p.with_check, 'true') <> 'false'
    ) then
      execute format(
        'grant usage, select on sequence %I.%I to anon',
        sequence_row.sequence_schema,
        sequence_row.sequence_name
      );
    end if;
  end loop;
end
$sequence_grants$;

-- A malformed accounting object path must fail closed rather than raising a
-- UUID-cast error or depending on planner evaluation order.
drop policy if exists group_accounting_receipts_manager on storage.objects;
create policy group_accounting_receipts_manager
on storage.objects
for all to authenticated
using (
  bucket_id = 'group-accounting-receipts'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_group_accounting_manager(
    (case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (storage.foldername(name))[1]
      else null
    end)::uuid
  )
)
with check (
  bucket_id = 'group-accounting-receipts'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_group_accounting_manager(
    (case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (storage.foldername(name))[1]
      else null
    end)::uuid
  )
);
