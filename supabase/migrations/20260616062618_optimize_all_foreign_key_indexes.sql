do $$
declare
	fk record;
	index_name text;
	column_names text;
begin
	for fk in
		select
			n.nspname as schema_name,
			c.relname as table_name,
			con.conname as constraint_name,
			con.conrelid,
			con.conkey,
			array_agg(a.attname order by u.ord) as columns
		from pg_constraint con
		join pg_class c on c.oid = con.conrelid
		join pg_namespace n on n.oid = c.relnamespace
		join unnest(con.conkey) with ordinality as u(attnum, ord) on true
		join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
		where con.contype = 'f'
			and n.nspname in ('public', 'map', 'policies')
			and not exists (
				select 1
				from pg_index i
				where i.indrelid = con.conrelid
					and i.indisvalid
					and (i.indkey::smallint[])[0:cardinality(con.conkey) - 1] = con.conkey
			)
		group by n.nspname, c.relname, con.conname, con.conrelid, con.conkey
	loop
		index_name := left(
			'idx_' || fk.schema_name || '_' || fk.table_name || '_' || array_to_string(fk.columns, '_') || '_fk',
			55
		) || '_' || substr(md5(fk.constraint_name), 1, 7);

		select string_agg(format('%I', column_name), ', ')
		into column_names
		from unnest(fk.columns) as column_name;

		execute format(
			'create index if not exists %I on %I.%I (%s)',
			index_name,
			fk.schema_name,
			fk.table_name,
			column_names
		);
	end loop;
end $$;
