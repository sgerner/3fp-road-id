-- The replacement TBAG microsite owns the public destination now. Preserve the
-- imported source URL in metadata, but point the live resource cards at routes
-- that exist on this site before the former site is retired.
with legacy_assets as (
	select
		assets.id,
		rtrim(
			split_part(
				split_part(
					regexp_replace(assets.external_url, '^https?://(www\.)?biketempe\.org', '', 'i'),
					'?',
					1
				),
				'#',
				1
			),
			'/'
		) as path
	from public.group_assets as assets
	join public.groups as groups on groups.id = assets.group_id
	where groups.microsite_slug = 'biketempe'
		and assets.asset_kind = 'link'
		and assets.external_url ~* '^https?://(www\.)?biketempe\.org(/|$)'
)
update public.group_assets as assets
set external_url = case
	when legacy.path = '' then '/'
	when legacy.path = '/about' then '/about'
	when legacy.path = '/current-board' then '/board'
	when legacy.path = '/by-laws' then '/bylaws'
	when legacy.path = '/advocacy-resources' then '/advocacy-resources'
	when legacy.path = '/bike-count-data' then '/bike-count-data'
	when legacy.path = '/count' then '/bike-count-2025'
	when legacy.path = '/racks' then '/bike-racks'
	when legacy.path = '/bike-valet' then '/bike-valet'
	when legacy.path = '/cyclists-feat-farmer-artwork' then '/cyclists-feat'
	when legacy.path = '/bicycle-friendly-restaurants' then '/bike-friendly-businesses'
	when legacy.path = '/calendar' then '/calendar'
	when legacy.path = '/donate' then '/join#donate'
	when legacy.path = '/join-us' then '/take-action'
	when legacy.path like '/20%' then '/updates'
	else '/assets'
end
from legacy_assets as legacy
where assets.id = legacy.id;
