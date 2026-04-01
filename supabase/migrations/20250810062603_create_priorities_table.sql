-- bucket: 2=Immediate, 1=Next; Remaining is implicit
create table if not exists policies.priorities (
  submission_id uuid not null references policies.submissions(id) on delete cascade,
  policy_id uuid not null references policies.policies(id) on delete cascade,
  bucket smallint not null check (bucket in (1,2)),
  primary key (submission_id, policy_id)
);;
