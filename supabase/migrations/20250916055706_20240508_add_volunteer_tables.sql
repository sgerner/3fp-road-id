BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_event_status') THEN
        CREATE TYPE volunteer_event_status AS ENUM ('draft', 'published', 'cancelled', 'archived');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_signup_status') THEN
        CREATE TYPE volunteer_signup_status AS ENUM ('pending', 'approved', 'waitlisted', 'declined', 'cancelled');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_shift_signup_status') THEN
        CREATE TYPE volunteer_shift_signup_status AS ENUM ('registered', 'waitlisted', 'cancelled', 'checked_in', 'no_show');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_email_type') THEN
        CREATE TYPE volunteer_email_type AS ENUM ('reminder', 'thank_you', 'follow_up', 'custom');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_field_type') THEN
        CREATE TYPE volunteer_field_type AS ENUM ('text', 'textarea', 'number', 'select', 'multiselect', 'checkbox', 'phone', 'email', 'url');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS volunteer_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    host_group_id uuid REFERENCES groups(id) ON UPDATE CASCADE ON DELETE SET NULL,
    title text NOT NULL,
    slug text UNIQUE,
    summary text,
    description text,
    event_start timestamptz NOT NULL,
    event_end timestamptz NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    location_name text,
    location_address text,
    latitude float8,
    longitude float8,
    max_volunteers int,
    status volunteer_event_status NOT NULL DEFAULT 'draft',
    contact_email text,
    contact_phone text,
    require_signup_approval bool NOT NULL DEFAULT false,
    waitlist_enabled bool NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    published_at timestamptz,
    created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT volunteer_events_end_after_start CHECK (event_end > event_start)
);

CREATE INDEX IF NOT EXISTS volunteer_events_host_group_idx ON volunteer_events(host_group_id);
CREATE INDEX IF NOT EXISTS volunteer_events_status_idx ON volunteer_events(status);

CREATE TABLE IF NOT EXISTS volunteer_opportunities (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid NOT NULL REFERENCES volunteer_events(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    opportunity_type text,
    requires_approval bool NOT NULL DEFAULT false,
    auto_confirm_attendance bool NOT NULL DEFAULT true,
    min_volunteers int NOT NULL DEFAULT 0,
    max_volunteers int,
    waitlist_limit int,
    location_name text,
    location_notes text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS volunteer_opportunities_event_idx ON volunteer_opportunities(event_id);

CREATE TABLE IF NOT EXISTS volunteer_opportunity_shifts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id uuid NOT NULL REFERENCES volunteer_opportunities(id) ON UPDATE CASCADE ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    capacity int,
    timezone text,
    location_name text,
    location_address text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT volunteer_opportunity_shifts_end_after_start CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS volunteer_shifts_opportunity_idx ON volunteer_opportunity_shifts(opportunity_id);
CREATE INDEX IF NOT EXISTS volunteer_shifts_window_idx ON volunteer_opportunity_shifts(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS volunteer_signups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid NOT NULL REFERENCES volunteer_events(id) ON UPDATE CASCADE ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES volunteer_opportunities(id) ON UPDATE CASCADE ON DELETE CASCADE,
    volunteer_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    volunteer_name text NOT NULL,
    volunteer_email text NOT NULL,
    volunteer_phone text,
    emergency_contact_name text,
    emergency_contact_phone text,
    status volunteer_signup_status NOT NULL DEFAULT 'pending',
    approval_note text,
    internal_notes text,
    source text,
    signed_waiver bool NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    confirmed_at timestamptz,
    cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS volunteer_signups_event_idx ON volunteer_signups(event_id);
CREATE INDEX IF NOT EXISTS volunteer_signups_opportunity_idx ON volunteer_signups(opportunity_id);
CREATE INDEX IF NOT EXISTS volunteer_signups_user_idx ON volunteer_signups(volunteer_user_id);

CREATE TABLE IF NOT EXISTS volunteer_signup_shifts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    signup_id uuid NOT NULL REFERENCES volunteer_signups(id) ON UPDATE CASCADE ON DELETE CASCADE,
    shift_id uuid NOT NULL REFERENCES volunteer_opportunity_shifts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    status volunteer_shift_signup_status NOT NULL DEFAULT 'registered',
    confirmed_at timestamptz,
    cancelled_at timestamptz,
    notes text,
    UNIQUE (signup_id, shift_id)
);

CREATE INDEX IF NOT EXISTS volunteer_signup_shifts_shift_idx ON volunteer_signup_shifts(shift_id);

CREATE TABLE IF NOT EXISTS volunteer_custom_questions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid NOT NULL REFERENCES volunteer_events(id) ON UPDATE CASCADE ON DELETE CASCADE,
    opportunity_id uuid REFERENCES volunteer_opportunities(id) ON UPDATE CASCADE ON DELETE CASCADE,
    field_key text NOT NULL,
    label text NOT NULL,
    help_text text,
    field_type volunteer_field_type NOT NULL DEFAULT 'text',
    is_required bool NOT NULL DEFAULT false,
    position int NOT NULL DEFAULT 0,
    options jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT volunteer_custom_questions_unique_field UNIQUE (event_id, field_key)
);

CREATE INDEX IF NOT EXISTS volunteer_custom_questions_event_idx ON volunteer_custom_questions(event_id);
CREATE INDEX IF NOT EXISTS volunteer_custom_questions_opportunity_idx ON volunteer_custom_questions(opportunity_id);

CREATE TABLE IF NOT EXISTS volunteer_signup_responses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    signup_id uuid NOT NULL REFERENCES volunteer_signups(id) ON UPDATE CASCADE ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES volunteer_custom_questions(id) ON UPDATE CASCADE ON DELETE CASCADE,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (signup_id, question_id)
);

CREATE TABLE IF NOT EXISTS volunteer_event_emails (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid NOT NULL REFERENCES volunteer_events(id) ON UPDATE CASCADE ON DELETE CASCADE,
    email_type volunteer_email_type NOT NULL DEFAULT 'reminder',
    send_offset_minutes int NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    is_active bool NOT NULL DEFAULT true,
    require_confirmation bool NOT NULL DEFAULT false,
    survey_url text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS volunteer_event_emails_event_idx ON volunteer_event_emails(event_id);

COMMIT;
;
