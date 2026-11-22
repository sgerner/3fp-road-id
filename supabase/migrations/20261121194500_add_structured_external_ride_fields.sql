-- Add structured external registration URL and external organizer name fields to ride_details,
-- and backfill existing imported rides to remove description link dumps, duplicated pace_notes,
-- and overwritten start_location_name placeholders.

alter table public.ride_details
	add column if not exists external_event_url text null,
	add column if not exists external_organizer_name text null;

alter table public.ride_details
	drop constraint if exists ride_details_external_event_url_check;

alter table public.ride_details
	add constraint ride_details_external_event_url_check
	check (
		external_event_url is null
		or (
			external_event_url = btrim(external_event_url)
			and external_event_url ~* '^https?://[^[:space:]/#?]+([/?#][^[:space:]]*)?$'
		)
	);

-- 1. Clear pace_notes values that duplicate summary/description or contain legacy link footers.
update public.ride_details rd
set
	pace_notes = null,
	updated_at = timezone('utc', now())
from public.activity_events ae
where rd.activity_event_id = ae.id
	and rd.pace_notes is not null
	and (
		btrim(rd.pace_notes) = ''
		or lower(btrim(rd.pace_notes)) = lower(btrim(coalesce(ae.summary, '')))
		or lower(btrim(rd.pace_notes)) = lower(btrim(coalesce(ae.description, '')))
		or rd.pace_notes ~* '(^|\n)[[:space:]]*(Meetup group:|Meetup event:|Meetup group page:|Event link:|WeeklyRides listing:|More information:)'
	);

