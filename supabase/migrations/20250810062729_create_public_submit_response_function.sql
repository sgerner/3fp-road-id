create or replace function public.submit_response(
  p_email text,
  p_name text,
  p_address text,
  p_immediate uuid[],
  p_next uuid[]
) returns void
language sql
security definer
as $$
  select policies.submit_response(p_email, p_name, p_address, p_immediate, p_next);
$$;;
