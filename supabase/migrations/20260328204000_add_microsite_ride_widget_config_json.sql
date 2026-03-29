alter table public.group_site_configs
	add column if not exists ride_widget_config jsonb;

update public.group_site_configs
set ride_widget_config = coalesce(ride_widget_config, '{}'::jsonb);

alter table public.group_site_configs
	alter column ride_widget_config set default '{}'::jsonb,
	alter column ride_widget_config set not null;
