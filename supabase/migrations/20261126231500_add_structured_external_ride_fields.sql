-- Add structured external registration URL, external group/listing URL, and external organizer name
-- fields to ride_details, create re-run-safe pre-update backup tables for overwritten columns, and
-- safely backfill imported rides without destroying content or touching native rides.

alter table public.ride_details
	add column if not exists external_event_url text null,
	add column if not exists external_group_url text null,
	add column if not exists external_organizer_name text null;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'ride_details_external_event_url_check'
			and conrelid = 'public.ride_details'::regclass
	) then
		alter table public.ride_details
			add constraint ride_details_external_event_url_check
			check (
				external_event_url is null
				or (
					external_event_url = btrim(external_event_url)
					and external_event_url ~* '^https?://[^[:space:]/#?]+([/?#][^[:space:]]*)?$'
				)
			) not valid;
	end if;

	if not exists (
		select 1
		from pg_constraint
		where conname = 'ride_details_external_group_url_check'
			and conrelid = 'public.ride_details'::regclass
	) then
		alter table public.ride_details
			add constraint ride_details_external_group_url_check
			check (
				external_group_url is null
				or (
					external_group_url = btrim(external_group_url)
					and external_group_url ~* '^https?://[^[:space:]/#?]+([/?#][^[:space:]]*)?$'
				)
			) not valid;
	end if;
end
$$;

alter table public.ride_details
	validate constraint ride_details_external_event_url_check;

alter table public.ride_details
	validate constraint ride_details_external_group_url_check;

-- Session-scoped helper functions in pg_temp (dropped at the end of this migration) so URL validation,
-- saved-URL-only footer stripping, and placeholder venue checks stay exact and readable.

