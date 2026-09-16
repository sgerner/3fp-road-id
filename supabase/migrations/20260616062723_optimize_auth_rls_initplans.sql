do $$
declare
	p record;
	optimized_qual text;
	optimized_check text;
	sql text;
begin
	for p in
		select schemaname, tablename, policyname, qual, with_check
		from pg_policies
		where schemaname = 'public'
			and (
				(coalesce(qual, '') like '%auth.uid()%' or coalesce(qual, '') like '%auth.role()%')
				or (coalesce(with_check, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.role()%')
			)
			and coalesce(qual, '') not ilike '%select auth.uid()%'
			and coalesce(qual, '') not ilike '%select auth.role()%'
			and coalesce(with_check, '') not ilike '%select auth.uid()%'
			and coalesce(with_check, '') not ilike '%select auth.role()%'
	loop
		optimized_qual := replace(replace(p.qual, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');
		optimized_check := replace(replace(p.with_check, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');

		sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

		if optimized_qual is not null then
			sql := sql || format(' using (%s)', optimized_qual);
		end if;

		if optimized_check is not null then
			sql := sql || format(' with check (%s)', optimized_check);
		end if;

		execute sql;
	end loop;
end $$;
