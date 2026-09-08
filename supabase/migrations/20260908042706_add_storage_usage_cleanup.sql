-- Keep Storage from growing indefinitely when an upload is replaced or a
-- database row is deleted without its corresponding object.
-- The default is a dry run so an operator can inspect the candidate count
-- before enabling deletion from a one-off call.
create or replace function public.cleanup_storage_unreferenced_objects(
	retention_days integer default 30,
	dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $function$
declare
	cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 0));
	column_info record;
	deleted_object_count integer := 0;
	deleted_asset_rows integer := 0;
	reclaimed_bytes bigint := 0;
begin
	perform set_config('storage.allow_delete_query', 'true', true);

	create temporary table tmp_storage_usage_active_keys (
		key text primary key
	) on commit drop;

	-- Scan every public text/json/array column for public, signed, or
	-- authenticated Storage URLs. This covers current and future tables that
	-- persist a media URL without requiring another hand-maintained UNION.
	for column_info in
		select table_name, column_name
		from information_schema.columns
		where table_schema = 'public'
			and data_type in ('text', 'json', 'jsonb', 'ARRAY')
	loop
		execute format($sql$
			insert into tmp_storage_usage_active_keys (key)
			select distinct match[1] || ':' || match[2]
			from public.%I as source_row
			cross join lateral regexp_matches(
				source_row.%I::text,
				'/storage/v1/object/(?:public|sign|authenticated)/([^/"?[:space:],}]+)/([^"[:space:],}?#]+)',
				'g'
			) as match
			where source_row.%I is not null
			on conflict (key) do nothing
		$sql$, column_info.table_name, column_info.column_name, column_info.column_name);
	end loop;

	-- Some registries store bucket/path pairs instead of complete public URLs.
	-- Treat those pairs as active references as well.
	insert into tmp_storage_usage_active_keys (key)
	select bucket_id || ':' || object_path
	from public.group_assets
	where bucket_id is not null and object_path is not null
	on conflict (key) do nothing;

	insert into tmp_storage_usage_active_keys (key)
	select bucket_id || ':' || object_path
	from public.group_accounting_receipts
	where bucket_id is not null and object_path is not null
	on conflict (key) do nothing;

	insert into tmp_storage_usage_active_keys (key)
	select bucket_id || ':' || object_path
	from public.learn_assets
	where bucket_id is not null and object_path is not null
	on conflict (key) do nothing;

	insert into tmp_storage_usage_active_keys (key)
	select bucket_id || ':' || object_path
	from public.media_assets
	where bucket_id is not null and object_path is not null
	on conflict (key) do nothing;

	create temporary table tmp_storage_usage_candidates (
		bucket_id text not null,
		name text not null,
		size_bytes bigint not null default 0,
		primary key (bucket_id, name)
	) on commit drop;

	insert into tmp_storage_usage_candidates (bucket_id, name, size_bytes)
	select
		o.bucket_id,
		o.name,
		case
			when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
				then (o.metadata->>'size')::bigint
			when coalesce(o.metadata->>'contentLength', '') ~ '^[0-9]+$'
				then (o.metadata->>'contentLength')::bigint
			else 0
		end
	from storage.objects o
	left join tmp_storage_usage_active_keys active
		on active.key = o.bucket_id || ':' || o.name
	where active.key is null
		and coalesce(o.created_at, now()) < cutoff;

	select
		count(*)::integer,
		coalesce(sum(size_bytes), 0)
	into deleted_object_count, reclaimed_bytes
	from tmp_storage_usage_candidates;

	if not dry_run then
		delete from storage.objects o
		using tmp_storage_usage_candidates candidate
		where o.bucket_id = candidate.bucket_id
			and o.name = candidate.name;

		delete from public.media_assets ma
		using tmp_storage_usage_candidates candidate
		where ma.bucket_id = candidate.bucket_id
			and ma.object_path = candidate.name;
		get diagnostics deleted_asset_rows = row_count;
	end if;

	return jsonb_build_object(
		'dry_run', dry_run,
		'retention_days', retention_days,
		'candidate_objects', deleted_object_count,
		'deleted_objects', case when dry_run then 0 else deleted_object_count end,
		'deleted_asset_rows', deleted_asset_rows,
		'reclaimed_bytes', reclaimed_bytes
	);
end;
$function$;

revoke all on function public.cleanup_storage_unreferenced_objects(integer, boolean) from public;
grant execute on function public.cleanup_storage_unreferenced_objects(integer, boolean) to service_role;
