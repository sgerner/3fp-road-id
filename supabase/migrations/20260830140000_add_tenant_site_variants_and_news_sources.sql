-- Keep tenant-specific presentation choices and imported publishing history explicit.
alter table public.group_site_configs
	add column if not exists site_variant text not null default 'standard';

alter table public.group_site_configs
	drop constraint if exists group_site_configs_site_variant_check;

alter table public.group_site_configs
	add constraint group_site_configs_site_variant_check
	check (site_variant in ('standard', 'tbag'));

alter table public.group_news_posts
	add column if not exists source_url text,
	add column if not exists source_name text,
	add column if not exists source_published_at timestamptz,
	add column if not exists cover_image_url text;

create unique index if not exists group_news_posts_source_url_unique_idx
	on public.group_news_posts (group_id, source_url)
	where source_url is not null;

create index if not exists group_news_posts_source_published_idx
	on public.group_news_posts (group_id, source_published_at desc nulls last);