-- 2. Backfill external_event_url and external_organizer_name from imported ride metadata.
with extracted as (
	select
		rd.activity_event_id,
		case
			when coalesce(ae.source_event_id, '') ~* '(^meetup:|meetup\.com/)'
				or ae.slug like 'meetup-%'
				or coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*Meetup event:[[:space:]]*https?://'
			then coalesce(
				(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Meetup event:[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1],
				case
					when coalesce(ae.source_event_id, '') ~* '^https?://[^[:space:]]+$'
					then btrim(ae.source_event_id)
					else null
				end
			)
			when coalesce(ae.source_event_id, '') ~* 'weeklyrides\.com'
				or ae.slug like 'weeklyrides-%'
				or coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*WeeklyRides listing:[[:space:]]*https?://'
			then coalesce(
				(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Event link:[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1],
				(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*WeeklyRides listing:[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1],
				case
					when coalesce(ae.source_event_id, '') ~* '^https?://[^[:space:]]+$'
					then btrim(ae.source_event_id)
					else null
				end
			)
			when coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*More information:[[:space:]]*\r?\n'
			then coalesce(
				(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*More information:[[:space:]]*(?:\r?\n)+[[:space:]]*[^:\r\n]+:[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1],
				(regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*More information:[[:space:]]*(?:\r?\n)+[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1]
			)
			when ae.source_event_id is not null
				and ae.host_user_id is null
				and ae.host_group_id is null
				and coalesce(ae.description, '') ~* '(https?://[^[:space:]]+)[[:space:]]*$'
			then (regexp_match(coalesce(ae.description, ''), '(https?://[^[:space:]]+)[[:space:]]*$', 'i'))[1]
			when coalesce(ae.source_event_id, '') ~* '^https?://[^[:space:]]+$'
			then btrim(ae.source_event_id)
			else null
		end as raw_url,
		case
			when coalesce(ae.source_event_id, '') ~* '(^meetup:|meetup\.com/)'
				or ae.slug like 'meetup-%'
				or coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*Meetup group:[[:space:]]*[^\r\n]+'
			then nullif(
				btrim((regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Meetup group:[[:space:]]*([^\r\n]+)', 'i'))[1]),
				''
			)
			when coalesce(ae.source_event_id, '') ~* 'weeklyrides\.com'
				or ae.slug like 'weeklyrides-%'
				or coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*WeeklyRides listing:[[:space:]]*https?://'
			then (
				with wr_link as (
					select (regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*Event link:[[:space:]]*(https?://[^[:space:]]+)', 'i'))[1] as event_url
				)
				select
					case
						when event_url ~* '^https?://(?:www\.)?meetup\.com/([^/?#]+)'
						then initcap(replace((regexp_match(event_url, '^https?://(?:www\.)?meetup\.com/([^/?#]+)', 'i'))[1], '-', ' '))
						when event_url is not null
							and event_url !~* '^https?://([^/]+\.)?(weeklyrides\.com|facebook\.com|fb\.me|instagram\.com|eventbrite\.com)(/|$)'
						then lower(regexp_replace((regexp_match(event_url, '^https?://([^/?#:]+)', 'i'))[1], '^www\.', '', 'i'))
						else 'WeeklyRides'
					end
				from wr_link
			)
			when coalesce(ae.description, '') ~* '(^|\n)[[:space:]]*More information:[[:space:]]*(?:\r?\n)+[[:space:]]*[^:\r\n]+:[[:space:]]*https?://'
			then nullif(
				btrim((regexp_match(coalesce(ae.description, ''), '(?:^|\n)[[:space:]]*More information:[[:space:]]*(?:\r?\n)+[[:space:]]*([^:\r\n]+):[[:space:]]*https?://[^[:space:]]+', 'i'))[1]),
				''
			)
			when ae.source_event_id is not null
				and ae.host_user_id is null
				and ae.host_group_id is null
				and btrim(coalesce(ae.start_location_name, '')) <> ''
				and lower(btrim(ae.start_location_name)) <> 'meetup event'
				and lower(btrim(ae.start_location_name)) <> lower(btrim(coalesce(ae.title, '')))
				and position(lower(btrim(ae.start_location_name)) in lower(coalesce(ae.start_location_address, ''))) = 0
			then btrim(ae.start_location_name)
			else null
		end as organizer_name
	from public.ride_details rd
	join public.activity_events ae on ae.id = rd.activity_event_id
),
sanitized as (
	select
		activity_event_id,
		case
			when regexp_replace(coalesce(raw_url, ''), '[.,;:]+$', '') ~* '^https?://[^[:space:]/#?]+([/?#][^[:space:]]*)?$'
			then btrim(regexp_replace(raw_url, '[.,;:]+$', ''))
			else null
		end as clean_url,
		nullif(btrim(organizer_name), '') as clean_organizer
	from extracted
)
update public.ride_details rd
set
	external_event_url = coalesce(rd.external_event_url, s.clean_url),
	external_organizer_name = coalesce(rd.external_organizer_name, s.clean_organizer),
	updated_at = timezone('utc', now())
from sanitized s
where rd.activity_event_id = s.activity_event_id
	and (
		(rd.external_event_url is null and s.clean_url is not null)
		or (rd.external_organizer_name is null and s.clean_organizer is not null)
	);

-- 3. Strip appended link footers from activity_events.description, clean polluted summaries,
-- and replace placeholder or overwritten start_location_name values with real venues.
with cleaned_activities as (
	select
		ae.id,
		ae.summary as current_summary,
		ae.description as current_description,
		ae.start_location_name as current_location_name,
		nullif(
			btrim(
				regexp_replace(
					regexp_replace(
						regexp_replace(
							coalesce(ae.description, ''),
							'(?:^|\r?\n)[[:space:]]*(?:Meetup group:[[:space:]]*[^\r\n]+|Meetup event:[[:space:]]*https?://[^\r\n]+|Meetup group page:[[:space:]]*https?://[^\r\n]+)(?:[[:space:]]*\r?\n[[:space:]]*(?:Meetup group:[[:space:]]*[^\r\n]+|Meetup event:[[:space:]]*https?://[^\r\n]+|Meetup group page:[[:space:]]*https?://[^\r\n]+))*[[:space:]]*$',
							'',
							'i'
						),
						'(?:^|\r?\n)[[:space:]]*(?:Event link:[[:space:]]*https?://[^\r\n]+|WeeklyRides listing:[[:space:]]*https?://[^\r\n]+)(?:[[:space:]]*\r?\n[[:space:]]*(?:Event link:[[:space:]]*https?://[^\r\n]+|WeeklyRides listing:[[:space:]]*https?://[^\r\n]+))*[[:space:]]*$',
						'',
						'i'
					),
					'(?:^|\r?\n)[[:space:]]*More information:[[:space:]]*(?:(?:\r?\n)+[[:space:]]*(?:[^:\r\n]+:[[:space:]]*)?https?://[^\r\n]+)+[[:space:]]*$',
					'',
					'i'
				)
			),
			''
		) as stripped_description,
		coalesce(
			(
				select nullif(btrim(seg), '')
				from unnest(string_to_array(coalesce(ae.start_location_address, ''), ',')) with ordinality as parts(seg, idx)
				where btrim(seg) <> ''
				order by idx
				limit 1
			),
			'Ride start'
		) as address_venue,
		rd.external_event_url,
		rd.external_organizer_name,
		ae.source_event_id,
		ae.host_user_id,
		ae.host_group_id,
		ae.slug,
		ae.title,
		ae.start_location_address
	from public.activity_events ae
	left join public.ride_details rd on rd.activity_event_id = ae.id
	where ae.activity_type = 'ride'
),
final_activities as (
	select
		ca.id,
		ca.current_summary,
		ca.current_description,
		ca.current_location_name,
		case
			when ca.source_event_id is not null
				and ca.host_user_id is null
				and ca.host_group_id is null
				and ca.external_event_url is not null
				and ca.stripped_description is not null
				and lower(
					coalesce(
						(regexp_match(ca.stripped_description, '(?:\r?\n[[:space:]]*)+(https?://[^[:space:]]+)[[:space:]]*$', 'i'))[1],
						''
					)
				) = lower(ca.external_event_url)
			then nullif(
				btrim(
					regexp_replace(
						ca.stripped_description,
						'(?:\r?\n[[:space:]]*)+https?://[^[:space:]]+[[:space:]]*$',
						'',
						'i'
					)
				),
				''
			)
			else ca.stripped_description
		end as next_description,
		case
			when lower(btrim(coalesce(ca.current_location_name, ''))) = 'meetup event'
			then case
				when lower(btrim(coalesce(ca.start_location_address, ''))) = 'online event' then 'Online event'
				else ca.address_venue
			end
			when (ca.slug like 'weeklyrides-%' or coalesce(ca.source_event_id, '') ~* 'weeklyrides\.com')
				and lower(btrim(coalesce(ca.current_location_name, ''))) = lower(btrim(coalesce(ca.title, '')))
				and btrim(coalesce(ca.start_location_address, '')) <> ''
			then ca.address_venue
			when ca.source_event_id is not null
				and ca.host_user_id is null
				and ca.host_group_id is null
				and ca.external_organizer_name is not null
				and lower(btrim(coalesce(ca.current_location_name, ''))) = lower(btrim(ca.external_organizer_name))
				and btrim(coalesce(ca.start_location_address, '')) <> ''
				and position(lower(btrim(ca.current_location_name)) in lower(coalesce(ca.title, ''))) = 0
			then ca.address_venue
			else ca.current_location_name
		end as next_location_name
	from cleaned_activities ca
),
resolved_activities as (
	select
		fa.id,
		fa.next_description,
		fa.next_location_name,
		case
			when coalesce(fa.current_summary, '') ~* '(Meetup group:|Meetup event:|Meetup group page:|Event link:|WeeklyRides listing:|More information:)'
			then (
				with first_para as (
					select nullif(btrim((regexp_split_to_array(coalesce(fa.next_description, ''), '\r?\n[[:space:]]*\r?\n'))[1]), '') as para
				)
				select
					case
						when para is null then null
						when char_length(para) > 180 then btrim(left(para, 177)) || '...'
						else para
					end
				from first_para
			)
			else fa.current_summary
		end as next_summary,
		fa.current_description,
		fa.current_location_name,
		fa.current_summary
	from final_activities fa
)
update public.activity_events ae
set
	description = ra.next_description,
	summary = ra.next_summary,
	start_location_name = ra.next_location_name,
	updated_at = timezone('utc', now())
from resolved_activities ra
where ae.id = ra.id
	and (
		ae.description is distinct from ra.next_description
		or ae.summary is distinct from ra.next_summary
		or ae.start_location_name is distinct from ra.next_location_name
	);

-- 4. Final guard: ensure zero rows retain pace_notes duplicating updated summary.
update public.ride_details rd
set
	pace_notes = null,
	updated_at = timezone('utc', now())
from public.activity_events ae
where rd.activity_event_id = ae.id
	and rd.pace_notes is not null
	and (
		btrim(rd.pace_notes) = ''
		or lower(btrim(rd.pace_notes)) = lower(btrim(coalesce(ae.summary, '')))
	);
