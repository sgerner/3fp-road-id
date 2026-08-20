alter table public.group_site_configs
	add column if not exists site_pages jsonb not null default '[]'::jsonb;

alter table public.group_site_configs
	drop constraint if exists group_site_configs_site_pages_array;

alter table public.group_site_configs
	add constraint group_site_configs_site_pages_array
	check (jsonb_typeof(site_pages) = 'array' and jsonb_array_length(site_pages) <= 12);

update public.group_site_configs
set site_pages = jsonb_build_array(
	jsonb_build_object(
		'id', 'home',
		'slug', '',
		'title', 'Home',
		'nav_label', 'Home',
		'description', coalesce(site_tagline, ''),
		'seo_description', coalesce(seo_description, ''),
		'show_in_nav', true,
		'is_home', true,
		'blocks', page_blocks
	))
where jsonb_array_length(site_pages) = 0;
