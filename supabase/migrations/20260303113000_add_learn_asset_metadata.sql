alter table public.learn_assets
	add column if not exists source_type text not null default 'upload',
	add column if not exists source_path text,
	add column if not exists alt_text text,
	add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.learn_assets
	drop constraint if exists learn_assets_source_type_check;

alter table public.learn_assets
	add constraint learn_assets_source_type_check
	check (source_type in ('upload', 'import'));

create index if not exists learn_assets_source_path_idx
	on public.learn_assets (source_path);

create table if not exists public.learn_article_asset_links (
	id uuid primary key default gen_random_uuid(),
	article_id uuid not null references public.learn_articles (id) on delete cascade,
	asset_id uuid not null references public.learn_assets (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	created_by_user_id uuid references auth.users (id) on delete restrict,
	usage_kind text not null default 'attachment',
	sort_order integer not null default 0,
	constraint learn_article_asset_links_article_asset_unique unique (article_id, asset_id),
	constraint learn_article_asset_links_usage_kind_check check (usage_kind in ('attachment', 'embedded', 'cover'))
);

create index if not exists learn_article_asset_links_article_idx
	on public.learn_article_asset_links (article_id, sort_order asc, created_at asc);

create index if not exists learn_article_asset_links_asset_idx
	on public.learn_article_asset_links (asset_id);

insert into public.learn_article_asset_links (article_id, asset_id, created_by_user_id, usage_kind)
select
	article_id,
	id,
	uploaded_by_user_id,
	'attachment'
from public.learn_assets
where article_id is not null
on conflict (article_id, asset_id) do nothing;

alter table public.learn_article_asset_links enable row level security;

create policy "learn_article_asset_links_select_visible"
	on public.learn_article_asset_links
	for select
	to anon, authenticated
	using (
		exists (
			select 1
			from public.learn_articles
			where id = article_id
				and (is_published = true or auth.uid() is not null)
		)
	);

create policy "learn_article_asset_links_insert_authenticated"
	on public.learn_article_asset_links
	for insert
	to authenticated
	with check (auth.uid() is not null);

create policy "learn_article_asset_links_update_authenticated"
	on public.learn_article_asset_links
	for update
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

create policy "learn_article_asset_links_delete_authenticated"
	on public.learn_article_asset_links
	for delete
	to authenticated
	using (auth.uid() is not null);
