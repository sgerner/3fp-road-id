alter table public.learn_articles
	add column if not exists reader_summary text,
	add column if not exists key_takeaways jsonb not null default '[]'::jsonb;

alter table public.learn_article_revisions
	add column if not exists reader_summary text,
	add column if not exists key_takeaways jsonb not null default '[]'::jsonb;

create or replace function public.learn_snapshot_article_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	insert into public.learn_article_revisions (
		article_id,
		revision_number,
		created_at,
		created_by_user_id,
		title,
		slug,
		summary,
		body_markdown,
		editor_mode,
		category_slug,
		category_name,
		cover_image_url,
		reader_summary,
		key_takeaways
	) values (
		new.id,
		new.last_revision_number,
		new.updated_at,
		case
			when tg_op = 'INSERT' then new.created_by_user_id
			else new.updated_by_user_id
		end,
		new.title,
		new.slug,
		new.summary,
		new.body_markdown,
		new.editor_mode,
		new.category_slug,
		new.category_name,
		new.cover_image_url,
		new.reader_summary,
		coalesce(new.key_takeaways, '[]'::jsonb)
	);

	return new;
end;
$$;;
