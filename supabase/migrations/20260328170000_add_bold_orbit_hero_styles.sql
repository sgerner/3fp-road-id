-- Add 'bold' and 'orbit' hero styles to the allowed values

alter table public.group_site_configs
drop constraint if exists group_site_configs_hero_style_check;

alter table public.group_site_configs
add constraint group_site_configs_hero_style_check
check (hero_style in ('immersive', 'split', 'spotlight', 'bold', 'orbit'));
