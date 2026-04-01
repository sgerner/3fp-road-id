create table if not exists policies.submissions (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);;
