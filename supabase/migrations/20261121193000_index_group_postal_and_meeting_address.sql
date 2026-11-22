-- Index zip_code and specific_meeting_point_address in groups.search_document.

alter table public.groups
	add column if not exists zip_code text,
	add column if not exists specific_meeting_point_address text,
	add column if not exists search_document tsvector;

create or replace function public.groups_build_search_document(
	group_name text,
	group_tagline text,
	group_description text,
	group_membership_info text,
	group_service_area_description text,
	group_city text,
	group_state_region text,
	group_country text,
	group_zip_code text,
	group_specific_meeting_point_address text
)
returns tsvector
language sql
stable
set search_path to 'public'
as $function$
	select
		setweight(to_tsvector('simple', coalesce(group_name, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_tagline, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(group_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_membership_info, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_service_area_description, '')), 'B') ||
		setweight(to_tsvector('simple', coalesce(group_city, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_state_region, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_country, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_zip_code, '')), 'C') ||
		setweight(to_tsvector('simple', coalesce(group_specific_meeting_point_address, '')), 'C');
$function$;

create or replace function public.groups_prepare_search_document()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
	new.search_document := public.groups_build_search_document(
		new.name,
		new.tagline,
		new.description,
		new.membership_info,
		new.service_area_description,
		new.city,
		new.state_region,
		new.country,
		new.zip_code,
		new.specific_meeting_point_address
	);
	return new;
end;
$function$;

drop trigger if exists groups_prepare_search_document on public.groups;

create trigger groups_prepare_search_document
before insert or update on public.groups
for each row
execute function public.groups_prepare_search_document();

drop function if exists public.groups_build_search_document(
	text,
	text,
	text,
	text,
	text,
	text,
	text,
	text
);

update public.groups
set search_document = public.groups_build_search_document(
	name,
	tagline,
	description,
	membership_info,
	service_area_description,
	city,
	state_region,
	country,
	zip_code,
	specific_meeting_point_address
);

analyze public.groups;
