-- Schema and extensions
create schema if not exists policies;
create extension if not exists citext;
create extension if not exists pgcrypto;

-- Tables
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
  email citext not null unique,
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);

-- bucket 2 = Immediate, 1 = Next; "Remaining" is implicit and not stored
create table if not exists policies.priorities (
  submission_id uuid not null references policies.submissions(id) on delete cascade,
  policy_id uuid not null references policies.policies(id) on delete cascade,
  bucket smallint not null check (bucket in (1,2)),
  primary key (submission_id, policy_id)
);

-- Indexes
create index if not exists policies_category_idx on policies.policies(category);
create index if not exists priorities_policy_bucket_idx on policies.priorities(policy_id, bucket);

-- Popularity view
create or replace view policies.policy_popularity as
select
  p.id as policy_id,
  count(case when pr.bucket = 2 then 1 end) as immediate_count,
  count(case when pr.bucket = 1 then 1 end) as next_count,
  coalesce(count(case when pr.bucket = 2 then 1 end),0) * 2
  + coalesce(count(case when pr.bucket = 1 then 1 end),0) as popularity_score
from policies.policies p
left join policies.priorities pr on pr.policy_id = p.id
group by p.id;

create or replace view policies.policy_with_popularity as
select
  p.*,
  coalesce(pp.immediate_count,0) as immediate_count,
  coalesce(pp.next_count,0) as next_count,
  coalesce(pp.popularity_score,0) as popularity_score
from policies.policies p
left join policies.policy_popularity pp on pp.policy_id = p.id;

-- RLS
alter table policies.policies enable row level security;
alter table policies.submissions enable row level security;
alter table policies.priorities enable row level security;

-- Anyone can read policies and popularity, and insert new policies
drop policy if exists policies_select_public on policies.policies;
drop policy if exists policies_insert_anon on policies.policies;
create policy policies_select_public on policies.policies for select using (true);
create policy policies_insert_anon  on policies.policies for insert to anon with check (true);

-- We expose aggregated counts, so allow read on priorities; no PII here
drop policy if exists priorities_select_public on policies.priorities;
drop policy if exists priorities_insert_anon on policies.priorities;
drop policy if exists priorities_delete_anon on policies.priorities;
create policy priorities_select_public on policies.priorities for select using (true);
create policy priorities_insert_anon  on policies.priorities for insert to anon with check (true);
create policy priorities_delete_anon  on policies.priorities for delete to anon using (true);

-- Submissions contain PII. Allow insert and update to anon for upsert-by-email. Disallow select.
drop policy if exists submissions_insert_anon on policies.submissions;
drop policy if exists submissions_update_anon on policies.submissions;
create policy submissions_insert_anon on policies.submissions for insert to anon with check (true);
create policy submissions_update_anon on policies.submissions for update to anon using (true) with check (true);

-- Transactional RPC to submit a response in one call
create or replace function policies.submit_response(
  p_email text,
  p_name text,
  p_address text,
  p_immediate uuid[],
  p_next uuid[]
) returns void
language plpgsql
security definer
as $$
declare
  v_submission_id uuid;
begin
  insert into policies.submissions(email, name, address)
  values (p_email, p_name, p_address)
  on conflict (email)
  do update set name = excluded.name, address = excluded.address
  returning id into v_submission_id;

  delete from policies.priorities where submission_id = v_submission_id;

  if p_immediate is not null then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_immediate), 2;
  end if;

  if p_next is not null then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_next), 1;
  end if;
end $$;

revoke all on function policies.submit_response(text, text, text, uuid[], uuid[]) from public;
grant execute on function policies.submit_response(text, text, text, uuid[], uuid[]) to anon;;
