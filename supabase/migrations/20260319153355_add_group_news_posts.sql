create table if not exists public.group_news_posts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	title text not null,
	slug text not null,
	summary text,
	body_markdown text not null default '',
	published_at timestamptz,
	created_by_user_id uuid not null,
	updated_by_user_id uuid not null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, slug)
);

create index if not exists group_news_posts_group_published_idx
	on public.group_news_posts (group_id, published_at desc, created_at desc);

create index if not exists group_news_posts_group_updated_idx
	on public.group_news_posts (group_id, updated_at desc);

alter table public.group_news_posts enable row level security;

drop policy if exists "group_news_posts_select_public_or_manager" on public.group_news_posts;
create policy "group_news_posts_select_public_or_manager"
	on public.group_news_posts
	for select
	using (
		published_at is not null
		or (
			auth.uid() is not null
			and (
				exists (
					select 1
					from public.group_members gm
					where gm.group_id = group_news_posts.group_id
						and gm.user_id = auth.uid()
						and gm.role = 'owner'
				)
				or exists (
					select 1
					from public.profiles p
					where p.user_id = auth.uid()
						and p.admin = true
				)
			)
		)
	);

drop policy if exists "group_news_posts_insert_manager" on public.group_news_posts;
create policy "group_news_posts_insert_manager"
	on public.group_news_posts
	for insert
	with check (
		auth.uid() is not null
		and created_by_user_id = auth.uid()
		and updated_by_user_id = auth.uid()
		and (
			exists (
				select 1
				from public.group_members gm
				where gm.group_id = group_news_posts.group_id
					and gm.user_id = auth.uid()
					and gm.role = 'owner'
			)
			or exists (
				select 1
				from public.profiles p
				where p.user_id = auth.uid()
					and p.admin = true
			)
		)
	);

drop policy if exists "group_news_posts_update_manager" on public.group_news_posts;
create policy "group_news_posts_update_manager"
	on public.group_news_posts
	for update
	using (
		auth.uid() is not null
		and (
			exists (
				select 1
				from public.group_members gm
				where gm.group_id = group_news_posts.group_id
					and gm.user_id = auth.uid()
					and gm.role = 'owner'
			)
			or exists (
				select 1
				from public.profiles p
				where p.user_id = auth.uid()
					and p.admin = true
			)
		)
	)
	with check (
		auth.uid() is not null
		and updated_by_user_id = auth.uid()
		and (
			exists (
				select 1
				from public.group_members gm
				where gm.group_id = group_news_posts.group_id
					and gm.user_id = auth.uid()
					and gm.role = 'owner'
			)
			or exists (
				select 1
				from public.profiles p
				where p.user_id = auth.uid()
					and p.admin = true
			)
		)
	);

drop policy if exists "group_news_posts_delete_manager" on public.group_news_posts;
create policy "group_news_posts_delete_manager"
	on public.group_news_posts
	for delete
	using (
		auth.uid() is not null
		and (
			exists (
				select 1
				from public.group_members gm
				where gm.group_id = group_news_posts.group_id
					and gm.user_id = auth.uid()
					and gm.role = 'owner'
			)
			or exists (
				select 1
				from public.profiles p
				where p.user_id = auth.uid()
					and p.admin = true
			)
		)
	);;
