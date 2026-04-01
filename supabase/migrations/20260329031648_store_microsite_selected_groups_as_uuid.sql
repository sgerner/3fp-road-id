alter table public.group_site_configs
	add column if not exists ride_widget_group_ids uuid[];

update public.group_site_configs cfg
set ride_widget_group_ids = coalesce(
	(
		select array_agg(g.id)
		from public.groups g
		where g.slug = any(coalesce(cfg.ride_widget_group_slugs, '{}'::text[]))
	),
	'{}'::uuid[]
)
where cfg.ride_widget_group_ids is null
	or array_length(cfg.ride_widget_group_ids, 1) is null;

alter table public.group_site_configs
	alter column ride_widget_group_ids set default '{}'::uuid[],
	alter column ride_widget_group_ids set not null;;
