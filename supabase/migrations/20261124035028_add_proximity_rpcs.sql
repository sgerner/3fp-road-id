-- Add full-catalog Haversine proximity and same-country word-bounded fallback RPCs
-- for published cycling groups and upcoming published rides.

create index if not exists groups_published_lat_lon_idx
	on public.groups (latitude, longitude)
	where is_published = true and latitude is not null and longitude is not null;

create index if not exists groups_published_country_name_idx
	on public.groups (upper(btrim(country)), name)
	where is_published = true;

create index if not exists activity_events_published_ride_geo_next_idx
	on public.activity_events (next_occurrence_start, start_latitude, start_longitude)
	where activity_type = 'ride' and status = 'published';

create or replace function public.normalize_location_country(raw_country text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when raw_country is null then ''
		else (
			with cleaned as (
				select upper(regexp_replace(btrim(raw_country), '[.,]+', '', 'g')) as val
			)
			select case
				when val in ('', 'XX', 'T1', 'OTHER', 'UNKNOWN', 'N/A', 'NONE') then ''
				when val in ('US', 'USA', 'U S A', 'UNITED STATES', 'UNITED STATES OF AMERICA') then 'US'
				when val in ('CA', 'CAN', 'CANADA') then 'CA'
				when val in ('AU', 'AUS', 'AUSTRALIA') then 'AU'
				when val in ('GB', 'GBR', 'UK', 'U K', 'UNITED KINGDOM', 'GREAT BRITAIN', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERN IRELAND') then 'GB'
				when val in ('MX', 'MEX', 'MEXICO', 'MÉXICO') then 'MX'
				when val in ('NZ', 'NZL', 'NEW ZEALAND') then 'NZ'
				when val in ('ES', 'ESP', 'SPAIN', 'ESPANA', 'ESPAÑA') then 'ES'
				when val in ('FR', 'FRA', 'FRANCE') then 'FR'
				when val in ('IT', 'ITA', 'ITALY', 'ITALIA') then 'IT'
				when val in ('PT', 'PRT', 'PORTUGAL') then 'PT'
				when val in ('DE', 'DEU', 'GERMANY', 'DEUTSCHLAND') then 'DE'
				when val in ('IE', 'IRL', 'IRELAND') then 'IE'
				when val in ('NL', 'NLD', 'NETHERLANDS', 'THE NETHERLANDS') then 'NL'
				when val in ('BE', 'BEL', 'BELGIUM') then 'BE'
				when val in ('CH', 'CHE', 'SWITZERLAND') then 'CH'
				when val in ('AT', 'AUT', 'AUSTRIA') then 'AT'
				when val in ('JP', 'JPN', 'JAPAN') then 'JP'
				when val in ('CO', 'COL', 'COLOMBIA') then 'CO'
				when val in ('ZA', 'ZAF', 'SOUTH AFRICA') then 'ZA'
				when val ~ '^[A-Z]{2}$' then val
				else ''
			end
			from cleaned
		)
	end;
$$;

create or replace function public.normalize_region_code(raw_country text, raw_region text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_country text := public.normalize_location_country(raw_country);
	v_raw text := btrim(coalesce(raw_region, ''));
	v_key text;
	v_code text;
begin
	if v_raw = '' then
		return '';
	end if;

	-- Strip ISO 3166-2 country prefix when present (e.g. "US-IA" -> "IA").
	if v_raw ~* '^[a-z]{2}-[a-z0-9]{1,3}$' then
		if v_country = '' then
			v_country := public.normalize_location_country(split_part(v_raw, '-', 1));
		end if;
		v_raw := split_part(v_raw, '-', 2);
	end if;

	v_key := lower(regexp_replace(v_raw, '[\s.\-]+', ' ', 'g'));

	if v_country in ('', 'US') then
		select m.code into v_code
		from (values
			('AL', 'alabama'), ('AK', 'alaska'), ('AZ', 'arizona'), ('AR', 'arkansas'),
			('CA', 'california'), ('CO', 'colorado'), ('CT', 'connecticut'), ('DE', 'delaware'),
			('FL', 'florida'), ('GA', 'georgia'), ('HI', 'hawaii'), ('ID', 'idaho'),
			('IL', 'illinois'), ('IN', 'indiana'), ('IA', 'iowa'), ('KS', 'kansas'),
			('KY', 'kentucky'), ('LA', 'louisiana'), ('ME', 'maine'), ('MD', 'maryland'),
			('MA', 'massachusetts'), ('MI', 'michigan'), ('MN', 'minnesota'), ('MS', 'mississippi'),
			('MO', 'missouri'), ('MT', 'montana'), ('NE', 'nebraska'), ('NV', 'nevada'),
			('NH', 'new hampshire'), ('NJ', 'new jersey'), ('NM', 'new mexico'), ('NY', 'new york'),
			('NC', 'north carolina'), ('ND', 'north dakota'), ('OH', 'ohio'), ('OK', 'oklahoma'),
			('OR', 'oregon'), ('PA', 'pennsylvania'), ('RI', 'rhode island'), ('SC', 'south carolina'),
			('SD', 'south dakota'), ('TN', 'tennessee'), ('TX', 'texas'), ('UT', 'utah'),
			('VT', 'vermont'), ('VA', 'virginia'), ('WA', 'washington'), ('WV', 'west virginia'),
			('WI', 'wisconsin'), ('WY', 'wyoming'), ('DC', 'district of columbia'), ('PR', 'puerto rico')
		) as m(code, name)
		where lower(m.code) = v_key or m.name = v_key
		limit 1;
		if v_code is not null then
			return v_code;
		end if;
	end if;

	if v_country in ('', 'CA') then
		select m.code into v_code
		from (values
			('AB', 'alberta'), ('BC', 'british columbia'), ('MB', 'manitoba'),
			('NB', 'new brunswick'), ('NL', 'newfoundland and labrador'), ('NT', 'northwest territories'),
			('NS', 'nova scotia'), ('NU', 'nunavut'), ('ON', 'ontario'),
			('PE', 'prince edward island'), ('QC', 'quebec'), ('QC', 'québec'),
			('SK', 'saskatchewan'), ('YT', 'yukon')
		) as m(code, name)
		where lower(m.code) = v_key or m.name = v_key
		limit 1;
		if v_code is not null then
			return v_code;
		end if;
	end if;

	if v_country in ('', 'AU') then
		select m.code into v_code
		from (values
			('ACT', 'australian capital territory'), ('NSW', 'new south wales'),
			('NT', 'northern territory'), ('QLD', 'queensland'),
			('SA', 'south australia'), ('TAS', 'tasmania'),
			('VIC', 'victoria'), ('WA', 'western australia')
		) as m(code, name)
		where lower(m.code) = v_key or m.name = v_key
		limit 1;
		if v_code is not null then
			return v_code;
		end if;
	end if;

	if v_raw ~ '^[A-Za-z]{2,3}$' then
		return upper(v_raw);
	end if;

	return v_raw;
end;
$$;

create or replace function public.expand_region_candidates(raw_country text, raw_region text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_country text := public.normalize_location_country(raw_country);
	v_raw text := btrim(coalesce(raw_region, ''));
	v_code text;
	v_name text;
	v_out text[] := '{}'::text[];
begin
	if v_raw = '' then
		return v_out;
	end if;

	v_code := public.normalize_region_code(v_country, v_raw);

	if v_country in ('', 'US') then
		select m.name into v_name
		from (values
			('AL', 'Alabama'), ('AK', 'Alaska'), ('AZ', 'Arizona'), ('AR', 'Arkansas'),
			('CA', 'California'), ('CO', 'Colorado'), ('CT', 'Connecticut'), ('DE', 'Delaware'),
			('FL', 'Florida'), ('GA', 'Georgia'), ('HI', 'Hawaii'), ('ID', 'Idaho'),
			('IL', 'Illinois'), ('IN', 'Indiana'), ('IA', 'Iowa'), ('KS', 'Kansas'),
			('KY', 'Kentucky'), ('LA', 'Louisiana'), ('ME', 'Maine'), ('MD', 'Maryland'),
			('MA', 'Massachusetts'), ('MI', 'Michigan'), ('MN', 'Minnesota'), ('MS', 'Mississippi'),
			('MO', 'Missouri'), ('MT', 'Montana'), ('NE', 'Nebraska'), ('NV', 'Nevada'),
			('NH', 'New Hampshire'), ('NJ', 'New Jersey'), ('NM', 'New Mexico'), ('NY', 'New York'),
			('NC', 'North Carolina'), ('ND', 'North Dakota'), ('OH', 'Ohio'), ('OK', 'Oklahoma'),
			('OR', 'Oregon'), ('PA', 'Pennsylvania'), ('RI', 'Rhode Island'), ('SC', 'South Carolina'),
			('SD', 'South Dakota'), ('TN', 'Tennessee'), ('TX', 'Texas'), ('UT', 'Utah'),
			('VT', 'Vermont'), ('VA', 'Virginia'), ('WA', 'Washington'), ('WV', 'West Virginia'),
			('WI', 'Wisconsin'), ('WY', 'Wyoming'), ('DC', 'District of Columbia'), ('PR', 'Puerto Rico')
		) as m(code, name)
		where m.code = v_code
		limit 1;
		if v_name is not null then
			return array[v_code, v_name];
		end if;
	end if;

	if v_country in ('', 'CA') then
		select m.name into v_name
		from (values
			('AB', 'Alberta'), ('BC', 'British Columbia'), ('MB', 'Manitoba'),
			('NB', 'New Brunswick'), ('NL', 'Newfoundland and Labrador'), ('NT', 'Northwest Territories'),
			('NS', 'Nova Scotia'), ('NU', 'Nunavut'), ('ON', 'Ontario'),
			('PE', 'Prince Edward Island'), ('QC', 'Quebec'),
			('SK', 'Saskatchewan'), ('YT', 'Yukon')
		) as m(code, name)
		where m.code = v_code
		limit 1;
		if v_name is not null then
			return array[v_code, v_name];
		end if;
	end if;

	if v_country in ('', 'AU') then
		select m.name into v_name
		from (values
			('ACT', 'Australian Capital Territory'), ('NSW', 'New South Wales'),
			('NT', 'Northern Territory'), ('QLD', 'Queensland'),
			('SA', 'South Australia'), ('TAS', 'Tasmania'),
			('VIC', 'Victoria'), ('WA', 'Western Australia')
		) as m(code, name)
		where m.code = v_code
		limit 1;
		if v_name is not null then
			return array[v_code, v_name];
		end if;
	end if;

	if v_code <> '' and lower(v_code) <> lower(v_raw) then
		return array[v_code, v_raw];
	end if;

	return array[v_raw];
end;
$$;

create or replace function public.contains_whole_word(haystack text, needle text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_haystack text := lower(btrim(coalesce(haystack, '')));
	v_needle text := lower(btrim(coalesce(needle, '')));
	v_escaped text;
begin
	if v_haystack = '' or v_needle = '' then
		return false;
	end if;

	-- Prevent 'Virginia' from matching 'West Virginia'.
	if v_needle = 'virginia' then
		v_haystack := regexp_replace(v_haystack, '(^|[^[:alnum:]])west\s+virginia($|[^[:alnum:]])', '\1\2', 'g');
	end if;

	v_escaped := regexp_replace(v_needle, '([.\\+*?[^\]$(){}=!<>|:-])', '\\\1', 'g');
	v_escaped := regexp_replace(v_escaped, '\s+', '\\s+', 'g');

	return v_haystack ~ ('(^|[^[:alnum:]])' || v_escaped || '($|[^[:alnum:]])');
end;
$$;

create or replace function public.matches_any_whole_word(haystack text, needles text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
	select coalesce(
		exists (
			select 1
			from unnest(coalesce(needles, '{}'::text[])) as candidate
			where public.contains_whole_word(haystack, candidate)
		),
		false
	);
$$;

create or replace function public.haversine_distance_miles(
	lat1 double precision,
	lon1 double precision,
	lat2 double precision,
	lon2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
	select case
		when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
		when lat1 < -90 or lat1 > 90 or lat2 < -90 or lat2 > 90 then null
		when lon1 < -180 or lon1 > 180 or lon2 < -180 or lon2 > 180 then null
		else (
			with calc as (
				select
					sin(radians(lat2 - lat1) / 2.0) ^ 2 +
					cos(radians(lat1)) * cos(radians(lat2)) *
					sin(radians(lon2 - lon1) / 2.0) ^ 2 as a
			)
			select 3958.8 * 2.0 * asin(sqrt(least(1.0, greatest(0.0, a))))
			from calc
		)
	end;
$$;

create or replace function public.infer_ride_country(
	p_start_location_name text,
	p_start_location_address text,
	p_host_group_country text,
	p_start_latitude double precision default null,
	p_start_longitude double precision default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_group_country text := public.normalize_location_country(p_host_group_country);
	v_source text;
	v_segments text[];
	v_len integer;
	v_tail text;
	v_prev text;
	v_tail_no_postal text;
	v_country text;
begin
	if v_group_country <> '' then
		return v_group_country;
	end if;

	foreach v_source in array array[coalesce(p_start_location_address, ''), coalesce(p_start_location_name, '')] loop
		v_source := btrim(v_source);
		if v_source = '' then
			continue;
		end if;

		v_segments := array(
			select btrim(part)
			from unnest(string_to_array(v_source, ',')) as part
			where btrim(part) <> ''
		);
		v_len := coalesce(array_length(v_segments, 1), 0);
		if v_len = 0 then
			continue;
		end if;

		v_tail := v_segments[v_len];
		v_prev := case when v_len >= 2 then v_segments[v_len - 1] else '' end;
		v_tail_no_postal := btrim(regexp_replace(v_tail, '\s+\d{5}(?:-\d{4})?$', '', 'g'));

		-- Distinguish e.g. 'Toronto, ON, CA' (Canada) from 'Los Angeles, CA' (California, US).
		if upper(v_tail_no_postal) = 'CA' and v_prev <> '' then
			if upper(btrim(regexp_replace(v_prev, '\s+[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$', '', 'g'))) in (
				'AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
				'ALBERTA', 'BRITISH COLUMBIA', 'MANITOBA', 'NEW BRUNSWICK',
				'NEWFOUNDLAND AND LABRADOR', 'NORTHWEST TERRITORIES', 'NOVA SCOTIA',
				'NUNAVUT', 'ONTARIO', 'PRINCE EDWARD ISLAND', 'QUEBEC', 'QUÉBEC',
				'SASKATCHEWAN', 'YUKON'
			) then
				return 'CA';
			else
				return 'US';
			end if;
		end if;

		-- Check explicit full country names or unambiguous ISO codes first when not a US state abbreviation.
		if upper(v_tail_no_postal) in (
			'UNITED STATES', 'UNITED STATES OF AMERICA', 'USA', 'U.S.A.', 'U.S.', 'US'
		) then
			return 'US';
		end if;

		v_country := public.normalize_location_country(v_tail_no_postal);
		if v_country <> '' and length(v_tail_no_postal) > 2 then
			return v_country;
		end if;

		-- Check US 2-letter state or full state name in the trailing segment (e.g. 'Council Bluffs, IA 51501').
		if public.normalize_region_code('US', v_tail_no_postal) in (
			'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
			'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
			'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
			'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
			'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
			'DC', 'PR'
		) then
			return 'US';
		end if;

		-- Two-letter ISO country codes that do not collide with US state codes (e.g. ES, FR, GB, AU, NZ, MX).
		if v_country <> '' then
			return v_country;
		end if;
	end loop;

	-- Coarse coordinate hemisphere guard when coordinates exist without country text.
	if p_start_latitude is not null and p_start_longitude is not null then
		if p_start_latitude between 17.5 and 72.0 and p_start_longitude between -180.0 and -64.0 then
			return 'US';
		end if;
	end if;

	return '';
end;
$$;

create or replace function public.extract_ride_region_text(
	p_start_location_name text,
	p_start_location_address text,
	p_host_group_state_region text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_parts text[] := '{}'::text[];
	v_source text;
	v_segments text[];
	v_len integer;
	v_last text;
	v_region_seg text;
begin
	if btrim(coalesce(p_host_group_state_region, '')) <> '' then
		v_parts := array_append(v_parts, btrim(p_host_group_state_region));
	end if;

	foreach v_source in array array[coalesce(p_start_location_address, ''), coalesce(p_start_location_name, '')] loop
		v_source := btrim(v_source);
		if v_source = '' then
			continue;
		end if;

		v_segments := array(
			select btrim(part)
			from unnest(string_to_array(v_source, ',')) as part
			where btrim(part) <> ''
		);
		v_len := coalesce(array_length(v_segments, 1), 0);
		if v_len = 0 then
			continue;
		end if;

		if v_len = 1 then
			v_parts := array_append(v_parts, v_segments[1]);
			continue;
		end if;

		v_last := btrim(regexp_replace(v_segments[v_len], '\s+\d{5}(?:-\d{4})?$', '', 'g'));
		-- Strip trailing country segment when >= 2 segments so e.g. 'Washington, DC, USA' yields region 'DC'.
		if (
			length(v_last) > 2 and public.normalize_location_country(v_last) <> ''
		) or upper(v_last) in ('US', 'USA', 'UK', 'GB', 'AU', 'NZ', 'MX', 'ES', 'FR', 'IT', 'PT') or (
			upper(v_last) = 'CA' and v_len >= 3
		) then
			v_region_seg := v_segments[v_len - 1];
		else
			v_region_seg := v_segments[v_len];
		end if;

		v_region_seg := btrim(regexp_replace(v_region_seg, '\s+\d{5}(?:-\d{4})?$', '', 'g'));
		v_region_seg := btrim(regexp_replace(v_region_seg, '\s+[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$', '', 'g'));
		if v_region_seg <> '' then
			v_parts := array_append(v_parts, v_region_seg);
		end if;
	end loop;

	return array_to_string(v_parts, ' | ');
end;
$$;

create or replace function public.extract_ride_city_text(
	p_start_location_name text,
	p_start_location_address text,
	p_host_group_city text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_parts text[] := '{}'::text[];
	v_source text;
	v_segments text[];
	v_len integer;
begin
	if btrim(coalesce(p_host_group_city, '')) <> '' then
		v_parts := array_append(v_parts, btrim(p_host_group_city));
	end if;

	foreach v_source in array array[coalesce(p_start_location_address, ''), coalesce(p_start_location_name, '')] loop
		v_source := btrim(v_source);
		if v_source = '' then
			continue;
		end if;

		v_segments := array(
			select btrim(part)
			from unnest(string_to_array(v_source, ',')) as part
			where btrim(part) <> ''
		);
		v_len := coalesce(array_length(v_segments, 1), 0);
		if v_len = 1 then
			v_parts := array_append(v_parts, v_segments[1]);
		elsif v_len = 2 then
			v_parts := array_append(v_parts, v_segments[1]);
		elsif v_len >= 3 then
			if (
				length(btrim(regexp_replace(v_segments[v_len], '\s+\d{5}(?:-\d{4})?$', '', 'g'))) > 2
				and public.normalize_location_country(btrim(regexp_replace(v_segments[v_len], '\s+\d{5}(?:-\d{4})?$', '', 'g'))) <> ''
			) or upper(btrim(regexp_replace(v_segments[v_len], '\s+\d{5}(?:-\d{4})?$', '', 'g'))) in (
				'US', 'USA', 'UK', 'GB', 'AU', 'NZ', 'MX', 'ES', 'FR', 'IT', 'PT', 'CA'
			) then
				v_parts := array_append(v_parts, array_to_string(v_segments[1:v_len - 2], ', '));
			else
				v_parts := array_append(v_parts, array_to_string(v_segments[1:v_len - 1], ', '));
			end if;
		end if;
	end loop;

	return array_to_string(v_parts, ' | ');
end;
$$;

create or replace function public.match_nearby_groups(
	p_lat double precision default null,
	p_lon double precision default null,
	p_city text default null,
	p_region text default null,
	p_country text default null,
	p_max_miles double precision default 250,
	p_limit integer default 50
)
returns table (
	id uuid,
	slug text,
	name text,
	tagline text,
	description text,
	membership_info text,
	service_area_description text,
	city text,
	state_region text,
	country text,
	logo_url text,
	cover_photo_url text,
	latitude double precision,
	longitude double precision,
	distance_miles double precision,
	match_score double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_has_coords boolean := (
		p_lat is not null
		and p_lon is not null
		and p_lat between -90 and 90
		and p_lon between -180 and 180
	);
	v_max_miles double precision := coalesce(case when p_max_miles is null or p_max_miles <= 0 then 250 else p_max_miles end, 250);
	v_limit integer := coalesce(case when p_limit is null or p_limit <= 0 then 5000 else p_limit end, 5000);
	v_city text := btrim(coalesce(p_city, ''));
	v_raw_region text := btrim(coalesce(p_region, ''));
	v_country text := public.normalize_location_country(p_country);
	v_region_code text;
	v_region_candidates text[];
	v_lat_delta double precision;
begin
	if v_has_coords then
		v_lat_delta := v_max_miles / 68.0;
		return query
		with candidate_distances as (
			select
				g.id,
				g.slug,
				g.name,
				g.tagline,
				g.description,
				g.membership_info,
				g.service_area_description,
				g.city,
				g.state_region,
				g.country,
				g.logo_url,
				g.cover_photo_url,
				g.latitude::double precision as latitude,
				g.longitude::double precision as longitude,
				public.haversine_distance_miles(
					p_lat,
					p_lon,
					g.latitude::double precision,
					g.longitude::double precision
				) as dist
			from public.groups g
			where g.is_published = true
			  and g.latitude is not null
			  and g.longitude is not null
			  and g.latitude between (p_lat - v_lat_delta) and (p_lat + v_lat_delta)
		)
		select
			cd.id,
			cd.slug,
			cd.name,
			cd.tagline,
			cd.description,
			cd.membership_info,
			cd.service_area_description,
			cd.city,
			cd.state_region,
			cd.country,
			cd.logo_url,
			cd.cover_photo_url,
			cd.latitude,
			cd.longitude,
			cd.dist as distance_miles,
			(30.0 - (cd.dist / 10.0))::double precision as match_score
		from candidate_distances cd
		where cd.dist is not null
		  and cd.dist <= v_max_miles
		order by
			cd.dist asc,
			(cd.logo_url is not null or cd.cover_photo_url is not null) desc,
			cd.name asc,
			cd.id asc
		limit v_limit;
		return;
	end if;

	-- Fallback mode (only when visitor coordinates are unavailable):
	-- Infer US country if blank and region is a known US state, then require country + (city or region).
	if v_country = '' and v_raw_region <> '' then
		if public.normalize_region_code('US', v_raw_region) in (
			'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
			'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
			'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
			'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
			'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
			'DC', 'PR'
		) then
			v_country := 'US';
		end if;
	end if;

	-- Exclude country-only matches.
	if v_country = '' or (v_city = '' and v_raw_region = '') then
		return;
	end if;

	v_region_code := public.normalize_region_code(v_country, v_raw_region);
	v_region_candidates := public.expand_region_candidates(v_country, v_raw_region);

	return query
	with scored as (
		select
			g.id,
			g.slug,
			g.name,
			g.tagline,
			g.description,
			g.membership_info,
			g.service_area_description,
			g.city,
			g.state_region,
			g.country,
			g.logo_url,
			g.cover_photo_url,
			g.latitude::double precision as latitude,
			g.longitude::double precision as longitude,
			(
				v_city <> ''
				and public.contains_whole_word(g.city, v_city)
			) as city_matched,
			(
				v_raw_region <> ''
				and (
					(
						v_country in ('US', 'CA', 'AU')
						and public.normalize_region_code(v_country, g.state_region) = v_region_code
					)
					or (
						(
							v_country not in ('US', 'CA', 'AU')
							or public.normalize_region_code(v_country, g.state_region) = v_region_code
							or length(public.normalize_region_code(v_country, g.state_region)) > 3
						)
						and public.matches_any_whole_word(g.state_region, v_region_candidates)
					)
				)
			) as region_matched
		from public.groups g
		where g.is_published = true
		  and public.normalize_location_country(g.country) = v_country
	)
	select
		s.id,
		s.slug,
		s.name,
		s.tagline,
		s.description,
		s.membership_info,
		s.service_area_description,
		s.city,
		s.state_region,
		s.country,
		s.logo_url,
		s.cover_photo_url,
		s.latitude,
		s.longitude,
		null::double precision as distance_miles,
		(
			(case when s.city_matched then 8.0 else 0.0 end) +
			(case when s.region_matched then 3.0 else 0.0 end)
		)::double precision as match_score
	from scored s
	where (
		(v_raw_region <> '' and s.region_matched)
		or (v_raw_region = '' and v_city <> '' and s.city_matched)
	)
	order by
		match_score desc,
		(s.logo_url is not null or s.cover_photo_url is not null) desc,
		s.name asc,
		s.id asc
	limit v_limit;
end;
$$;

create or replace function public.match_nearby_rides(
	p_lat double precision default null,
	p_lon double precision default null,
	p_city text default null,
	p_region text default null,
	p_country text default null,
	p_max_miles double precision default 250,
	p_limit integer default 25
)
returns table (
	id uuid,
	title text,
	slug text,
	summary text,
	description text,
	timezone text,
	status text,
	host_user_id uuid,
	host_group_id uuid,
	start_location_name text,
	start_location_address text,
	start_latitude double precision,
	start_longitude double precision,
	next_occurrence_start timestamptz,
	next_occurrence_end timestamptz,
	image_urls text[],
	group_id uuid,
	group_slug text,
	group_name text,
	group_city text,
	group_state_region text,
	group_country text,
	distance_miles double precision,
	match_score double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_has_coords boolean := (
		p_lat is not null
		and p_lon is not null
		and p_lat between -90 and 90
		and p_lon between -180 and 180
	);
	v_max_miles double precision := coalesce(case when p_max_miles is null or p_max_miles <= 0 then 250 else p_max_miles end, 250);
	v_limit integer := coalesce(case when p_limit is null or p_limit <= 0 then 1000 else p_limit end, 1000);
	v_city text := btrim(coalesce(p_city, ''));
	v_raw_region text := btrim(coalesce(p_region, ''));
	v_country text := public.normalize_location_country(p_country);
	v_region_candidates text[];
begin
	if v_has_coords then
		return query
		with candidate_rides as (
			select
				ae.id,
				ae.title,
				ae.slug,
				ae.summary,
				ae.description,
				ae.timezone,
				ae.status,
				ae.host_user_id,
				ae.host_group_id,
				ae.start_location_name,
				ae.start_location_address,
				ae.start_latitude::double precision as start_latitude,
				ae.start_longitude::double precision as start_longitude,
				ae.next_occurrence_start,
				ae.next_occurrence_end,
				coalesce(rd.image_urls, '{}'::text[]) as image_urls,
				hg.id as group_id,
				hg.slug as group_slug,
				hg.name as group_name,
				hg.city as group_city,
				hg.state_region as group_state_region,
				hg.country as group_country,
				public.haversine_distance_miles(
					p_lat,
					p_lon,
					case
						when ae.start_latitude is not null and ae.start_longitude is not null
							then ae.start_latitude::double precision
						else hg.latitude::double precision
					end,
					case
						when ae.start_latitude is not null and ae.start_longitude is not null
							then ae.start_longitude::double precision
						else hg.longitude::double precision
					end
				) as dist
			from public.activity_events ae
			left join public.ride_details rd
				on rd.activity_event_id = ae.id
			left join public.groups hg
				on hg.id = ae.host_group_id
			   and hg.is_published = true
			where ae.activity_type = 'ride'
			  and ae.status = 'published'
			  and ae.next_occurrence_start >= now()
		)
		select
			cr.id,
			cr.title,
			cr.slug,
			cr.summary,
			cr.description,
			cr.timezone,
			cr.status,
			cr.host_user_id,
			cr.host_group_id,
			cr.start_location_name,
			cr.start_location_address,
			cr.start_latitude,
			cr.start_longitude,
			cr.next_occurrence_start,
			cr.next_occurrence_end,
			cr.image_urls,
			cr.group_id,
			cr.group_slug,
			cr.group_name,
			cr.group_city,
			cr.group_state_region,
			cr.group_country,
			cr.dist as distance_miles,
			(30.0 - (cr.dist / 10.0))::double precision as match_score
		from candidate_rides cr
		where cr.dist is not null
		  and cr.dist <= v_max_miles
		order by
			cr.dist asc,
			cr.next_occurrence_start asc,
			cr.id asc
		limit v_limit;
		return;
	end if;

	if v_country = '' and v_raw_region <> '' then
		if public.normalize_region_code('US', v_raw_region) in (
			'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
			'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
			'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
			'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
			'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
			'DC', 'PR'
		) then
			v_country := 'US';
		end if;
	end if;

	-- Exclude country-only matches.
	if v_country = '' or (v_city = '' and v_raw_region = '') then
		return;
	end if;

	v_region_candidates := public.expand_region_candidates(v_country, v_raw_region);

	return query
	with candidate_rides as (
		select
			ae.id,
			ae.title,
			ae.slug,
			ae.summary,
			ae.description,
			ae.timezone,
			ae.status,
			ae.host_user_id,
			ae.host_group_id,
			ae.start_location_name,
			ae.start_location_address,
			ae.start_latitude::double precision as start_latitude,
			ae.start_longitude::double precision as start_longitude,
			ae.next_occurrence_start,
			ae.next_occurrence_end,
			coalesce(rd.image_urls, '{}'::text[]) as image_urls,
			hg.id as group_id,
			hg.slug as group_slug,
			hg.name as group_name,
			hg.city as group_city,
			hg.state_region as group_state_region,
			hg.country as group_country,
			public.infer_ride_country(
				ae.start_location_name,
				ae.start_location_address,
				hg.country,
				ae.start_latitude::double precision,
				ae.start_longitude::double precision
			) as ride_country,
			public.extract_ride_city_text(
				ae.start_location_name,
				ae.start_location_address,
				hg.city
			) as city_text,
			public.extract_ride_region_text(
				ae.start_location_name,
				ae.start_location_address,
				hg.state_region
			) as region_text
		from public.activity_events ae
		left join public.ride_details rd
			on rd.activity_event_id = ae.id
		left join public.groups hg
			on hg.id = ae.host_group_id
		   and hg.is_published = true
		where ae.activity_type = 'ride'
		  and ae.status = 'published'
		  and ae.next_occurrence_start >= now()
	),
	scored as (
		select
			cr.*,
			(
				v_city <> ''
				and public.contains_whole_word(cr.city_text, v_city)
			) as city_matched,
			(
				v_raw_region <> ''
				and public.matches_any_whole_word(cr.region_text, v_region_candidates)
			) as region_matched
		from candidate_rides cr
		where cr.ride_country = v_country
	)
	select
		s.id,
		s.title,
		s.slug,
		s.summary,
		s.description,
		s.timezone,
		s.status,
		s.host_user_id,
		s.host_group_id,
		s.start_location_name,
		s.start_location_address,
		s.start_latitude,
		s.start_longitude,
		s.next_occurrence_start,
		s.next_occurrence_end,
		s.image_urls,
		s.group_id,
		s.group_slug,
		s.group_name,
		s.group_city,
		s.group_state_region,
		s.group_country,
		null::double precision as distance_miles,
		(
			(case when s.city_matched then 8.0 else 0.0 end) +
			(case when s.region_matched then 3.0 else 0.0 end)
		)::double precision as match_score
	from scored s
	where (
		(v_raw_region <> '' and s.region_matched)
		or (v_raw_region = '' and v_city <> '' and s.city_matched)
	)
	order by
		match_score desc,
		s.next_occurrence_start asc,
		s.id asc
	limit v_limit;
end;
$$;

revoke all on function public.normalize_location_country(text) from public;
revoke all on function public.normalize_region_code(text, text) from public;
revoke all on function public.expand_region_candidates(text, text) from public;
revoke all on function public.contains_whole_word(text, text) from public;
revoke all on function public.matches_any_whole_word(text, text[]) from public;
revoke all on function public.haversine_distance_miles(double precision, double precision, double precision, double precision) from public;
revoke all on function public.infer_ride_country(text, text, text, double precision, double precision) from public;
revoke all on function public.extract_ride_region_text(text, text, text) from public;
revoke all on function public.extract_ride_city_text(text, text, text) from public;

revoke all on function public.match_nearby_groups(double precision, double precision, text, text, text, double precision, integer) from public;
grant execute on function public.match_nearby_groups(double precision, double precision, text, text, text, double precision, integer)
	to anon, authenticated, service_role;

revoke all on function public.match_nearby_rides(double precision, double precision, text, text, text, double precision, integer) from public;
grant execute on function public.match_nearby_rides(double precision, double precision, text, text, text, double precision, integer)
	to anon, authenticated, service_role;
