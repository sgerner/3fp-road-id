alter table public.group_social_posts
	add column if not exists ai_add_page_text boolean not null default false,
	add column if not exists content_library_item_id uuid;

create table if not exists public.group_social_content_library (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	created_by uuid,
	caption text not null default '',
	ai_prompt text,
	post_target text not null default 'page' check (post_target in ('page', 'story')),
	ai_add_page_text boolean not null default false,
	media jsonb not null default '[]'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

alter table public.group_social_posts
	drop constraint if exists group_social_posts_content_library_item_id_fkey;

alter table public.group_social_posts
	add constraint group_social_posts_content_library_item_id_fkey
	foreign key (content_library_item_id)
	references public.group_social_content_library(id)
	on delete set null;

create index if not exists group_social_content_library_group_created_idx
	on public.group_social_content_library (group_id, created_at desc);

create index if not exists group_social_posts_library_item_idx
	on public.group_social_posts (content_library_item_id)
	where content_library_item_id is not null;

alter table public.group_social_content_library enable row level security;
