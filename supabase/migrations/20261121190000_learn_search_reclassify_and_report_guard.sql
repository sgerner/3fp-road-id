-- Reclassify stored crash, emergency, and rider-safety guides in learn_articles
-- and protect the synchronized Safer Cycling, Better Messages report entry from
-- wiki editor / authenticated client overwrites.

update public.learn_articles
set content_type = 'safety'
where content_type is distinct from 'safety'
	and (
		slug in (
			'crash-response',
			'tips-for-cyclists-safety',
			'alert',
			'emergency-protocols',
			'safety',
			'road-share-philosophy',
			'road-share',
			'safer-cycling-better-messages',
			'responding-to-cycling-tragedies',
			'tragedy-action-guide',
			'emotional-support-for-tragedy-response',
			'emotional-support',
			'family-outreach',
			'victim-resource-template',
			'victim-resources',
			'safety-and-logistics-for-candidate-rides',
			'ride-safety-and-logistics'
		)
		or import_source_path in (
			'education/crash-response.md',
			'education/ALERT.md',
			'community/safety.md',
			'community/road-share.md',
			'policies/tragedy-action-guide.md',
			'policies/elections/ride-safety-and-logistics.md',
			'support/emotional-support.md',
			'support/family-outreach.md',
			'support/victim-resources.md',
			'src/lib/content/safetyReport.json'
		)
		or lower(coalesce(title, '') || ' ' || coalesce(summary, '')) ~
			'\m(crash|emergenc(y|ies)|cyclists?\s+safety|rider\s+safety|safer\s+cycling|road\s+share|ride\s+safety|first\s+aid|traged(y|ies)|victim\s+resources?)\M'
	);

create or replace function public.learn_guard_protected_catalog_articles()
returns trigger
language plpgsql
set search_path = public
as $$
declare
	jwt_role text := coalesce(
		nullif(current_setting('request.jwt.claim.role', true), ''),
		auth.role(),
		''
	);
	is_privileged boolean := current_user in ('postgres', 'supabase_admin')
		or jwt_role = 'service_role';
	target_protected boolean := false;
begin
	if is_privileged then
		if tg_op = 'DELETE' then
			return old;
		end if;
		return new;
	end if;

	if tg_op = 'DELETE' then
		target_protected :=
			lower(coalesce(old.slug, '')) = 'safer-cycling-better-messages'
			or coalesce(old.import_source_path, '') = 'src/lib/content/safetyReport.json';
		if target_protected then
			raise exception 'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be deleted.'
				using errcode = '42501';
		end if;
		return old;
	end if;

	if tg_op = 'INSERT' then
		target_protected :=
			lower(coalesce(new.slug, '')) = 'safer-cycling-better-messages'
			or coalesce(new.import_source_path, '') = 'src/lib/content/safetyReport.json';
		if target_protected then
			raise exception 'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be created from the wiki editor.'
				using errcode = '42501';
		end if;
		return new;
	end if;

	target_protected :=
		lower(coalesce(old.slug, '')) = 'safer-cycling-better-messages'
		or lower(coalesce(new.slug, '')) = 'safer-cycling-better-messages'
		or coalesce(old.import_source_path, '') = 'src/lib/content/safetyReport.json'
		or coalesce(new.import_source_path, '') = 'src/lib/content/safetyReport.json';

	if target_protected then
		-- Allow category-level sort_order / subcategory_slug adjustments while blocking
		-- any wiki content, metadata, or publication overwrites.
		if new.title is distinct from old.title
			or new.slug is distinct from old.slug
			or new.summary is distinct from old.summary
			or new.body_markdown is distinct from old.body_markdown
			or new.reader_summary is distinct from old.reader_summary
			or new.key_takeaways is distinct from old.key_takeaways
			or new.category_slug is distinct from old.category_slug
			or new.category_name is distinct from old.category_name
			or new.import_source_path is distinct from old.import_source_path
			or new.is_published is distinct from old.is_published
			or new.content_type is distinct from old.content_type
		then
			raise exception 'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be overwritten in the wiki editor.'
				using errcode = '42501';
		end if;
	end if;

	return new;
end;
$$;

drop trigger if exists learn_guard_protected_catalog_articles on public.learn_articles;
create trigger learn_guard_protected_catalog_articles
	before insert or update or delete on public.learn_articles
	for each row
	execute function public.learn_guard_protected_catalog_articles();

create or replace function public.learn_guard_protected_catalog_chunks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
	jwt_role text := coalesce(
		nullif(current_setting('request.jwt.claim.role', true), ''),
		auth.role(),
		''
	);
	is_privileged boolean := current_user in ('postgres', 'supabase_admin')
		or jwt_role = 'service_role';
	check_article_id uuid := case when tg_op = 'DELETE' then old.article_id else new.article_id end;
begin
	if is_privileged then
		if tg_op = 'DELETE' then
			return old;
		end if;
		return new;
	end if;

	if exists (
		select 1
		from public.learn_articles
		where id = check_article_id
			and (
				lower(coalesce(slug, '')) = 'safer-cycling-better-messages'
				or coalesce(import_source_path, '') = 'src/lib/content/safetyReport.json'
			)
	) then
		raise exception 'Safer Cycling, Better Messages chunks are managed from the authoritative report source.'
			using errcode = '42501';
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

drop trigger if exists learn_guard_protected_catalog_chunks on public.learn_article_chunks;
create trigger learn_guard_protected_catalog_chunks
	before insert or update or delete on public.learn_article_chunks
	for each row
	execute function public.learn_guard_protected_catalog_chunks();
