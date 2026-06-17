delete from public.group_accounting_bank_feed_items
where provider = 'mercury'
  and status <> 'posted';
