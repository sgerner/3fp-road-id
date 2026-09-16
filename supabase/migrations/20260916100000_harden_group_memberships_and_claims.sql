-- Group membership roles grant management access throughout the application.
-- Browser clients may read their memberships but must use narrowly authorized
-- server workflows to create/remove those privileged relationships.
drop policy if exists group_members_manage on public.group_members;
revoke insert, update, delete, truncate, references, trigger
  on table public.group_members
  from public, anon, authenticated;
grant select on table public.group_members to authenticated;

-- Group rows must be created together with a verified owner's membership.
-- The application uses the server-only transaction below; client JWTs cannot
-- create ownerless rows through PostgREST.
drop policy if exists groups_insert on public.groups;
revoke insert on table public.groups from public, anon, authenticated;

-- Serialize public unclaimed-group claims on the group row. This prevents two
-- concurrent claim requests from both observing an unclaimed group and both
-- becoming owners. The RPC is only callable with the server's service role;
-- the route separately verifies the caller's Supabase identity.
create or replace function public.claim_unclaimed_group(
  target_group_id uuid,
  claimant_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  inserted_rows integer;
begin
  if target_group_id is null or claimant_user_id is null then
    return false;
  end if;

  perform 1
  from public.groups g
  where g.id = target_group_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.role = 'owner'
  ) then
    return false;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_group_id, claimant_user_id, 'owner')
  on conflict do nothing;

  get diagnostics inserted_rows = row_count;
  return inserted_rows = 1;
end;
$function$;

revoke all on function public.claim_unclaimed_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_unclaimed_group(uuid, uuid) to service_role;

create or replace function public.create_group_with_owner(
  group_data jsonb,
  owner_user_id uuid
)
returns table(id uuid, slug text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  new_group_id uuid;
  new_group_slug text;
begin
  if group_data is null
    or jsonb_typeof(group_data) <> 'object'
    or owner_user_id is null
    or nullif(btrim(group_data->>'slug'), '') is null
    or nullif(btrim(group_data->>'name'), '') is null
    or nullif(btrim(group_data->>'country'), '') is null
    or nullif(btrim(group_data->>'state_region'), '') is null then
    raise exception 'Invalid group creation request.' using errcode = '22023';
  end if;

  insert into public.groups (
    slug,
    name,
    city,
    state_region,
    country,
    tagline,
    description,
    website_url,
    public_contact_email,
    public_phone_number,
    preferred_contact_method_instructions,
    how_to_join_instructions,
    membership_info,
    specific_meeting_point_address,
    latitude,
    longitude,
    service_area_description,
    activity_frequency,
    typical_activity_day_time,
    social_links
  ) values (
    btrim(group_data->>'slug'),
    btrim(group_data->>'name'),
    nullif(btrim(group_data->>'city'), ''),
    btrim(group_data->>'state_region'),
    upper(btrim(group_data->>'country')),
    nullif(btrim(group_data->>'tagline'), ''),
    nullif(btrim(group_data->>'description'), ''),
    nullif(btrim(group_data->>'website_url'), ''),
    nullif(btrim(group_data->>'public_contact_email'), ''),
    nullif(btrim(group_data->>'public_phone_number'), ''),
    nullif(btrim(group_data->>'preferred_contact_method_instructions'), ''),
    nullif(btrim(group_data->>'how_to_join_instructions'), ''),
    nullif(btrim(group_data->>'membership_info'), ''),
    nullif(btrim(group_data->>'specific_meeting_point_address'), ''),
    nullif(group_data->>'latitude', '')::numeric,
    nullif(group_data->>'longitude', '')::numeric,
    nullif(btrim(group_data->>'service_area_description'), ''),
    nullif(btrim(group_data->>'activity_frequency'), ''),
    nullif(btrim(group_data->>'typical_activity_day_time'), ''),
    case
      when jsonb_typeof(group_data->'social_links') = 'null' then null
      else group_data->'social_links'
    end
  )
  returning groups.id, groups.slug into new_group_id, new_group_slug;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, owner_user_id, 'owner');

  return query select new_group_id, new_group_slug;
end;
$function$;

revoke all on function public.create_group_with_owner(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_group_with_owner(jsonb, uuid) to service_role;
