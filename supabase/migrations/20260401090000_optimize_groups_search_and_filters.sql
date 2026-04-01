-- Improve groups browsing/search performance and remove redundant index overhead.

create or replace function public.groups_build_search_document(
	group_name text,
	group_tagline text,
	group_description text,
	group_membership_info text,
	group_service_area_description text,
	group_city text,
	group_state_region text,
	group_country text
)
returns tsvector
language sql
stable
as $$
	select
		setweight(to_tsvector('simple', coalesce(group_name, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_tagline, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_membership_info, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_service_area_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_city, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_state_region, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_country, '')), 'C');
$$;

alter table public.groups
	add column if not exists search_document tsvector;

create or replace function public.groups_prepare_search_document()
returns trigger
language plpgsql
as $$
begin
	new.search_document := public.groups_build_search_document(
		new.name,
		new.tagline,
		new.description,
		new.membership_info,
		new.service_area_description,
		new.city,
		new.state_region,
		new.country
	);
	return new;
end;
$$;

drop trigger if exists groups_prepare_search_document on public.groups;

create trigger groups_prepare_search_document
before insert or update on public.groups
for each row
execute function public.groups_prepare_search_document();

update public.groups
set search_document = public.groups_build_search_document(
	name,
	tagline,
	description,
	membership_info,
	service_area_description,
	city,
	state_region,
	country
);

create index if not exists groups_search_document_published_idx
	on public.groups using gin (search_document)
	where is_published = true;

create index if not exists groups_published_name_idx
	on public.groups (name)
	where is_published = true;

create index if not exists groups_published_geo_id_idx
	on public.groups (id)
	where is_published = true and latitude is not null and longitude is not null;

create index if not exists group_x_group_types_type_group_idx
	on public.group_x_group_types (group_type_id, group_id);

create index if not exists group_x_audience_focuses_focus_group_idx
	on public.group_x_audience_focuses (audience_focus_id, group_id);

create index if not exists group_x_riding_disciplines_discipline_group_idx
	on public.group_x_riding_disciplines (riding_discipline_id, group_id);

alter table public.emergency_contacts
	drop constraint if exists emergency_contacts_id_key;

analyze public.groups;
analyze public.group_x_group_types;
analyze public.group_x_audience_focuses;
analyze public.group_x_riding_disciplines;
