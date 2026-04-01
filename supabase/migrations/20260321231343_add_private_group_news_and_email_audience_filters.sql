alter table public.group_news_posts
	add column if not exists is_private boolean not null default false;

create index if not exists group_news_posts_group_private_published_idx
	on public.group_news_posts (group_id, is_private, published_at desc, created_at desc);

drop policy if exists "group_news_posts_select_public_or_manager" on public.group_news_posts;
create policy "group_news_posts_select_public_or_manager"
	on public.group_news_posts
	for select
	using (
		(
			published_at is not null
			and is_private = false
		)
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
	);;
