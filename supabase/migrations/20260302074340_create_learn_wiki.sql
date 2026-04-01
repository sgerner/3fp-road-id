create or replace function public.is_learn_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.profiles
		where user_id = auth.uid()
			and admin = true
	);
$$;

create table if not exists public.learn_articles (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	created_by_user_id uuid not null references auth.users (id) on delete restrict,
	updated_by_user_id uuid not null references auth.users (id) on delete restrict,
	title text not null,
	slug text not null unique,
	summary text,
	body_markdown text not null default '',
	editor_mode text not null default 'wysiwyg' check (editor_mode in ('markdown', 'wysiwyg')),
	category_slug text not null default 'general',
	category_name text not null default 'General',
	cover_image_url text,
	is_published boolean not null default true,
	last_revision_number integer not null default 0
);

create index if not exists learn_articles_category_slug_idx
	on public.learn_articles (category_slug);

create index if not exists learn_articles_updated_at_idx
	on public.learn_articles (updated_at desc);

create table if not exists public.learn_article_revisions (
	id uuid primary key default gen_random_uuid(),
	article_id uuid not null references public.learn_articles (id) on delete cascade,
	revision_number integer not null,
	created_at timestamptz not null default timezone('utc', now()),
	created_by_user_id uuid not null references auth.users (id) on delete restrict,
	title text not null,
	slug text not null,
	summary text,
	body_markdown text not null default '',
	editor_mode text not null check (editor_mode in ('markdown', 'wysiwyg')),
	category_slug text not null,
	category_name text not null,
	cover_image_url text,
	constraint learn_article_revisions_article_revision_unique unique (article_id, revision_number)
);

create index if not exists learn_article_revisions_article_created_idx
	on public.learn_article_revisions (article_id, created_at desc);

create table if not exists public.learn_comments (
	id uuid primary key default gen_random_uuid(),
	article_id uuid not null references public.learn_articles (id) on delete cascade,
	author_user_id uuid not null references auth.users (id) on delete restrict,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	body_markdown text not null default ''
);

create index if not exists learn_comments_article_created_idx
	on public.learn_comments (article_id, created_at asc);

create table if not exists public.learn_assets (
	id uuid primary key default gen_random_uuid(),
	article_id uuid references public.learn_articles (id) on delete set null,
	uploaded_by_user_id uuid not null references auth.users (id) on delete restrict,
	created_at timestamptz not null default timezone('utc', now()),
	bucket_id text not null default 'learn-media',
	object_path text not null unique,
	public_url text not null,
	file_name text not null,
	mime_type text,
	size_bytes bigint
);

create index if not exists learn_assets_article_created_idx
	on public.learn_assets (article_id, created_at desc);

create or replace function public.learn_prepare_article()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		new.created_at := coalesce(new.created_at, timezone('utc', now()));
		new.updated_at := coalesce(new.updated_at, new.created_at);
		new.last_revision_number := coalesce(nullif(new.last_revision_number, 0), 1);
	else
		new.created_at := old.created_at;
		new.created_by_user_id := old.created_by_user_id;
		new.updated_at := timezone('utc', now());
		new.last_revision_number := coalesce(old.last_revision_number, 0) + 1;
	end if;

	return new;
end;
$$;

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
		cover_image_url
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
		new.cover_image_url
	);

	return new;
end;
$$;

create or replace function public.learn_prepare_comment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		new.created_at := coalesce(new.created_at, timezone('utc', now()));
	end if;

	new.updated_at := timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists learn_prepare_article on public.learn_articles;
create trigger learn_prepare_article
	before insert or update on public.learn_articles
	for each row
	execute function public.learn_prepare_article();

drop trigger if exists learn_snapshot_article_revision on public.learn_articles;
create trigger learn_snapshot_article_revision
	after insert or update on public.learn_articles
	for each row
	execute function public.learn_snapshot_article_revision();

