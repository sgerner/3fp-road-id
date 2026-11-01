create or replace function public.group_accounting_attach_receipt_to_feed_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	linked_entry_id uuid;
begin
	if new.feed_item_id is null then
		return new;
	end if;

	select matched_entry_id into linked_entry_id
	from public.group_accounting_bank_feed_items
	where id = new.feed_item_id and group_id = new.group_id;

	if linked_entry_id is not null then
		if new.entry_id is null then
			new.entry_id := linked_entry_id;
		elsif new.entry_id is distinct from linked_entry_id then
			raise exception 'A receipt linked to posted bank activity must use its matched transaction.';
		end if;
	end if;

	return new;
end;
$$;

revoke all on function public.group_accounting_attach_receipt_to_feed_entry() from public, anon, authenticated;
