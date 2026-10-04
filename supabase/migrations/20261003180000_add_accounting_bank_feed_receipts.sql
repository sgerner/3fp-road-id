alter table public.group_accounting_receipts
	add column if not exists feed_item_id uuid references public.group_accounting_bank_feed_items(id) on delete set null;

create index if not exists group_accounting_receipts_group_feed_idx
	on public.group_accounting_receipts (group_id, feed_item_id, created_at desc)
	where feed_item_id is not null;

-- Existing bank-feed receipts belong to the imported feed item as well as its
-- posted ledger entry, so they remain visible from either side of the workflow.
update public.group_accounting_receipts receipt
set feed_item_id = feed.id
from public.group_accounting_entries entry
join public.group_accounting_bank_feed_items feed
	on feed.group_id = entry.group_id
	and feed.id::text = entry.source_id
where receipt.group_id = entry.group_id
	and receipt.entry_id = entry.id
	and entry.source = 'bank_feed'
	and receipt.feed_item_id is null;

drop trigger if exists group_accounting_receipts_group_reference on public.group_accounting_receipts;
create trigger group_accounting_receipts_group_reference
before insert or update on public.group_accounting_receipts
for each row execute function public.group_accounting_check_group_reference(
	'entry_id', 'group_accounting_entries',
	'feed_item_id', 'group_accounting_bank_feed_items',
	'duplicate_of_receipt_id', 'group_accounting_receipts'
);

-- When feed activity becomes matched or posted, link its receipts to the
-- resulting ledger entry. The feed_item_id remains so both screens can find it.
create or replace function public.group_accounting_link_feed_receipts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	if new.matched_entry_id is null then
		return new;
	end if;

	update public.group_accounting_receipts
	set entry_id = new.matched_entry_id
	where group_id = new.group_id
		and feed_item_id = new.id
		and entry_id is null;

	return new;
end;
$$;

revoke all on function public.group_accounting_link_feed_receipts() from public, anon, authenticated;

-- If a receipt upload finishes after a feed item is posted, resolve the ledger
-- entry at insert time too. This closes the upload/posting race.
create or replace function public.group_accounting_attach_receipt_to_feed_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	linked_entry_id uuid;
begin
	if new.feed_item_id is null or new.entry_id is not null then
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

drop trigger if exists group_accounting_receipts_link_feed_entry on public.group_accounting_receipts;
create trigger group_accounting_receipts_link_feed_entry
before insert or update of feed_item_id, entry_id on public.group_accounting_receipts
for each row execute function public.group_accounting_attach_receipt_to_feed_entry();

drop trigger if exists group_accounting_link_feed_receipts on public.group_accounting_bank_feed_items;
create trigger group_accounting_link_feed_receipts
after update of matched_entry_id on public.group_accounting_bank_feed_items
for each row
when (new.matched_entry_id is not null and new.matched_entry_id is distinct from old.matched_entry_id)
execute function public.group_accounting_link_feed_receipts();
