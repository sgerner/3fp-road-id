alter table public.group_site_configs
	add column if not exists page_blocks jsonb not null default '[]'::jsonb;

alter table public.group_site_configs
	drop constraint if exists group_site_configs_page_blocks_array;

alter table public.group_site_configs
	add constraint group_site_configs_page_blocks_array
	check (jsonb_typeof(page_blocks) = 'array' and jsonb_array_length(page_blocks) <= 20);
