-- Scope Road ID and emergency contact RLS policies explicitly to `authenticated`
-- (with initplan-friendly `(select auth.uid())` checks) and grant the matching
-- table/sequence DML privileges revoked by 20260915130000 and 20260915131500.

alter table public.road_id_profiles enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.qr_codes enable row level security;

drop policy if exists road_id_profiles_select on public.road_id_profiles;
create policy road_id_profiles_select
  on public.road_id_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists road_id_profiles_insert on public.road_id_profiles;
create policy road_id_profiles_insert
  on public.road_id_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists road_id_profiles_update on public.road_id_profiles;
create policy road_id_profiles_update
  on public.road_id_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists road_id_profiles_delete on public.road_id_profiles;
create policy road_id_profiles_delete
  on public.road_id_profiles
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists emergency_contacts_select on public.emergency_contacts;
create policy emergency_contacts_select
  on public.emergency_contacts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.road_id_profiles rp
      where rp.user_id = profile_id
        and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists emergency_contacts_insert on public.emergency_contacts;
create policy emergency_contacts_insert
  on public.emergency_contacts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.road_id_profiles rp
      where rp.user_id = profile_id
        and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists emergency_contacts_update on public.emergency_contacts;
create policy emergency_contacts_update
  on public.emergency_contacts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.road_id_profiles rp
      where rp.user_id = profile_id
        and rp.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.road_id_profiles rp
      where rp.user_id = profile_id
        and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists emergency_contacts_delete on public.emergency_contacts;
create policy emergency_contacts_delete
  on public.emergency_contacts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.road_id_profiles rp
      where rp.user_id = profile_id
        and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists qr_codes_select on public.qr_codes;
create policy qr_codes_select
  on public.qr_codes
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Public scan lookups go through the rate-limited server endpoint using service_role
-- and strip internal identifiers; direct PostgREST access is authenticated-only.
revoke all on table public.road_id_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.road_id_profiles to authenticated;
grant all on table public.road_id_profiles to service_role;

revoke all on table public.emergency_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.emergency_contacts to authenticated;
grant all on table public.emergency_contacts to service_role;

revoke all on table public.qr_codes from public, anon, authenticated;
grant select on table public.qr_codes to authenticated;
grant all on table public.qr_codes to service_role;

-- Ensure any serial or identity sequence backing emergency_contacts / road_id_profiles
-- grants USAGE + SELECT to authenticated for self-service contact inserts.
do $road_id_sequences$
declare
  seq_record record;
begin
  for seq_record in
    select distinct
      seq_ns.nspname as sequence_schema,
      seq.relname as sequence_name
    from pg_class seq
    join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
    left join pg_depend dep
      on dep.objid = seq.oid
     and dep.classid = 'pg_class'::regclass
     and dep.deptype in ('a', 'i')
    left join pg_class table_rel on table_rel.oid = dep.refobjid
    left join pg_namespace table_ns on table_ns.oid = table_rel.relnamespace
    where seq.relkind = 'S'
      and seq_ns.nspname = 'public'
      and (
        (
          table_ns.nspname = 'public'
          and table_rel.relname in ('road_id_profiles', 'emergency_contacts')
        )
        or seq.oid = to_regclass(pg_get_serial_sequence('public.emergency_contacts', 'id'))
        or seq.relname = 'emergency_contacts_id_seq'
      )
  loop
    execute format(
      'revoke all on sequence %I.%I from public, anon, authenticated',
      seq_record.sequence_schema,
      seq_record.sequence_name
    );
    execute format(
      'grant usage, select on sequence %I.%I to authenticated',
      seq_record.sequence_schema,
      seq_record.sequence_name
    );
    execute format(
      'grant all on sequence %I.%I to service_role',
      seq_record.sequence_schema,
      seq_record.sequence_name
    );
  end loop;
end
$road_id_sequences$;
