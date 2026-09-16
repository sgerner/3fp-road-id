create or replace function private.create_profile_on_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    insert into public.profiles (user_id)
    values (new.id);

    return new;
end;
$function$;
