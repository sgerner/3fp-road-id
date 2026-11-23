-- Unify Road ID bracelet claims and profile initialization inside serialized
-- service-role transactions while preserving owner-scoped RLS policies on
-- road_id_profiles, emergency_contacts, and qr_codes.

revoke insert, update, delete, truncate, references, trigger
  on table public.qr_codes
  from public, anon, authenticated;
grant select on table public.qr_codes to authenticated;

-- Atomically claim an unclaimed Road ID bracelet code and ensure the claimant's
-- emergency profile exists (seeded from public.profiles when empty so emergency
-- overrides are preserved). Concurrent claims on the same code serialize via
-- FOR UPDATE on public.qr_codes.
create or replace function public.claim_road_id_code(
  target_code text,
  claimant_user_id uuid,
  seed_full_name text default null,
  seed_phone text default null
)
returns table(status text, code text, profile_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_code text := btrim(coalesce(target_code, ''));
  v_qr record;
  v_profile_name text;
  v_profile_phone text;
begin
  if claimant_user_id is null or v_code = '' or v_code !~ '^[A-Za-z0-9_-]{4,64}$' then
    return query select 'invalid'::text, v_code, null::uuid;
    return;
  end if;

  select q.code, q.profile_id
  into v_qr
  from public.qr_codes q
  where q.code = v_code
  for update;

  if not found then
    return query select 'not_found'::text, v_code, null::uuid;
    return;
  end if;

  if v_qr.profile_id is not null and v_qr.profile_id <> claimant_user_id then
    return query select 'conflict'::text, v_qr.code, null::uuid;
    return;
  end if;

  select
    nullif(btrim(p.full_name), ''),
    nullif(btrim(p.phone), '')
  into v_profile_name, v_profile_phone
  from public.profiles p
  where p.user_id = claimant_user_id;

  v_profile_name := coalesce(nullif(btrim(seed_full_name), ''), v_profile_name);
  v_profile_phone := coalesce(nullif(btrim(seed_phone), ''), v_profile_phone);

  insert into public.road_id_profiles (user_id, full_name, phone)
  values (claimant_user_id, v_profile_name, v_profile_phone)
  on conflict (user_id) do update
  set
    full_name = coalesce(nullif(btrim(public.road_id_profiles.full_name), ''), excluded.full_name),
    phone = coalesce(nullif(btrim(public.road_id_profiles.phone), ''), excluded.phone);

  if v_qr.profile_id = claimant_user_id then
    return query select 'already_owned'::text, v_qr.code, claimant_user_id;
    return;
  end if;

  update public.qr_codes q
  set profile_id = claimant_user_id
  where q.code = v_qr.code
    and q.profile_id is null;

  return query select 'claimed'::text, v_qr.code, claimant_user_id;
end;
$function$;

revoke all on function public.claim_road_id_code(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_road_id_code(text, uuid, text, text)
  to service_role;

-- Unlink a retired bracelet code owned by the caller while keeping their
-- emergency profile and any other linked bracelet codes intact.
create or replace function public.unlink_road_id_code(
  target_code text,
  owner_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_code text := btrim(coalesce(target_code, ''));
  updated_rows integer;
begin
  if owner_user_id is null or v_code = '' or v_code !~ '^[A-Za-z0-9_-]{4,64}$' then
    return false;
  end if;

  perform 1
  from public.qr_codes q
  where q.code = v_code
    and q.profile_id = owner_user_id
  for update;

  if not found then
    return false;
  end if;

  update public.qr_codes q
  set profile_id = null
  where q.code = v_code
    and q.profile_id = owner_user_id;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$function$;

revoke all on function public.unlink_road_id_code(text, uuid)
  from public, anon, authenticated;
grant execute on function public.unlink_road_id_code(text, uuid)
  to service_role;
