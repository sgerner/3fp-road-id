create or replace function public.cleanup_storage_media_assets(retention_days integer default 21)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $function$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 0));
  refreshed_count integer := 0;
  deleted_object_count integer := 0;
  reclaimed_bytes bigint := 0;
  deleted_asset_rows integer := 0;
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  create temporary table tmp_storage_media_active_keys (
    key text primary key
  ) on commit drop;

  insert into tmp_storage_media_active_keys (key)
  select distinct (m[1] || ':' || m[2]) as key
  from (
    select unnest(coalesce(image_urls, array[]::text[])) as url
    from public.ride_details

    union all

    select case
      when jsonb_typeof(item) = 'string' then item #>> '{}'
      when jsonb_typeof(item) = 'object' then coalesce(item->>'url', item->>'public_url', item->>'src')
    end as url
    from public.group_social_posts,
      jsonb_array_elements(coalesce(media, '[]'::jsonb)) as item

    union all

    select case
      when jsonb_typeof(item) = 'string' then item #>> '{}'
      when jsonb_typeof(item) = 'object' then coalesce(item->>'url', item->>'public_url', item->>'src')
    end as url
    from public.group_social_content_library,
      jsonb_array_elements(coalesce(media, '[]'::jsonb)) as item
  ) raw_urls
  cross join lateral regexp_match(url, '/storage/v1/object/public/([^/]+)/(.+)$') as m
  where url is not null and m is not null;

  create temporary table tmp_storage_media_deletions (
    bucket_id text,
    name text,
    size_bytes bigint
  ) on commit drop;

  insert into tmp_storage_media_deletions (bucket_id, name, size_bytes)
  select
    o.bucket_id,
    o.name,
    coalesce((o.metadata->>'size')::bigint, (o.metadata->>'contentLength')::bigint, 0)
  from storage.objects o
  left join tmp_storage_media_active_keys a on a.key = o.bucket_id || ':' || o.name
  where o.bucket_id in ('ride-media', 'group-social-media')
    and a.key is null
    and coalesce(o.created_at, now()) < cutoff;

  update public.media_assets ma
  set
    last_referenced_at = now(),
    updated_at = now()
  from tmp_storage_media_active_keys a
  where a.key = ma.bucket_id || ':' || ma.object_path;

  get diagnostics refreshed_count = row_count;

  delete from storage.objects o
  using tmp_storage_media_deletions d
  where o.bucket_id = d.bucket_id
    and o.name = d.name;

  get diagnostics deleted_object_count = row_count;

  select coalesce(sum(size_bytes), 0)
  into reclaimed_bytes
  from tmp_storage_media_deletions;

  delete from public.media_assets ma
  using tmp_storage_media_deletions d
  where ma.bucket_id = d.bucket_id
    and ma.object_path = d.name;

  get diagnostics deleted_asset_rows = row_count;

  return jsonb_build_object(
    'refreshed',
    refreshed_count,
    'deleted',
    deleted_object_count,
    'deleted_asset_rows',
    deleted_asset_rows,
    'reclaimed_bytes',
    reclaimed_bytes,
    'retention_days',
    retention_days,
    'buckets',
    jsonb_build_array('ride-media', 'group-social-media')
  );
end;
$function$;

revoke all on function public.cleanup_storage_media_assets(integer) from public;
grant execute on function public.cleanup_storage_media_assets(integer) to service_role;
