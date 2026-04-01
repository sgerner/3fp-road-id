create table if not exists policies.policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text not null,
  long_description text not null,
  category text not null check (category in ('Climate','Data','Design','Education','Enforcement','Incentive','Maintenance','Planning','Program')),
  created_at timestamptz not null default now()
);;
