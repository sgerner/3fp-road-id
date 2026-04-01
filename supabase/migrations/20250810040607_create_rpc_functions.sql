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

  if p_immediate is not null and array_length(p_immediate, 1) > 0 then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_immediate), 2;
  end if;

  if p_next is not null and array_length(p_next, 1) > 0 then
    insert into policies.priorities(submission_id, policy_id, bucket)
    select v_submission_id, unnest(p_next), 1;
  end if;
end $$;

revoke all on function policies.submit_response(text, text, text, uuid[], uuid[]) from public;

create or replace function public.submit_response(
  p_email text,
  p_name text,
  p_address text,
  p_immediate uuid[],
  p_next uuid[]
) returns void
language sql
as $$
  select policies.submit_response(p_email, p_name, p_address, p_immediate, p_next);
$$;

grant execute on function public.submit_response(text, text, text, uuid[], uuid[]) to anon;;