create or replace function pg_temp.clean_external_http_url(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
	v_trimmed text;
begin
	if p_raw is null then
		return null;
	end if;
	v_trimmed := btrim(regexp_replace(btrim(p_raw), '[.,;:]+$', ''));
	if v_trimmed = '' then
		return null;
	end if;
	if v_trimmed ~* '^https?://[^[:space:]/#?]+([/?#][^[:space:]]*)?$' then
		return v_trimmed;
	end if;
	return null;
end;
$$;

create or replace function pg_temp.extract_more_info_links(p_description text)
returns table (
	first_url text,
	first_label text,
	second_url text
)
language plpgsql
immutable
as $$
declare
	v_lines text[];
	v_more_idx integer := 0;
	v_idx integer;
	v_line text;
	v_match text[];
	v_url text;
	v_label text;
begin
	first_url := null;
	first_label := null;
	second_url := null;

	if p_description is null or btrim(p_description) = '' then
		return next;
		return;
	end if;

	v_lines := string_to_array(replace(p_description, E'\r\n', E'\n'), E'\n');
	for v_idx in 1..coalesce(array_length(v_lines, 1), 0) loop
		if v_lines[v_idx] ~* '^[[:space:]]*More information:[[:space:]]*$' then
			v_more_idx := v_idx;
		elsif v_lines[v_idx] ~* '^[[:space:]]*More information:[[:space:]]*(https?://.+)$' then
			v_match := regexp_match(v_lines[v_idx], '^[[:space:]]*More information:[[:space:]]*(https?://.+)$', 'i');
			v_url := pg_temp.clean_external_http_url(v_match[1]);
			if v_url is not null then
				if first_url is null then
					first_url := v_url;
				elsif second_url is null and lower(v_url) <> lower(first_url) then
					second_url := v_url;
				end if;
			end if;
		end if;
	end loop;

	if v_more_idx = 0 or v_more_idx >= array_length(v_lines, 1) then
		return next;
		return;
	end if;

	for v_idx in (v_more_idx + 1)..array_length(v_lines, 1) loop
		v_line := btrim(v_lines[v_idx]);
		if v_line = '' then
			continue;
		end if;

		v_url := pg_temp.clean_external_http_url(v_line);
		v_label := null;

		if v_url is null then
			v_match := regexp_match(v_line, '^(.+?):[[:space:]]*(https?://.+)$', 'i');
			if v_match is not null then
				v_url := pg_temp.clean_external_http_url(v_match[2]);
				v_label := nullif(btrim(v_match[1]), '');
			end if;
		end if;

		if v_url is not null then
			if first_url is null then
				first_url := v_url;
				first_label := v_label;
			elsif second_url is null and lower(v_url) <> lower(first_url) then
				second_url := v_url;
			end if;
		end if;
	end loop;

	return next;
end;
$$;

create or replace function pg_temp.strip_saved_external_footers(
	p_description text,
	p_saved_event_url text,
	p_saved_group_url text,
	p_saved_organizer text,
	p_allow_trailing_bare_url boolean
)
returns text
language plpgsql
immutable
as $$
declare
	v_event_url text := lower(nullif(btrim(p_saved_event_url), ''));
	v_group_url text := lower(nullif(btrim(p_saved_group_url), ''));
	v_organizer text := lower(nullif(btrim(p_saved_organizer), ''));
	v_lines text[];
	v_keep boolean[];
	v_len integer;
	v_idx integer;
	v_more_idx integer := 0;
	v_more_stripped integer := 0;
	v_more_kept_nonblank integer := 0;
	v_suffix_start integer;
	v_line text;
	v_match text[];
	v_candidate_url text;
	v_any_stripped boolean := false;
	v_last_nonblank integer := 0;
	v_prior_nonblank boolean := false;
	v_out_lines text[] := array[]::text[];
	v_prev_blank boolean := false;
	v_joined text;
begin
	if p_description is null then
		return null;
	end if;

	v_lines := string_to_array(replace(p_description, E'\r\n', E'\n'), E'\n');
	v_len := coalesce(array_length(v_lines, 1), 0);
	if v_len = 0 then
		return p_description;
	end if;

	v_keep := array_fill(true, array[v_len]);

	-- Pass 1: Trailing "More information:" block — strip a link line only if its URL was saved to a column.
	for v_idx in 1..v_len loop
		if v_lines[v_idx] ~* '^[[:space:]]*More information:[[:space:]]*$' then
			v_more_idx := v_idx;
		end if;
	end loop;

	if v_more_idx > 0 and v_more_idx < v_len then
		for v_idx in (v_more_idx + 1)..v_len loop
			v_line := btrim(v_lines[v_idx]);
			if v_line = '' then
				continue;
			end if;

			v_candidate_url := pg_temp.clean_external_http_url(v_line);
			if v_candidate_url is null then
				v_match := regexp_match(v_line, '^(.+?):[[:space:]]*(https?://.+)$', 'i');
				if v_match is not null then
					v_candidate_url := pg_temp.clean_external_http_url(v_match[2]);
				end if;
			end if;

			if v_candidate_url is not null
				and (lower(v_candidate_url) = v_event_url or lower(v_candidate_url) = v_group_url)
			then
				v_keep[v_idx] := false;
				v_more_stripped := v_more_stripped + 1;
				v_any_stripped := true;
			else
				v_more_kept_nonblank := v_more_kept_nonblank + 1;
			end if;
		end loop;

		if v_more_stripped > 0 and v_more_kept_nonblank = 0 then
			v_keep[v_more_idx] := false;
			for v_idx in (v_more_idx + 1)..v_len loop
				if btrim(v_lines[v_idx]) = '' then
					v_keep[v_idx] := false;
				end if;
			end loop;
		end if;
	end if;

	-- Pass 2a: Explicit labeled footer URL lines whose exact URL was saved to a column.
	for v_idx in 1..v_len loop
		if not v_keep[v_idx] then
			continue;
		end if;
		v_line := btrim(v_lines[v_idx]);
		if v_line = '' then
			continue;
		end if;

		if v_line ~* '^(Meetup event|Meetup group page|Event link|WeeklyRides listing|More information):[[:space:]]*(https?://.+)$' then
			v_match := regexp_match(
				v_line,
				'^(?:Meetup event|Meetup group page|Event link|WeeklyRides listing|More information):[[:space:]]*(https?://.+)$',
				'i'
			);
			v_candidate_url := pg_temp.clean_external_http_url(v_match[1]);
			if v_candidate_url is not null
				and (lower(v_candidate_url) = v_event_url or lower(v_candidate_url) = v_group_url)
			then
				v_keep[v_idx] := false;
				v_any_stripped := true;
			end if;
		end if;
	end loop;

	-- Pass 2b: Contiguous trailing Meetup group organizer lines when organizer + URL were saved.
	v_suffix_start := v_len + 1;
	for v_idx in reverse v_len..1 loop
		if not v_keep[v_idx] then
			v_suffix_start := v_idx;
			continue;
		end if;
		v_line := btrim(v_lines[v_idx]);
		if v_line = ''
			or v_line ~* '^(Meetup group|Meetup event|Meetup group page|Event link|WeeklyRides listing|More information):'
		then
			v_suffix_start := v_idx;
		else
			exit;
		end if;
	end loop;

	if v_suffix_start <= v_len then
		for v_idx in v_suffix_start..v_len loop
			if not v_keep[v_idx] then
				continue;
			end if;
			v_line := btrim(v_lines[v_idx]);
			if v_line ~* '^Meetup group:[[:space:]]*(.*)$' then
				v_match := regexp_match(v_line, '^Meetup group:[[:space:]]*(.*)$', 'i');
				if v_organizer is not null
					and lower(btrim(v_match[1])) = v_organizer
					and (v_event_url is not null or v_group_url is not null)
				then
					v_keep[v_idx] := false;
					v_any_stripped := true;
				end if;
			end if;
		end loop;
	end if;

	-- Pass 3: Trailing bare URL line on unclaimed imported rides when that exact URL was saved.
	if p_allow_trailing_bare_url and (v_event_url is not null or v_group_url is not null) then
		for v_idx in reverse v_len..1 loop
			if v_keep[v_idx] and btrim(v_lines[v_idx]) <> '' then
				v_last_nonblank := v_idx;
				exit;
			end if;
		end loop;

		if v_last_nonblank > 1 then
			for v_idx in 1..(v_last_nonblank - 1) loop
				if v_keep[v_idx] and btrim(v_lines[v_idx]) <> '' then
					v_prior_nonblank := true;
					exit;
				end if;
			end loop;

			if v_prior_nonblank and btrim(v_lines[v_last_nonblank]) ~* '^https?://[^[:space:]]+$' then
				v_candidate_url := pg_temp.clean_external_http_url(v_lines[v_last_nonblank]);
				if v_candidate_url is not null
					and (lower(v_candidate_url) = v_event_url or lower(v_candidate_url) = v_group_url)
				then
					v_keep[v_last_nonblank] := false;
					v_any_stripped := true;
				end if;
			end if;
		end if;
	end if;

	-- Preserve untouched text byte-for-byte if no saved footer line was stripped.
	if not v_any_stripped then
		return p_description;
	end if;

	for v_idx in 1..v_len loop
		if not v_keep[v_idx] then
			continue;
		end if;
		if btrim(v_lines[v_idx]) = '' then
			if coalesce(array_length(v_out_lines, 1), 0) = 0 or v_prev_blank then
				continue;
			end if;
			v_out_lines := array_append(v_out_lines, '');
			v_prev_blank := true;
		else
			v_out_lines := array_append(v_out_lines, v_lines[v_idx]);
			v_prev_blank := false;
		end if;
	end loop;

	v_joined := btrim(array_to_string(v_out_lines, E'\n'), E' \t\r\n');
	return nullif(v_joined, '');
end;
$$;

create or replace function pg_temp.segment_has_street_number(p_segment text)
returns boolean
language plpgsql
immutable
as $$
declare
	v_seg text := btrim(coalesce(p_segment, ''));
begin
	if v_seg = '' then
		return false;
	end if;
	if v_seg !~ '[0-9]' or v_seg !~ '[[:alpha:]]' then
		return false;
	end if;
	-- State/province + numeric postal code (e.g. "CA 92118", "NSW 2016")
	if v_seg ~* '^[a-z]{2,3}[[:space:]]+[0-9]{4,6}(-[0-9]{4})?$' then
		return false;
	end if;
	-- Canadian postal code (alone or prefixed by province)
	if v_seg ~* '^([a-z]{2}[[:space:]]+)?[a-z][0-9][a-z][[:space:]]*[0-9][a-z][0-9]$' then
		return false;
	end if;
	-- UK postcode / outward district code (e.g. "X5", "CF10 3AT", "SW1A 1AA")
	if v_seg ~* '^[a-z]{1,2}[0-9][a-z0-9]?([[:space:]]*[0-9][a-z]{2})?$' then
		return false;
	end if;
	-- City + state + US ZIP with no street number before it (e.g. "Lake Bluff IL 60044")
	if v_seg ~* '^[[:alpha:][:space:].''-]+?[[:space:]]+[a-z]{2}[[:space:]]+[0-9]{5}(-[0-9]{4})?$' then
		return false;
	end if;
	-- City + trailing 5/6-digit postal/PIN code with no street number before it (e.g. "Bengaluru 560001")
	if v_seg ~* '^[[:alpha:][:space:].''-]+?[[:space:]]+[0-9]{5,6}$' then
		return false;
	end if;
	return true;
end;
$$;

create or replace function pg_temp.resolve_placeholder_venue_name(
	p_current_name text,
	p_address text
)
returns text
language plpgsql
immutable
as $$
declare
	v_segs text[];
	v_seg1 text;
	v_seg2 text;
begin
	-- Only replace placeholder values (exactly "Meetup event" case-insensitive, or empty).
	-- Never overwrite a real venue or event name.
	if btrim(coalesce(p_current_name, '')) <> ''
		and lower(btrim(p_current_name)) <> 'meetup event'
	then
		return p_current_name;
	end if;

	select array_agg(btrim(seg) order by idx)
	into v_segs
	from unnest(string_to_array(coalesce(p_address, ''), ',')) with ordinality as parts(seg, idx)
	where btrim(seg) <> '';

	if coalesce(array_length(v_segs, 1), 0) = 0 then
		return p_current_name;
	end if;

	v_seg1 := v_segs[1];
	v_seg2 := case when array_length(v_segs, 1) >= 2 then v_segs[2] else null end;

	if v_seg1 = '' or lower(v_seg1) = 'meetup event' or v_seg1 ~* '^[a-z]{2}$' then
		return p_current_name;
	end if;

	-- Leave unchanged if the address has no street number (e.g. bare city, region, or country).
	if not pg_temp.segment_has_street_number(v_seg1)
		and not pg_temp.segment_has_street_number(v_seg2)
	then
		return p_current_name;
	end if;

	if array_length(v_segs, 1) >= 2
		and not pg_temp.segment_has_street_number(v_seg1)
		and lower(v_seg1) = lower(v_segs[array_length(v_segs, 1)])
	then
		return p_current_name;
	end if;

	return v_seg1;
end;
$$;

-- Precompute exact backfill plans in pg_temp BEFORE any UPDATE runs so backup tables capture
-- the exact rows that will be modified (scoped strictly to imported rides with source_event_id).

drop table if exists pg_temp.ride_external_backfill_plan;
create temp table ride_external_backfill_plan as
with candidates as (
	select
		rd.activity_event_id,
		rd.external_event_url as current_event_url,
		rd.external_group_url as current_group_url,
		rd.external_organizer_name as current_organizer_name,
		ae.source_event_id,
		ae.slug,
		ae.title,
		ae.description,
		ae.host_user_id,
		ae.host_group_id,
		pg_temp.clean_external_http_url(ae.source_event_id) as source_url,
		pg_temp.clean_external_http_url(
			(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Meetup event:[[:space:]]*([^\r\n]+)', 'i'))[1]
		) as meetup_event_url,
		pg_temp.clean_external_http_url(
			(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Meetup group page:[[:space:]]*([^\r\n]+)', 'i'))[1]
		) as meetup_group_url,
		nullif(
			btrim((regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Meetup group:[[:space:]]*([^\r\n]+)', 'i'))[1]),
			''
		) as meetup_group_name,
		pg_temp.clean_external_http_url(
			(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Event link:[[:space:]]*([^\r\n]+)', 'i'))[1]
		) as wr_event_url,
		pg_temp.clean_external_http_url(
			(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*WeeklyRides listing:[[:space:]]*([^\r\n]+)', 'i'))[1]
		) as wr_listing_url,
		mi.first_url as more_info_first_url,
		mi.first_label as more_info_first_label,
		mi.second_url as more_info_second_url
	from public.ride_details rd
	join public.activity_events ae on ae.id = rd.activity_event_id
	left join lateral pg_temp.extract_more_info_links(ae.description) mi on true
	where ae.activity_type = 'ride'
		and ae.source_event_id is not null
		and btrim(ae.source_event_id) <> ''
),
extracted as (
	select
		c.activity_event_id,
		c.current_event_url,
		c.current_group_url,
		c.current_organizer_name,
		case
			when coalesce(c.source_event_id, '') ~* '(^meetup:|meetup\.com/)'
				or c.slug like 'meetup-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:)'
			then coalesce(c.meetup_event_url, c.source_url, c.more_info_first_url)
			when coalesce(c.source_event_id, '') ~* 'weeklyrides\.com'
				or c.slug like 'weeklyrides-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*WeeklyRides listing:'
			then coalesce(c.wr_event_url, c.wr_listing_url, c.source_url, c.more_info_first_url)
			when c.wr_event_url is not null
			then c.wr_event_url
			when c.more_info_first_url is not null
			then c.more_info_first_url
			when c.host_user_id is null
				and c.host_group_id is null
				and coalesce(c.description, '') ~* '(?:^|\n)[[:space:]]*(https?://[^[:space:]]+)[[:space:]]*$'
			then coalesce(
				pg_temp.clean_external_http_url(
					(regexp_match(coalesce(c.description, ''), '(?:^|\n)[[:space:]]*(https?://[^[:space:]]+)[[:space:]]*$', 'i'))[1]
				),
				c.source_url
			)
			else c.source_url
		end as extracted_event_url,
		case
			when coalesce(c.source_event_id, '') ~* '(^meetup:|meetup\.com/)'
				or c.slug like 'meetup-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:)'
			then coalesce(c.meetup_group_url, c.more_info_second_url)
			when coalesce(c.source_event_id, '') ~* 'weeklyrides\.com'
				or c.slug like 'weeklyrides-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*WeeklyRides listing:'
			then coalesce(
				case
					when c.wr_listing_url is not null
						and lower(c.wr_listing_url) is distinct from lower(
							coalesce(c.current_event_url, c.wr_event_url, c.wr_listing_url, c.source_url)
						)
					then c.wr_listing_url
					else null
				end,
				c.more_info_second_url
			)
			else c.more_info_second_url
		end as extracted_group_url,
		case
			when coalesce(c.source_event_id, '') ~* '(^meetup:|meetup\.com/)'
				or c.slug like 'meetup-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:)'
			then c.meetup_group_name
			when coalesce(c.source_event_id, '') ~* 'weeklyrides\.com'
				or c.slug like 'weeklyrides-%'
				or coalesce(c.description, '') ~* '(^|\n)[[:space:]]*WeeklyRides listing:'
			then (
				case
					when c.wr_event_url ~* '^https?://(?:www\.)?meetup\.com/([^/?#]+)'
					then initcap(replace((regexp_match(c.wr_event_url, '^https?://(?:www\.)?meetup\.com/([^/?#]+)', 'i'))[1], '-', ' '))
					when c.wr_event_url is not null
						and c.wr_event_url !~* '^https?://([^/]+\.)?(weeklyrides\.com|facebook\.com|fb\.me|instagram\.com|eventbrite\.com)(/|$)'
					then lower(regexp_replace((regexp_match(c.wr_event_url, '^https?://([^/?#:]+)', 'i'))[1], '^www\.', '', 'i'))
					else 'WeeklyRides'
				end
			)
			when c.more_info_first_label is not null
				and lower(c.more_info_first_label) not in (
					'meetup event',
					'meetup group',
					'meetup group page',
					'weeklyrides listing',
					'reference link',
					'event link',
					'more info',
					'more information',
					'website',
					'register',
					'click here'
				)
			then c.more_info_first_label
			else null
		end as extracted_organizer_name
	from candidates c
)
select
	e.activity_event_id,
	coalesce(e.current_event_url, e.extracted_event_url) as final_event_url,
	coalesce(
		e.current_group_url,
		case
			when e.extracted_group_url is not null
				and lower(e.extracted_group_url) is distinct from lower(coalesce(e.current_event_url, e.extracted_event_url))
			then e.extracted_group_url
			else null
		end
	) as final_group_url,
	coalesce(e.current_organizer_name, nullif(btrim(e.extracted_organizer_name), '')) as final_organizer_name,
	(
		(e.current_event_url is null and e.extracted_event_url is not null)
		or (
			e.current_group_url is null
			and e.extracted_group_url is not null
			and lower(e.extracted_group_url) is distinct from lower(coalesce(e.current_event_url, e.extracted_event_url))
		)
		or (e.current_organizer_name is null and nullif(btrim(e.extracted_organizer_name), '') is not null)
	) as needs_external_update
from extracted e;

drop table if exists pg_temp.activity_events_backfill_plan;
create temp table activity_events_backfill_plan as
with candidate_activities as (
	select
		ae.id,
		ae.summary as current_summary,
		ae.description as current_description,
		ae.start_location_name as current_location_name,
		pg_temp.strip_saved_external_footers(
			ae.description,
			coalesce(ep.final_event_url, rd.external_event_url),
			coalesce(ep.final_group_url, rd.external_group_url),
			coalesce(ep.final_organizer_name, rd.external_organizer_name),
			(ae.host_user_id is null and ae.host_group_id is null)
		) as next_description,
		pg_temp.resolve_placeholder_venue_name(
			ae.start_location_name,
			ae.start_location_address
		) as next_location_name,
		coalesce(ep.final_event_url, rd.external_event_url) as saved_event_url,
		coalesce(ep.final_group_url, rd.external_group_url) as saved_group_url,
		coalesce(ep.final_organizer_name, rd.external_organizer_name) as saved_organizer_name
	from public.activity_events ae
	left join public.ride_details rd on rd.activity_event_id = ae.id
	left join pg_temp.ride_external_backfill_plan ep on ep.activity_event_id = ae.id
	where ae.activity_type = 'ride'
		and ae.source_event_id is not null
		and btrim(ae.source_event_id) <> ''
),
resolved_activities as (
	select
		ca.id,
		ca.current_description,
		ca.current_summary,
		ca.current_location_name,
		ca.next_description,
		case
			when ca.current_summary is not null
				and ca.current_summary ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:|Event link:|WeeklyRides listing:|More information:)'
			then coalesce(
				pg_temp.strip_saved_external_footers(
					ca.current_summary,
					ca.saved_event_url,
					ca.saved_group_url,
					ca.saved_organizer_name,
					false
				),
				ca.current_summary
			)
			else ca.current_summary
		end as next_summary,
		ca.next_location_name
	from candidate_activities ca
)
select
	ra.id,
	ra.current_description,
	ra.current_summary,
	ra.current_location_name,
	ra.next_description,
	ra.next_summary,
	ra.next_location_name
from resolved_activities ra
where ra.current_description is distinct from ra.next_description
	or ra.current_summary is distinct from ra.next_summary
	or ra.current_location_name is distinct from ra.next_location_name;

drop table if exists pg_temp.ride_details_backfill_plan;
create temp table ride_details_backfill_plan as
with candidate_details as (
	select
		rd.activity_event_id,
		rd.pace_notes as current_pace_notes,
		rd.external_event_url as current_event_url,
		rd.external_group_url as current_group_url,
		rd.external_organizer_name as current_organizer_name,
		ae.summary as current_summary,
		ae.description as current_description,
		ap.next_summary,
		ap.next_description,
		coalesce(ep.final_event_url, rd.external_event_url) as next_event_url,
		coalesce(ep.final_group_url, rd.external_group_url) as next_group_url,
		coalesce(ep.final_organizer_name, rd.external_organizer_name) as next_organizer_name,
		case
			when rd.pace_notes is not null
				and rd.pace_notes ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:|Event link:|WeeklyRides listing:|More information:)'
			then pg_temp.strip_saved_external_footers(
				rd.pace_notes,
				coalesce(ep.final_event_url, rd.external_event_url),
				coalesce(ep.final_group_url, rd.external_group_url),
				coalesce(ep.final_organizer_name, rd.external_organizer_name),
				false
			)
			else rd.pace_notes
		end as stripped_pace_notes
	from public.ride_details rd
	join public.activity_events ae on ae.id = rd.activity_event_id
	left join pg_temp.ride_external_backfill_plan ep on ep.activity_event_id = ae.id
	left join pg_temp.activity_events_backfill_plan ap on ap.id = ae.id
	where ae.activity_type = 'ride'
		and ae.source_event_id is not null
		and btrim(ae.source_event_id) <> ''
),
resolved_details as (
	select
		cd.activity_event_id,
		cd.current_pace_notes,
		cd.current_event_url,
		cd.current_group_url,
		cd.current_organizer_name,
		case
			when cd.current_pace_notes is null then null
			when btrim(cd.current_pace_notes) = '' then null
			when lower(btrim(cd.current_pace_notes)) = lower(btrim(coalesce(cd.current_summary, '')))
				or lower(btrim(cd.current_pace_notes)) = lower(btrim(coalesce(cd.current_description, '')))
				or lower(btrim(cd.current_pace_notes)) = lower(btrim(coalesce(cd.next_summary, cd.current_summary, '')))
				or lower(btrim(cd.current_pace_notes)) = lower(btrim(coalesce(cd.next_description, cd.current_description, '')))
			then null
			when cd.stripped_pace_notes is null or btrim(cd.stripped_pace_notes) = '' then null
			when lower(btrim(cd.stripped_pace_notes)) = lower(btrim(coalesce(cd.current_summary, '')))
				or lower(btrim(cd.stripped_pace_notes)) = lower(btrim(coalesce(cd.current_description, '')))
				or lower(btrim(cd.stripped_pace_notes)) = lower(btrim(coalesce(cd.next_summary, cd.current_summary, '')))
				or lower(btrim(cd.stripped_pace_notes)) = lower(btrim(coalesce(cd.next_description, cd.current_description, '')))
			then null
			else cd.stripped_pace_notes
		end as next_pace_notes,
		cd.next_event_url,
		cd.next_group_url,
		cd.next_organizer_name
	from candidate_details cd
)
select
	r.activity_event_id,
	r.current_pace_notes,
	r.next_pace_notes,
	r.next_event_url,
	r.next_group_url,
	r.next_organizer_name
from resolved_details r
where r.current_pace_notes is distinct from r.next_pace_notes
	or r.current_event_url is distinct from r.next_event_url
	or r.current_group_url is distinct from r.next_group_url
	or r.current_organizer_name is distinct from r.next_organizer_name;

-- 0. Create pre-update backup tables before any UPDATE executes, and append snapshots for any
--    newly affected rows when re-run so no row is ever modified without a backup snapshot.
do $$
begin
	if to_regclass('public.activity_events_backfill_20261124') is null then
		create table public.activity_events_backfill_20261124 as
		select
			ae.id,
			ae.description,
			ae.summary,
			ae.start_location_name,
			ae.updated_at
		from public.activity_events ae
		where ae.id in (select ap.id from pg_temp.activity_events_backfill_plan ap);
	else
		alter table public.activity_events_backfill_20261124
			add column if not exists updated_at timestamptz;

		insert into public.activity_events_backfill_20261124 (
			id,
			description,
			summary,
			start_location_name,
			updated_at
		)
		select
			ae.id,
			ae.description,
			ae.summary,
			ae.start_location_name,
			ae.updated_at
		from public.activity_events ae
		where ae.id in (select ap.id from pg_temp.activity_events_backfill_plan ap)
			and ae.id not in (
				select b.id
				from public.activity_events_backfill_20261124 b
				where b.id is not null
			);
	end if;

	if to_regclass('public.ride_details_backfill_20261124') is null then
		create table public.ride_details_backfill_20261124 as
		select
			rd.activity_event_id,
			rd.pace_notes,
			rd.external_event_url,
			rd.external_group_url,
			rd.external_organizer_name,
			rd.updated_at
		from public.ride_details rd
		where rd.activity_event_id in (
			select rp.activity_event_id from pg_temp.ride_details_backfill_plan rp
		);
	else
		alter table public.ride_details_backfill_20261124
			add column if not exists external_event_url text,
			add column if not exists external_group_url text,
			add column if not exists external_organizer_name text,
			add column if not exists updated_at timestamptz;

		insert into public.ride_details_backfill_20261124 (
			activity_event_id,
			pace_notes,
			external_event_url,
			external_group_url,
			external_organizer_name,
			updated_at
		)
		select
			rd.activity_event_id,
			rd.pace_notes,
			rd.external_event_url,
			rd.external_group_url,
			rd.external_organizer_name,
			rd.updated_at
		from public.ride_details rd
		where rd.activity_event_id in (
			select rp.activity_event_id from pg_temp.ride_details_backfill_plan rp
		)
			and rd.activity_event_id not in (
				select b.activity_event_id
				from public.ride_details_backfill_20261124 b
				where b.activity_event_id is not null
			);
	end if;
end
$$;

alter table public.activity_events_backfill_20261124 enable row level security;
alter table public.ride_details_backfill_20261124 enable row level security;

revoke all on table
	public.activity_events_backfill_20261124,
	public.ride_details_backfill_20261124
from public, anon, authenticated;

-- 1. Apply verified pace_notes and external_* updates on imported ride_details rows
--    (backed up in public.ride_details_backfill_20261124).
update public.ride_details rd
set
	pace_notes = rp.next_pace_notes,
	external_event_url = rp.next_event_url,
	external_group_url = rp.next_group_url,
	external_organizer_name = rp.next_organizer_name,
	updated_at = timezone('utc', now())
from pg_temp.ride_details_backfill_plan rp
where rd.activity_event_id = rp.activity_event_id
	and (
		rd.pace_notes is distinct from rp.next_pace_notes
		or rd.external_event_url is distinct from rp.next_event_url
		or rd.external_group_url is distinct from rp.next_group_url
		or rd.external_organizer_name is distinct from rp.next_organizer_name
	);

-- 2. Apply verified description, summary, and placeholder start_location_name updates on imported rides
--    (backed up in public.activity_events_backfill_20261124).
update public.activity_events ae
set
	description = ap.next_description,
	summary = ap.next_summary,
	start_location_name = ap.next_location_name,
	updated_at = timezone('utc', now())
from pg_temp.activity_events_backfill_plan ap
where ae.id = ap.id
	and (
		ae.description is distinct from ap.next_description
		or ae.summary is distinct from ap.next_summary
		or ae.start_location_name is distinct from ap.next_location_name
	);

drop table if exists pg_temp.ride_details_backfill_plan;
drop table if exists pg_temp.activity_events_backfill_plan;
drop table if exists pg_temp.ride_external_backfill_plan;
drop function if exists pg_temp.resolve_placeholder_venue_name(text, text);
drop function if exists pg_temp.segment_has_street_number(text);
drop function if exists pg_temp.strip_saved_external_footers(text, text, text, text, boolean);
drop function if exists pg_temp.extract_more_info_links(text);
drop function if exists pg_temp.clean_external_http_url(text);

-- Rollback (manual): restore overwritten activity_events and ride_details values from backup tables.
-- begin;
-- update public.activity_events ae
-- set
-- 	description = b.description,
-- 	summary = b.summary,
-- 	start_location_name = b.start_location_name,
-- 	updated_at = coalesce(b.updated_at, ae.updated_at)
-- from public.activity_events_backfill_20261124 b
-- where ae.id = b.id;
--
-- update public.ride_details rd
-- set
-- 	pace_notes = b.pace_notes,
-- 	external_event_url = b.external_event_url,
-- 	external_group_url = b.external_group_url,
-- 	external_organizer_name = b.external_organizer_name,
-- 	updated_at = coalesce(b.updated_at, rd.updated_at)
-- from public.ride_details_backfill_20261124 b
-- where rd.activity_event_id = b.activity_event_id;
-- -- Optional schema rollback (if dropping the structured columns completely):
-- -- alter table public.ride_details
-- -- 	drop column if exists external_event_url,
-- -- 	drop column if exists external_group_url,
-- -- 	drop column if exists external_organizer_name;
-- commit;
