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
end $$;;
