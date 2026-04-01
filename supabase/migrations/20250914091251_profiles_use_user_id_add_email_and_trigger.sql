-- Ensure email column exists on profiles (using user_id as FK to auth.users)
alter table public.profiles add column if not exists email text;

-- RLS: allow select to anon/auth (adjust if needed)
alter table public.profiles enable row level security;
drop policy if exists profiles_open_select_anon on public.profiles;
drop policy if exists profiles_open_select_auth on public.profiles;
create policy profiles_open_select_anon on public.profiles for select to anon using (true);
create policy profiles_open_select_auth on public.profiles for select to authenticated using (true);

-- Upsert email on new auth.users (use profiles.user_id)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, created_at, updated_at)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), now(), now())
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
;
