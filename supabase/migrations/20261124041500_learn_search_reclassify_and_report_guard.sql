-- Reclassify stored crash, emergency, and rider-safety guides in learn_articles
-- and protect the synchronized Safer Cycling, Better Messages report entry from
-- non-admin wiki editor / authenticated client overwrites while preserving full
-- Learn admin (is_learn_admin()) and service-role maintenance access.

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

create or replace function public.is_protected_learn_catalog_article(target_article_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
	select exists (
		select 1
		from public.learn_articles
		where id = target_article_id
			and (
				lower(coalesce(slug, '')) = 'safer-cycling-better-messages'
				or coalesce(import_source_path, '') = 'src/lib/content/safetyReport.json'
			)
	);
$function$;

revoke all on function public.is_protected_learn_catalog_article(uuid) from public;
grant execute on function public.is_protected_learn_catalog_article(uuid) to anon, authenticated, service_role;

create or replace function public.learn_guard_protected_catalog_articles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
	jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
	is_privileged_or_admin boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
		or (current_user not in ('anon', 'authenticated') and jwt_role = 'service_role')
		or public.is_learn_admin();
	target_protected boolean := false;
begin
	if is_privileged_or_admin then
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
		-- Allow non-admin category-level sort_order / subcategory adjustments while blocking
		-- non-admin wiki content, discovery metadata, or publication overwrites.
		if new.title is distinct from old.title
			or new.slug is distinct from old.slug
			or new.summary is distinct from old.summary
			or new.body_markdown is distinct from old.body_markdown
			or new.editor_mode is distinct from old.editor_mode
			or new.cover_image_url is distinct from old.cover_image_url
			or new.reader_summary is distinct from old.reader_summary
			or new.key_takeaways is distinct from old.key_takeaways
			or new.category_slug is distinct from old.category_slug
			or new.category_name is distinct from old.category_name
			or new.import_source_path is distinct from old.import_source_path
			or new.is_published is distinct from old.is_published
			or new.content_type is distinct from old.content_type
			or new.tags is distinct from old.tags
			or new.audience is distinct from old.audience
			or new.difficulty_level is distinct from old.difficulty_level
			or new.ride_type is distinct from old.ride_type
			or new.geo_scope is distinct from old.geo_scope
			or new.geo_city is distinct from old.geo_city
			or new.geo_state is distinct from old.geo_state
			or new.is_evergreen is distinct from old.is_evergreen
			or new.metadata_confidence is distinct from old.metadata_confidence
			or new.article_embedding is distinct from old.article_embedding
		then
			raise exception 'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be overwritten in the wiki editor.'
				using errcode = '42501';
		end if;
	end if;

	return new;
end;
$function$;

revoke all on function public.learn_guard_protected_catalog_articles() from public, anon, authenticated, service_role;

drop trigger if exists learn_guard_protected_catalog_articles on public.learn_articles;
create trigger learn_guard_protected_catalog_articles
	before insert or update or delete on public.learn_articles
	for each row
	execute function public.learn_guard_protected_catalog_articles();

create or replace function public.learn_guard_protected_catalog_chunks()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
	jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
	is_privileged_or_admin boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
		or (current_user not in ('anon', 'authenticated') and jwt_role = 'service_role')
		or public.is_learn_admin();
begin
	if is_privileged_or_admin then
		if tg_op = 'DELETE' then
			return old;
		end if;
		return new;
	end if;

	if tg_op = 'DELETE' then
		if public.is_protected_learn_catalog_article(old.article_id) then
			raise exception 'Safer Cycling, Better Messages chunks are managed from the authoritative report source.'
				using errcode = '42501';
		end if;
		return old;
	end if;

	if tg_op = 'INSERT' then
		if public.is_protected_learn_catalog_article(new.article_id) then
			raise exception 'Safer Cycling, Better Messages chunks are managed from the authoritative report source.'
				using errcode = '42501';
		end if;
		return new;
	end if;

	if public.is_protected_learn_catalog_article(old.article_id)
		or public.is_protected_learn_catalog_article(new.article_id)
	then
		raise exception 'Safer Cycling, Better Messages chunks are managed from the authoritative report source.'
			using errcode = '42501';
	end if;

	return new;
end;
$function$;

revoke all on function public.learn_guard_protected_catalog_chunks() from public, anon, authenticated, service_role;

drop trigger if exists learn_guard_protected_catalog_chunks on public.learn_article_chunks;
create trigger learn_guard_protected_catalog_chunks
	before insert or update or delete on public.learn_article_chunks
	for each row
	execute function public.learn_guard_protected_catalog_chunks();
