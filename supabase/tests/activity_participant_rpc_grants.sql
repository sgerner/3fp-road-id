begin;

do $$
declare
	fn_oid constant regprocedure := 'public.can_view_activity_participants(uuid)'::regprocedure;
	public_execute boolean;
begin
	select exists (
		select 1
		from pg_proc proc,
			aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
		where proc.oid = fn_oid
			and acl.grantee = 0
			and acl.privilege_type = 'EXECUTE'
	)
	into public_execute;

	if public_execute then
		raise exception 'PUBLIC retains EXECUTE on obsolete can_view_activity_participants(uuid)';
	end if;

	if has_function_privilege('anon', fn_oid, 'EXECUTE') then
		raise exception 'anon role retains EXECUTE on obsolete can_view_activity_participants(uuid)';
	end if;

	if has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
		raise exception 'authenticated role retains EXECUTE on obsolete can_view_activity_participants(uuid)';
	end if;

	if not has_function_privilege('anon', 'public.list_public_ride_participants(uuid)', 'EXECUTE')
		or not has_function_privilege('authenticated', 'public.list_public_ride_participants(uuid)', 'EXECUTE')
		or not has_function_privilege('service_role', 'public.list_public_ride_participants(uuid)', 'EXECUTE') then
		raise exception 'list_public_ride_participants(uuid) lost expected role grants';
	end if;
end $$;

set local role anon;
do $$
begin
	perform public.can_view_activity_participants('00000000-0000-4000-8000-000000000201');
	raise exception 'anon should not be able to invoke can_view_activity_participants(uuid)';
exception
	when insufficient_privilege then
		null;
end $$;

set local role authenticated;
do $$
begin
	perform public.can_view_activity_participants('00000000-0000-4000-8000-000000000201');
	raise exception 'authenticated should not be able to invoke can_view_activity_participants(uuid)';
exception
	when insufficient_privilege then
		null;
end $$;

rollback;
