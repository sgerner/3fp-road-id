drop index if exists public.group_news_posts_source_url_unique_idx;

create unique index if not exists group_news_posts_source_url_unique_idx
on public.group_news_posts (group_id, source_url);