drop trigger if exists learn_prepare_comment on public.learn_comments;
create trigger learn_prepare_comment
	before insert or update on public.learn_comments
	for each row
	execute function public.learn_prepare_comment();

alter table public.learn_articles enable row level security;
alter table public.learn_article_revisions enable row level security;
alter table public.learn_comments enable row level security;
alter table public.learn_assets enable row level security;

create policy "learn_articles_select_public"
	on public.learn_articles
	for select
	to anon, authenticated
	using (is_published = true or auth.uid() is not null);

create policy "learn_articles_insert_authenticated"
	on public.learn_articles
	for insert
	to authenticated
	with check (
		auth.uid() is not null
		and created_by_user_id = auth.uid()
		and updated_by_user_id = auth.uid()
	);

create policy "learn_articles_update_authenticated"
	on public.learn_articles
	for update
	to authenticated
	using (auth.uid() is not null)
	with check (
		auth.uid() is not null
		and updated_by_user_id = auth.uid()
	);

create policy "learn_articles_delete_admin"
	on public.learn_articles
	for delete
	to authenticated
	using (public.is_learn_admin());

create policy "learn_article_revisions_select_public"
	on public.learn_article_revisions
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

create policy "learn_comments_select_public"
	on public.learn_comments
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

create policy "learn_comments_insert_authenticated"
	on public.learn_comments
	for insert
	to authenticated
	with check (
		auth.uid() is not null
		and author_user_id = auth.uid()
		and exists (
			select 1
			from public.learn_articles
			where id = article_id
				and is_published = true
		)
	);

create policy "learn_comments_update_owner_or_admin"
	on public.learn_comments
	for update
	to authenticated
	using (
		auth.uid() is not null
		and (author_user_id = auth.uid() or public.is_learn_admin())
	)
	with check (
		auth.uid() is not null
		and (author_user_id = auth.uid() or public.is_learn_admin())
	);

create policy "learn_comments_delete_owner_or_admin"
	on public.learn_comments
	for delete
	to authenticated
	using (
		auth.uid() is not null
		and (author_user_id = auth.uid() or public.is_learn_admin())
	);

create policy "learn_assets_select_visible"
	on public.learn_assets
	for select
	to anon, authenticated
	using (
		(
			article_id is not null
			and exists (
				select 1
				from public.learn_articles
				where id = article_id
					and (is_published = true or auth.uid() is not null)
			)
		)
		or uploaded_by_user_id = auth.uid()
		or public.is_learn_admin()
	);

create policy "learn_assets_insert_authenticated"
	on public.learn_assets
	for insert
	to authenticated
	with check (
		auth.uid() is not null
		and uploaded_by_user_id = auth.uid()
		and bucket_id = 'learn-media'
	);

create policy "learn_assets_update_owner_or_admin"
	on public.learn_assets
	for update
	to authenticated
	using (
		auth.uid() is not null
		and (uploaded_by_user_id = auth.uid() or public.is_learn_admin())
	)
	with check (
		auth.uid() is not null
		and (uploaded_by_user_id = auth.uid() or public.is_learn_admin())
		and bucket_id = 'learn-media'
	);

create policy "learn_assets_delete_owner_or_admin"
	on public.learn_assets
	for delete
	to authenticated
	using (
		auth.uid() is not null
		and (uploaded_by_user_id = auth.uid() or public.is_learn_admin())
	);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'learn-media',
	'learn-media',
	true,
	52428800,
	array[
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif',
		'image/svg+xml',
		'application/pdf'
	]
)
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "learn_media_select_public"
	on storage.objects
	for select
	to anon, authenticated
	using (bucket_id = 'learn-media');

create policy "learn_media_insert_authenticated"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'learn-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

create policy "learn_media_update_owner"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'learn-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	)
	with check (
		bucket_id = 'learn-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

create policy "learn_media_delete_owner"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'learn-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	);;
