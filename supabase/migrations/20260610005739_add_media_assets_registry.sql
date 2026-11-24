create table if not exists public.media_assets (
	id uuid primary key default gen_random_uuid(),
	bucket_id text not null check (bucket_id in ('ride-media', 'group-social-media')),
	object_path text not null,
	public_url text not null,
	content_hash text not null,
	file_name text not null default '',
	mime_type text not null default 'image/png',
	size_bytes bigint not null default 0,
	last_referenced_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (bucket_id, content_hash),
	unique (bucket_id, object_path)
);

create index if not exists media_assets_last_referenced_at_idx
	on public.media_assets (last_referenced_at);

create index if not exists media_assets_bucket_id_idx
	on public.media_assets (bucket_id);
