begin;

insert into auth.users (id, email) values
	('00000000-0000-4000-8000-000000000901', 'proximity-host@example.invalid');

-- Seed 1,005 filler published groups first so state fixtures sit past the old 200 and 500 row limits.
insert into public.groups (
	slug,
	name,
	city,
	state_region,
	country,
	logo_url,
	is_published
)
select
	'filler-intl-group-' || lpad(gs::text, 4, '0'),
	'AAA Filler Club ' || lpad(gs::text, 4, '0'),
	'Dublin',
	'Leinster',
	'IE',
	'https://example.invalid/logo.png',
	true
from generate_series(1, 1005) as gs;

-- Seed one published group in each of the 50 US states (mixing 2-letter codes and full state names)
-- after row 1,005 so all 50 states must be discoverable without 200- or 500-row truncation.
with state_seed(idx, code, full_name) as (
	values
		(1, 'AL', 'Alabama'), (2, 'AK', 'Alaska'), (3, 'AZ', 'Arizona'), (4, 'AR', 'Arkansas'),
		(5, 'CA', 'California'), (6, 'CO', 'Colorado'), (7, 'CT', 'Connecticut'), (8, 'DE', 'Delaware'),
		(9, 'FL', 'Florida'), (10, 'GA', 'Georgia'), (11, 'HI', 'Hawaii'), (12, 'ID', 'Idaho'),
		(13, 'IL', 'Illinois'), (14, 'IN', 'Indiana'), (15, 'IA', 'Iowa'), (16, 'KS', 'Kansas'),
		(17, 'KY', 'Kentucky'), (18, 'LA', 'Louisiana'), (19, 'ME', 'Maine'), (20, 'MD', 'Maryland'),
		(21, 'MA', 'Massachusetts'), (22, 'MI', 'Michigan'), (23, 'MN', 'Minnesota'), (24, 'MS', 'Mississippi'),
		(25, 'MO', 'Missouri'), (26, 'MT', 'Montana'), (27, 'NE', 'Nebraska'), (28, 'NV', 'Nevada'),
		(29, 'NH', 'New Hampshire'), (30, 'NJ', 'New Jersey'), (31, 'NM', 'New Mexico'), (32, 'NY', 'New York'),
		(33, 'NC', 'North Carolina'), (34, 'ND', 'North Dakota'), (35, 'OH', 'Ohio'), (36, 'OK', 'Oklahoma'),
		(37, 'OR', 'Oregon'), (38, 'PA', 'Pennsylvania'), (39, 'RI', 'Rhode Island'), (40, 'SC', 'South Carolina'),
		(41, 'SD', 'South Dakota'), (42, 'TN', 'Tennessee'), (43, 'TX', 'Texas'), (44, 'UT', 'Utah'),
		(45, 'VT', 'Vermont'), (46, 'VA', 'Virginia'), (47, 'WA', 'Washington'), (48, 'WV', 'West Virginia'),
		(49, 'WI', 'Wisconsin'), (50, 'WY', 'Wyoming')
)
insert into public.groups (
	slug,
	name,
	city,
	state_region,
	country,
	logo_url,
	is_published
)
select
	'us-state-club-' || lower(code),
	'ZZZ State Club ' || code,
	'Capital City',
	case when idx % 2 = 0 then full_name else code end,
	'US',
	case when idx % 3 = 0 then null else 'https://example.invalid/' || lower(code) || '.png' end,
	true
from state_seed;

-- Specific coordinate and edge-case group fixtures around Council Bluffs, IA (41.2619, -95.8608).
insert into public.groups (
	id,
	slug,
	name,
	city,
	state_region,
	country,
	logo_url,
	latitude,
	longitude,
	is_published
) values
	-- ~5 miles away (Omaha, NE)
	('00000000-0000-4000-8000-000000001001', 'omaha-velo', 'Omaha Velo', 'Omaha', 'NE', 'US', 'https://example.invalid/omaha.png', 41.2565, -95.9345, true),
	-- ~122 miles away (Des Moines, IA)
	('00000000-0000-4000-8000-000000001002', 'des-moines-cycle', 'Des Moines Cycle Club', 'Des Moines', 'Iowa', 'US', 'https://example.invalid/dsm.png', 41.5868, -93.6250, true),
	-- ~238 miles away (Davenport, IA - inside 250 miles; actually ~258 miles, so use Iowa City ~228 miles)
	('00000000-0000-4000-8000-000000001003', 'iowa-city-rollers', 'Iowa City Rollers', 'Iowa City', 'IA', 'US', 'https://example.invalid/ic.png', 41.6611, -91.5302, true),
	-- ~265 miles away (Dubuque, IA - same state IA, but strictly outside 250 miles!)
	('00000000-0000-4000-8000-000000001004', 'dubuque-outside-250', 'Dubuque Hill Climbers', 'Dubuque', 'IA', 'US', 'https://example.invalid/dbq.png', 42.5006, -90.6646, true),
	-- Unpublished group right in Council Bluffs (must never be returned)
	('00000000-0000-4000-8000-000000001005', 'council-bluffs-draft', 'Council Bluffs Unpublished', 'Council Bluffs', 'IA', 'US', 'https://example.invalid/cb.png', 41.2619, -95.8608, false),
	-- Canadian province fixture
	('00000000-0000-4000-8000-000000001006', 'toronto-wheelers', 'Toronto Wheelers', 'Toronto', 'Ontario', 'CA', 'https://example.invalid/to.png', 43.6532, -79.3832, true),
	-- Overseas Spain group containing 'ia' in region
	('00000000-0000-4000-8000-000000001007', 'andalusia-gran-fondo', 'Andalusia Cycling Club', 'Seville', 'Andalusia', 'ES', 'https://example.invalid/es.png', 37.3891, -5.9845, true);

