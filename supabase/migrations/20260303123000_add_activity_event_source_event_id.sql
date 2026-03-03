alter table public.activity_events
	add column if not exists source_event_id text;

create unique index if not exists activity_events_source_event_id_key
	on public.activity_events (source_event_id)
	where source_event_id is not null;
