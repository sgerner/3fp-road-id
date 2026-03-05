create policy "learn_article_revisions_insert_authenticated"
	on public.learn_article_revisions
	for insert
	to authenticated
	with check (
		auth.uid() is not null
		and created_by_user_id = auth.uid()
		and exists (
			select 1
			from public.learn_articles
			where id = article_id
				and auth.uid() is not null
		)
	);
