-- PostgREST includes the conflict key in the ON CONFLICT UPDATE clause for an
-- upsert. Keep existing clients working while they roll out the safer
-- insert/update signup flow: RLS and the profile trigger still prevent an
-- authenticated user from changing the identity stored in user_id.
grant update (user_id) on table public.profiles to authenticated;
