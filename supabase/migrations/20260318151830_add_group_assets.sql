create table if not exists public.group_asset_sections (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.groups (id) on delete cascade,
	created_by_user_id uuid not null references auth.users (id) on delete restrict,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	name text not null,
	slug text not null,
	description text,
	section_type text not null default 'mixed',
	sort_order int4 not null default 0,
	constraint group_asset_sections_group_slug_unique unique (group_id, slug),
	constraint group_asset_sections_section_type_check
		check (section_type in ('gallery', 'documents', 'links', 'mixed'))
);

create index if not exists group_asset_sections_group_sort_idx
	on public.group_asset_sections (group_id, sort_order asc, created_at asc);

create table if not exists public.group_assets (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.groups (id) on delete cascade,
	section_id uuid not null references public.group_asset_sections (id) on delete cascade,
	created_by_user_id uuid not null references auth.users (id) on delete restrict,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	asset_kind text not null,
	title text not null,
	description text,
	sort_order int4 not null default 0,
	file_url text,
	bucket_id text,
	object_path text unique,
	file_name text,
	mime_type text,
	size_bytes bigint,
	external_url text,
	metadata jsonb not null default '{}'::jsonb,
	constraint group_assets_kind_check
		check (asset_kind in ('file', 'link')),
	constraint group_assets_payload_check check (
		(
			asset_kind = 'file'
			and file_url is not null
			and object_path is not null
			and external_url is null
		)
		or (
			asset_kind = 'link'
			and external_url is not null
			and file_url is null
			and object_path is null
		)
	)
);

create index if not exists group_assets_group_section_sort_idx
	on public.group_assets (group_id, section_id, sort_order asc, created_at desc);

create index if not exists group_assets_section_created_idx
	on public.group_assets (section_id, created_at desc);

create or replace function public.group_assets_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	new.updated_at := timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists group_asset_sections_set_updated_at on public.group_asset_sections;
create trigger group_asset_sections_set_updated_at
	before update on public.group_asset_sections
	for each row
	execute function public.group_assets_set_updated_at();

drop trigger if exists group_assets_set_updated_at on public.group_assets;
create trigger group_assets_set_updated_at
	before update on public.group_assets
	for each row
	execute function public.group_assets_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'group-assets',
	'group-assets',
	true,
	26214400,
	array[
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif',
		'image/svg+xml',
		'application/pdf',
		'text/plain',
		'text/csv',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-powerpoint',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/zip',
		'application/x-zip-compressed'
	]
)
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
	if not exists (
		select 1
		from pg_policies
		where schemaname = 'storage'
			and tablename = 'objects'
			and policyname = 'group_assets_select_public'
	) then
		create policy "group_assets_select_public"
			on storage.objects
			for select
			to anon, authenticated
			using (bucket_id = 'group-assets');
	end if;
end
$$;;
