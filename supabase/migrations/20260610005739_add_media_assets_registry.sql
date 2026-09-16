create table if not exists public.media_assets (
\tid uuid primary key default gen_random_uuid(),
\tbucket_id text not null check (bucket_id in ('ride-media', 'group-social-media')),
\tobject_path text not null,
\tpublic_url text not null,
\tcontent_hash text not null,
\tfile_name text not null default '',
\tmime_type text not null default 'image/png',
\tsize_bytes bigint not null default 0,
\tlast_referenced_at timestamptz not null default now(),
\tcreated_at timestamptz not null default now(),
\tupdated_at timestamptz not null default now(),
\tunique (bucket_id, content_hash),
\tunique (bucket_id, object_path)
);

create index if not exists media_assets_last_referenced_at_idx
\ton public.media_assets (last_referenced_at);

create index if not exists media_assets_bucket_id_idx
\ton public.media_assets (bucket_id);
