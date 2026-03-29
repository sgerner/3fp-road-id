update public.group_site_configs
set hero_style = case
	when hero_style = 'stacked' then 'split'
	when hero_style = 'plain' then 'immersive'
	else hero_style
end
where hero_style in ('stacked', 'plain');

alter table public.group_site_configs
	drop constraint if exists group_site_configs_hero_style_check;

alter table public.group_site_configs
	add constraint group_site_configs_hero_style_check
	check (hero_style in ('immersive', 'split', 'spotlight'));
