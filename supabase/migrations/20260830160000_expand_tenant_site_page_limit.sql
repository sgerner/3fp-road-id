alter table public.group_site_configs
	drop constraint if exists group_site_configs_site_pages_array;

alter table public.group_site_configs
	add constraint group_site_configs_site_pages_array
	check (jsonb_typeof(site_pages) = 'array' and jsonb_array_length(site_pages) <= 24);

-- If the earlier link-internalization migration has already run, recover the
-- specific destinations from the imported card titles rather than leaving
-- them on the generic resource hub.
update public.group_assets as assets
set external_url = case lower(trim(assets.title))
	when 'board members' then '/board'
	when 'bylaws' then '/bylaws'
	when 'advocacy resources' then '/advocacy-resources'
	when 'biking data' then '/bike-count-data'
	when 'bike count 2025' then '/bike-count-2025'
	when 'bike racks for businesses' then '/bike-racks'
	when 'bike valet' then '/bike-valet'
	when 'cyclist’s feat — farmer avenue artwork' then '/cyclists-feat'
	when 'businesses with cyclist discounts' then '/bike-friendly-businesses'
	when 'general contact' then '/general'
	when 'social contract to volunteers' then '/social-contract-to-volunteers'
	else assets.external_url
end
from public.groups as groups
where assets.group_id = groups.id
	and groups.microsite_slug = 'biketempe'
	and assets.asset_kind = 'link'
	and assets.external_url = '/assets'
	and lower(trim(assets.title)) in (
		'board members',
		'bylaws',
		'advocacy resources',
		'biking data',
		'bike count 2025',
		'bike racks for businesses',
		'bike valet',
		'cyclist’s feat — farmer avenue artwork',
		'businesses with cyclist discounts',
		'general contact',
		'social contract to volunteers'
	);

-- The previous import mapped the old Join Us link to the action page. Keep the
-- existing asset row, but make the destination match the real signup route.
update public.group_assets as assets
set external_url = '/join'
from public.groups as groups
where assets.group_id = groups.id
	and groups.microsite_slug = 'biketempe'
	and assets.asset_kind = 'link'
	and lower(trim(assets.title)) = 'join the email list'
	and assets.external_url in ('/take-action', '/assets');
