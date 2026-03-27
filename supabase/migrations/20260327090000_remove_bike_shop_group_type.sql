-- Remove deprecated Bike Shop group type and any join rows that reference it.
with bike_shop_type as (
	select id
	from public.group_types
	where lower(name) = 'bike shop'
)
delete from public.group_x_group_types gx
using bike_shop_type bst
where gx.group_type_id = bst.id;

delete from public.group_types
where lower(name) = 'bike shop';
