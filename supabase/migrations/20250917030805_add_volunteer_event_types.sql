begin;

create table if not exists public.volunteer_event_types (
    slug text primary key,
    event_type text not null unique,
    description text not null
);

insert into public.volunteer_event_types (slug, event_type, description)
values
    ('ride', 'Ride', 'Organized group ride on public streets or paths; can be social, family-friendly, or long-distance charity.'),
    ('rodeo', 'Rodeo', 'Youth or community bike skills course with stations for safety checks, obstacle riding, and games.'),
    ('class', 'Class', 'Educational session such as Cycling 101, commuter training, or on-bike safety instruction.'),
    ('valet', 'Valet', 'Secure bike parking service at festivals, concerts, or other large gatherings.'),
    ('repair', 'Repair', 'Free or low-cost community bike maintenance or tune-up station.'),
    ('campaign', 'Advocacy', 'Campaign  or awareness effort like Week Without Driving or safe-passing outreach.'),
    ('race', 'Race', 'Competitive event such as criterium, cyclocross, alleycat, or timed challenge.'),
    ('fundraiser', 'Fundraiser', 'Event held to raise donations for programs, e.g., benefit ride, auction, or dinner.'),
    ('festival', 'Festival', 'Community celebration, street fair, or park event where biking is featured or supported.'),
    ('outreach', 'Outreach', 'Tabling, info booth, or community engagement activity outside of a festival setting.'),
    ('training', 'Training', 'Volunteer or staff orientation, skills certification, or route-leader prep session.'),
    ('meeting', 'Meeting', 'Board meeting, committee work session, or planning workshop for volunteers and partners.')
on conflict (slug) do update set event_type = excluded.event_type, description = excluded.description;

alter table public.volunteer_events
    add column if not exists event_type_slug text;

alter table public.volunteer_events
    drop constraint if exists volunteer_events_event_type_slug_fkey;

alter table public.volunteer_events
    add constraint volunteer_events_event_type_slug_fkey
    foreign key (event_type_slug) references public.volunteer_event_types(slug);

update public.volunteer_events
set event_type_slug = 'ride'
where event_type_slug is null;

alter table public.volunteer_events
    alter column event_type_slug set not null;

alter table public.volunteer_events
    alter column event_type_slug set default 'ride';

commit;;
