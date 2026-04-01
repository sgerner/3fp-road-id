-- Supabase/PostgREST upsert with onConflict requires a matching unique/exclusion
-- constraint (or a non-partial unique index). The prior partial indexes were not
-- inferable for ON CONFLICT (store_id, external_provider, external_product_id)
-- and ON CONFLICT (product_id, external_variant_id).

-- Keep newest duplicate external product rows before enforcing uniqueness.
with ranked_products as (
	select
		id,
		row_number() over (
			partition by store_id, external_provider, external_product_id
			order by updated_at desc nulls last, created_at desc nulls last, id desc
		) as rn
	from public.merch_products
	where external_provider is not null
		and external_product_id is not null
),
deleted_products as (
	delete from public.merch_products p
	using ranked_products r
	where p.id = r.id
		and r.rn > 1
	returning p.id
)
select count(*) from deleted_products;

-- Keep newest duplicate external variant rows before enforcing uniqueness.
with ranked_variants as (
	select
		id,
		row_number() over (
			partition by product_id, external_variant_id
			order by updated_at desc nulls last, created_at desc nulls last, id desc
		) as rn
	from public.merch_product_variants
	where external_variant_id is not null
),
deleted_variants as (
	delete from public.merch_product_variants v
	using ranked_variants r
	where v.id = r.id
		and r.rn > 1
	returning v.id
)
select count(*) from deleted_variants;

drop index if exists public.merch_products_store_external_product_idx;
drop index if exists public.merch_variants_product_external_variant_idx;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'merch_products_store_external_product_key'
	) then
		alter table public.merch_products
			add constraint merch_products_store_external_product_key
			unique (store_id, external_provider, external_product_id);
	end if;
end
$$;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'merch_product_variants_product_external_variant_key'
	) then
		alter table public.merch_product_variants
			add constraint merch_product_variants_product_external_variant_key
			unique (product_id, external_variant_id);
	end if;
end
$$;;
