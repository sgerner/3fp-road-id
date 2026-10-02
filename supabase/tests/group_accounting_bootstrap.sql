-- Minimal app dependencies for a disposable local database. Never run in production.
do $$ begin
	if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
	if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
	if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema extensions;
create function extensions.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
create function extensions.gen_random_bytes(n integer) returns bytea language sql as 'select decode(repeat(''ab'',n),''hex'')';
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function public.is_site_admin() returns boolean language sql as 'select false';
create table public.groups(id uuid primary key,name text,slug text);
create table public.group_members(group_id uuid,user_id uuid,role text);
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);
create function storage.foldername(name text) returns text[] language sql as 'select string_to_array(name,''/'')';
