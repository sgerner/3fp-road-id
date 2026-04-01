-- Update background_style values to new options
-- Map old values to new ones

update public.group_site_configs
set background_style = case
	when background_style = 'mesh' then 'aurora'
	when background_style = 'paper' then 'prism'
	when background_style = 'minimal' then 'void'
	else background_style
end
where background_style in ('mesh', 'paper', 'minimal');

-- Drop existing constraint
alter table public.group_site_configs
drop constraint if exists group_site_configs_background_style_check;

-- Add new constraint with updated options
alter table public.group_site_configs
add constraint group_site_configs_background_style_check
check (background_style in ('cinematic', 'aurora', 'prism', 'void'));;
