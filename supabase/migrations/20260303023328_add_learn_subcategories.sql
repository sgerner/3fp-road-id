alter table public.learn_articles
	add column if not exists subcategory_slug text,
	add column if not exists subcategory_name text,
	add column if not exists import_source_path text unique;

alter table public.learn_article_revisions
	add column if not exists subcategory_slug text,
	add column if not exists subcategory_name text,
	add column if not exists import_source_path text;

create index if not exists learn_articles_subcategory_slug_idx
	on public.learn_articles (subcategory_slug);

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
		subcategory_slug,
		subcategory_name,
		import_source_path,
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
		new.subcategory_slug,
		new.subcategory_name,
		new.import_source_path,
		new.cover_image_url,
		new.reader_summary,
		coalesce(new.key_takeaways, '[]'::jsonb)
	);

	return new;
end;
$$;;
