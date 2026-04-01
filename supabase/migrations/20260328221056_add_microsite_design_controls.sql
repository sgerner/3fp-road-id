alter table public.group_site_configs
	add column if not exists background_style text,
	add column if not exists panel_style text,
	add column if not exists panel_tone text,
	add column if not exists panel_density text;

update public.group_site_configs
set
	background_style = coalesce(background_style, 'cinematic'),
	panel_style = coalesce(panel_style, 'glass'),
	panel_tone = coalesce(panel_tone, 'surface'),
	panel_density = coalesce(panel_density, 'comfortable');

alter table public.group_site_configs
	alter column background_style set default 'cinematic',
	alter column panel_style set default 'glass',
	alter column panel_tone set default 'surface',
	alter column panel_density set default 'comfortable';

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_site_configs_background_style_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_background_style_check
			check (background_style in ('cinematic', 'mesh', 'paper', 'minimal'));
	end if;

	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_site_configs_panel_style_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_panel_style_check
			check (panel_style in ('glass', 'filled', 'outlined'));
	end if;

	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_site_configs_panel_tone_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_panel_tone_check
			check (panel_tone in ('surface', 'primary', 'secondary', 'tertiary'));
	end if;

	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_site_configs_panel_density_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_panel_density_check
			check (panel_density in ('compact', 'comfortable', 'airy'));
	end if;
end $$;

alter table public.group_site_configs
	drop column if exists nav_style;;
