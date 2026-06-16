do $$
declare
	policy_row record;
	role_list text;
	insert_name text;
	update_name text;
	delete_name text;
begin
	for policy_row in
		select *
		from pg_policies pol
		where pol.schemaname = 'public'
			and pol.cmd = 'ALL'
			and (
				pol.policyname ilike '%manage%'
				or pol.policyname ilike '%manager_write%'
			)
			and exists (
				select 1
				from pg_policies s
				where s.schemaname = pol.schemaname
					and s.tablename = pol.tablename
					and s.cmd = 'SELECT'
			)
	loop
		select string_agg(format('%I', role_name), ', ')
		into role_list
		from unnest(policy_row.roles) as role_name;

		insert_name := left(policy_row.policyname || '_insert', 63);
		update_name := left(policy_row.policyname || '_update', 63);
		delete_name := left(policy_row.policyname || '_delete', 63);

		execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);

		if policy_row.with_check is not null then
			execute format(
				'create policy %I on %I.%I for insert to %s with check (%s)',
				insert_name,
				policy_row.schemaname,
				policy_row.tablename,
				role_list,
				policy_row.with_check
			);
		end if;

		if policy_row.qual is not null and policy_row.with_check is not null then
			execute format(
				'create policy %I on %I.%I for update to %s using (%s) with check (%s)',
				update_name,
				policy_row.schemaname,
				policy_row.tablename,
				role_list,
				policy_row.qual,
				policy_row.with_check
			);
		elsif policy_row.qual is not null then
			execute format(
				'create policy %I on %I.%I for update to %s using (%s)',
				update_name,
				policy_row.schemaname,
				policy_row.tablename,
				role_list,
				policy_row.qual
			);
		end if;

		if policy_row.qual is not null then
			execute format(
				'create policy %I on %I.%I for delete to %s using (%s)',
				delete_name,
				policy_row.schemaname,
				policy_row.tablename,
				role_list,
				policy_row.qual
			);
		end if;
	end loop;
end $$;
