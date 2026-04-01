alter table public.group_site_configs
	add column if not exists ride_widget_enabled boolean,
	add column if not exists ride_widget_title text,
	add column if not exists ride_widget_host_scope text,
	add column if not exists ride_widget_group_slugs text[];

update public.group_site_configs
set
	ride_widget_enabled = coalesce(ride_widget_enabled, false),
	ride_widget_title = coalesce(nullif(ride_widget_title, ''), 'Ride calendar'),
	ride_widget_host_scope = coalesce(ride_widget_host_scope, 'group_only'),
	ride_widget_group_slugs = coalesce(ride_widget_group_slugs, '{}'::text[]);

alter table public.group_site_configs
	alter column ride_widget_enabled set default false,
	alter column ride_widget_enabled set not null,
	alter column ride_widget_title set default 'Ride calendar',
	alter column ride_widget_title set not null,
	alter column ride_widget_host_scope set default 'group_only',
	alter column ride_widget_host_scope set not null,
	alter column ride_widget_group_slugs set default '{}'::text[],
	alter column ride_widget_group_slugs set not null;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'group_site_configs_ride_widget_host_scope_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_ride_widget_host_scope_check
			check (ride_widget_host_scope in ('all', 'group_only', 'selected_groups'));
	end if;
end $$;;
