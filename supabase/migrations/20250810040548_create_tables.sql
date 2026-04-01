create table if not exists policies.policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text not null,
  long_description text not null,
  category text not null check (category in ('Climate','Data','Design','Education','Enforcement','Incentive','Maintenance','Planning','Program')),
  created_at timestamptz not null default now()
);

create table if not exists policies.submissions (
  id uuid primary key default gen_random_uuid(),
  email public.citext not null unique,
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);

create table if not exists policies.priorities (
  submission_id uuid not null references policies.submissions(id) on delete cascade,
  policy_id uuid not null references policies.policies(id) on delete cascade,
  bucket smallint not null check (bucket in (1,2)),
  primary key (submission_id, policy_id)
);;
