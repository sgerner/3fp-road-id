create table if not exists public.volunteer_event_email_deliveries (
    id uuid primary key default uuid_generate_v4(),
    template_id uuid not null references public.volunteer_event_emails(id) on delete cascade,
    volunteer_signup_id uuid not null references public.volunteer_signups(id) on delete cascade,
    recipient_email text not null,
    send_state text not null default 'sending'
        check (send_state in ('sending', 'sent', 'failed')),
    sent_at timestamptz,
    error_text text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (template_id, volunteer_signup_id)
);

create index if not exists volunteer_event_email_deliveries_template_state_idx
    on public.volunteer_event_email_deliveries(template_id, send_state);

alter table public.volunteer_event_email_deliveries enable row level security;

revoke all on table public.volunteer_event_email_deliveries from public, anon, authenticated;
grant all on table public.volunteer_event_email_deliveries to service_role;
