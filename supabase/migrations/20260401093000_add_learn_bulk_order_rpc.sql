-- Bulk reorder helpers for learn category management.

create or replace function public.learn_apply_order_updates(p_type text, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
	updated_count integer := 0;
begin
	if p_type = 'subcategory' then
		with payload as (
			select
				nullif(trim(item->>'id'), '') as slug,
				nullif(trim(item->>'sort_order'), '')::integer as sort_order
			from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
		),
		updated as (
			update public.learn_subcategories as ls
			set sort_order = payload.sort_order
			from payload
			where payload.slug is not null
				and payload.sort_order is not null
				and ls.slug = payload.slug
			returning 1
		)
		select count(*)::integer into updated_count from updated;
	elseif p_type = 'article' then
		with payload as (
			select
				nullif(trim(item->>'id'), '')::uuid as id,
				nullif(trim(item->>'sort_order'), '')::integer as sort_order,
				nullif(trim(item->>'subcategory_slug'), '') as subcategory_slug
			from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
		),
		updated as (
			update public.learn_articles as la
			set
				sort_order = payload.sort_order,
				subcategory_slug = payload.subcategory_slug
			from payload
			where payload.id is not null
				and payload.sort_order is not null
				and la.id = payload.id
			returning 1
		)
		select count(*)::integer into updated_count from updated;
	else
		raise exception 'Unsupported learn order update type: %', p_type
			using errcode = '22023';
	end if;

	return updated_count;
end;
$$;

grant execute on function public.learn_apply_order_updates(text, jsonb) to authenticated;
