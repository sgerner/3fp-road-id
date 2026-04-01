alter table public.group_site_configs
	add column if not exists sponsor_items jsonb not null default '[]'::jsonb;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_site_configs_sponsor_items_check'
	) then
		alter table public.group_site_configs
			add constraint group_site_configs_sponsor_items_check
			check (jsonb_typeof(sponsor_items) = 'array');
	end if;
end
$$;

update public.group_site_configs
set sponsor_items = coalesce(
	(
		select jsonb_agg(
			jsonb_build_object(
				'name', '',
				'text', '',
				'logo', '',
				'url', trim(both '"' from entry::text)
			)
		)
		from jsonb_array_elements(coalesce(sponsor_links, '[]'::jsonb)) as t(entry)
		where jsonb_typeof(entry) = 'string'
	),
	'[]'::jsonb
)
where coalesce(sponsor_items, '[]'::jsonb) = '[]'::jsonb
	and jsonb_typeof(coalesce(sponsor_links, '[]'::jsonb)) = 'array'
	and jsonb_array_length(coalesce(sponsor_links, '[]'::jsonb)) > 0;;