-- Seed ride fixtures (upcoming published, overseas, >250mi, draft, past, DC vs WA, WV vs VA).
insert into public.activity_events (
	id,
	activity_type,
	host_user_id,
	host_group_id,
	created_by_user_id,
	title,
	slug,
	starts_at,
	ends_at,
	next_occurrence_start,
	next_occurrence_end,
	status,
	start_location_name,
	start_location_address,
	start_latitude,
	start_longitude
) values
	-- Overseas Andalusia, Spain ride (contains 'ia' substring in 'Andalusia' and 'Spain' - must NEVER match IA!)
	('00000000-0000-4000-8000-000000002001', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Andalusia Gravel Tour', 'andalusia-gravel-tour',
	 now() + interval '1 day', now() + interval '1 day 3 hours',
	 now() + interval '1 day', now() + interval '1 day 3 hours',
	 'published', 'Andalusia, Spain', 'Seville, Andalusia, Spain', 37.3891, -5.9845),
	-- Overseas Toledo, Spain ride (same city name as Toledo, OH - must NEVER match US/OH!)
	('00000000-0000-4000-8000-000000002002', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Toledo Castle Climb', 'toledo-castle-climb',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 'published', 'Toledo, Spain', 'Toledo, Spain', 39.8628, -4.0273),
	-- Verified nearby Council Bluffs ride (~0.5 miles away)
	('00000000-0000-4000-8000-000000002003', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Wabash Trace Taco Ride', 'wabash-trace-taco-ride',
	 now() + interval '2 days', now() + interval '2 days 2 hours',
	 now() + interval '2 days', now() + interval '2 days 2 hours',
	 'published', 'Wabash Trace Trailhead', 'Council Bluffs, IA 51503', 41.2300, -95.8500),
	-- Verified nearby Des Moines ride (~122 miles away)
	('00000000-0000-4000-8000-000000002004', 'ride', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000901',
	 'Des Moines River Loop', 'des-moines-river-loop',
	 now() + interval '1 day 4 hours', now() + interval '1 day 6 hours',
	 now() + interval '1 day 4 hours', now() + interval '1 day 6 hours',
	 'published', 'Principal Riverwalk', 'Des Moines, Iowa', 41.5868, -93.6250),
	-- Distant ride (>250 miles away: Chicago, IL ~430 miles)
	('00000000-0000-4000-8000-000000002005', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Lakefront Sunrise Spin', 'lakefront-sunrise-spin',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 'published', 'Grant Park', 'Chicago, IL', 41.8781, -87.6298),
	-- Draft ride in Council Bluffs (must never be returned)
	('00000000-0000-4000-8000-000000002006', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Draft Council Bluffs Ride', 'draft-cb-ride',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 now() + interval '1 day', now() + interval '1 day 2 hours',
	 'draft', 'Council Bluffs', 'Council Bluffs, IA', 41.2619, -95.8608),
	-- Past published ride in Council Bluffs (must never be returned)
	('00000000-0000-4000-8000-000000002007', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Past Council Bluffs Ride', 'past-cb-ride',
	 now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
	 now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
	 'published', 'Council Bluffs', 'Council Bluffs, IA', 41.2619, -95.8608),
	-- Washington, DC ride vs Washington state disambiguation
	('00000000-0000-4000-8000-000000002008', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Capitol Hill Coffee Spin', 'capitol-hill-coffee-spin',
	 now() + interval '3 days', now() + interval '3 days 2 hours',
	 now() + interval '3 days', now() + interval '3 days 2 hours',
	 'published', 'National Mall', '1600 Pennsylvania Ave, Washington, DC 20500', 38.8977, -77.0365),
	-- Charleston, West Virginia ride vs Virginia disambiguation
	('00000000-0000-4000-8000-000000002009', 'ride', '00000000-0000-4000-8000-000000000901', null, '00000000-0000-4000-8000-000000000901',
	 'Kanawha River Spin', 'kanawha-river-spin',
	 now() + interval '3 days', now() + interval '3 days 2 hours',
	 now() + interval '3 days', now() + interval '3 days 2 hours',
	 'published', 'Capitol Market', 'Charleston, West Virginia', 38.3498, -81.6326);

insert into public.ride_details (activity_event_id, image_urls)
select id, array['https://example.invalid/ride.jpg']
from public.activity_events;

-- Test as anonymous role
set local role anon;

do $$
declare
	v_group_slugs text[];
	v_ride_slugs text[];
	v_state_code text;
	v_state_count integer;
begin
	-- 1. Strict 250-mile coordinate query for Council Bluffs (41.2619, -95.8608):
	-- Must return Omaha (~5mi), Des Moines (~122mi), Iowa City (~228mi) in distance order,
	-- and EXCLUDE Dubuque (~265mi despite being in IA!), unpublished, and non-geocoded groups.
	select array_agg(slug order by distance_miles asc)
	into v_group_slugs
	from public.match_nearby_groups(41.2619, -95.8608, 'Council Bluffs', 'IA', 'US', 250, 50);

	if v_group_slugs is distinct from array['omaha-velo', 'des-moines-cycle', 'iowa-city-rollers'] then
		raise exception 'Unexpected coordinate group matches: %', v_group_slugs;
	end if;

	-- 2. Strict 250-mile coordinate query for rides:
	-- Must return Wabash Trace (~2.3mi) then Des Moines (~122mi), excluding Andalusia, Chicago, draft, and past.
	select array_agg(slug order by distance_miles asc)
	into v_ride_slugs
	from public.match_nearby_rides(41.2619, -95.8608, 'Council Bluffs', 'IA', 'US', 250, 25);

	if v_ride_slugs is distinct from array['wabash-trace-taco-ride', 'des-moines-river-loop'] then
		raise exception 'Unexpected coordinate ride matches: %', v_ride_slugs;
	end if;

	-- 3. Country-only fallback exclusion:
	if exists (select 1 from public.match_nearby_groups(null, null, null, null, 'US', 250, 10)) then
		raise exception 'Country-only group query should return 0 rows';
	end if;
	if exists (select 1 from public.match_nearby_rides(null, null, null, null, 'US', 250, 10)) then
		raise exception 'Country-only ride query should return 0 rows';
	end if;

	-- 4. Overseas ride exclusion & whole-word state expansion when visitor coordinates are unavailable:
	select array_agg(slug)
	into v_ride_slugs
	from public.match_nearby_rides(null, null, 'Council Bluffs', 'IA', 'US', 250, 25);

	if v_ride_slugs is distinct from array['wabash-trace-taco-ride', 'des-moines-river-loop'] then
		raise exception 'Fallback IA ride query leaked overseas/distant rides or missed Iowa rides: %', v_ride_slugs;
	end if;

	-- Toledo, OH visitor without coordinates must NOT match Toledo, Spain!
	if exists (select 1 from public.match_nearby_rides(null, null, 'Toledo', 'OH', 'US', 250, 10)) then
		raise exception 'Toledo, OH fallback matched Toledo, Spain ride';
	end if;

	-- Washington state (WA) visitor without coordinates must NOT match Washington, DC ride!
	if exists (select 1 from public.match_nearby_rides(null, null, 'Seattle', 'WA', 'US', 250, 10)) then
		raise exception 'WA fallback matched Washington, DC ride';
	end if;

	-- Virginia (VA) visitor without coordinates must NOT match West Virginia ride or group!
	if exists (select 1 from public.match_nearby_rides(null, null, 'Richmond', 'VA', 'US', 250, 10)) then
		raise exception 'VA fallback matched West Virginia ride';
	end if;
	if exists (
		select 1
		from public.match_nearby_groups(null, null, 'Richmond', 'VA', 'US', 250, 10)
		where slug = 'us-state-club-wv'
	) then
		raise exception 'VA fallback matched West Virginia group';
	end if;

	-- 5. All 50 US states return eligible local groups without 200- or 500-row truncation (total groups > 1,055):
	foreach v_state_code in array array[
		'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
		'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
		'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
		'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
		'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
	] loop
		select count(*)
		into v_state_count
		from public.match_nearby_groups(null, null, null, v_state_code, 'US', 250, 3)
		where slug = 'us-state-club-' || lower(v_state_code)
		   or state_region in (v_state_code, 'Iowa');
		if v_state_count < 1 then
			raise exception 'State % returned 0 local groups across 1,055+ catalog', v_state_code;
		end if;
	end loop;
end $$;

-- Test as authenticated role
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);

do $$
declare
	v_group_slugs text[];
	v_ride_slugs text[];
begin
	-- Canadian province expansion ('ON' <-> 'Ontario') for authenticated member
	select array_agg(slug)
	into v_group_slugs
	from public.match_nearby_groups(null, null, 'Toronto', 'ON', 'CA', 250, 5);

	if v_group_slugs is distinct from array['toronto-wheelers'] then
		raise exception 'Authenticated Canadian ON lookup failed: %', v_group_slugs;
	end if;

	-- Draft ride owned by the authenticated host must still NOT appear in published proximity feed
	select array_agg(slug)
	into v_ride_slugs
	from public.match_nearby_rides(41.2619, -95.8608, 'Council Bluffs', 'IA', 'US', 250, 25);

	if 'draft-cb-ride' = any (coalesce(v_ride_slugs, '{}'::text[])) then
		raise exception 'Draft ride leaked into match_nearby_rides for authenticated user';
	end if;
end $$;

select 'proximity database checks passed' as status;

rollback;
