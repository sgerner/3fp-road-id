create or replace function public.group_accounting_update_transaction(
	p_group_id uuid, p_entry_id uuid, p_patch jsonb, p_line_accounts jsonb
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare original public.group_accounting_entries; updated public.group_accounting_entries; bank_account uuid;
begin
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	select * into original from public.group_accounting_entries where id=p_entry_id and group_id=p_group_id for update;
	if not found then raise exception 'Entry not found.'; end if;
	if original.status <> 'posted' or original.locked_at is not null then raise exception 'Only an unlocked posted transaction can be edited.'; end if;
	if coalesce(trim(p_patch->>'description'),'') = '' then raise exception 'Add a description.'; end if;
	if jsonb_typeof(p_line_accounts) <> 'array' then raise exception 'Invalid transaction account data.'; end if;
	if jsonb_array_length(p_line_accounts)>0 then
		if (select count(*) from public.group_accounting_lines where entry_id=p_entry_id) <> jsonb_array_length(p_line_accounts)
			or (select count(distinct l->>'lineId') from jsonb_array_elements(p_line_accounts) l) <> jsonb_array_length(p_line_accounts)
			or exists (select 1 from jsonb_array_elements(p_line_accounts) l
				left join public.group_accounting_lines line on line.id=(l->>'lineId')::uuid and line.entry_id=p_entry_id
				left join public.group_accounting_accounts a on a.id=(l->>'accountId')::uuid
				where line.id is null or a.id is null or a.group_id<>p_group_id or a.is_archived)
		then raise exception 'Transaction account data is incomplete or invalid.'; end if;
	end if;
	if exists (select 1 from public.group_accounting_lines l join public.group_accounting_reconciliations r on r.account_id=l.account_id
		where l.entry_id=p_entry_id and r.status='completed' and r.statement_ending_date>=original.entry_date)
		or exists (select 1 from public.group_accounting_reconciliations r where r.group_id=p_group_id and r.status='completed'
			and r.statement_ending_date>=(p_patch->>'entry_date')::date and r.account_id in (
				select account_id from public.group_accounting_lines where entry_id=p_entry_id
				union select (l->>'accountId')::uuid from jsonb_array_elements(p_line_accounts) l))
	then raise exception 'This date is locked by reconciliation.'; end if;
	if original.source='bank_feed' and original.source_id is not null then
		select (mapping->>'accountId')::uuid into bank_account from public.group_accounting_bank_feed_items feed
		join public.group_accounting_lines line on line.entry_id=p_entry_id and line.account_id=feed.account_id
		join jsonb_array_elements(p_line_accounts) mapping on line.id=(mapping->>'lineId')::uuid
		join public.group_accounting_accounts a on a.id=(mapping->>'accountId')::uuid and a.kind in ('asset','liability')
		where feed.id::text=original.source_id and feed.group_id=p_group_id limit 1;
	end if;
	update public.group_accounting_entries set entry_date=(p_patch->>'entry_date')::date,
		description=p_patch->>'description',memo=p_patch->>'memo' where id=p_entry_id returning * into updated;
	update public.group_accounting_lines line set account_id=(l->>'accountId')::uuid
	from jsonb_array_elements(p_line_accounts) l where line.id=(l->>'lineId')::uuid and line.entry_id=p_entry_id;
	if original.source='bank_feed' and original.source_id is not null then
		-- Preserve the selected feed account unless its own ledger line was remapped.
		update public.group_accounting_bank_feed_items set transaction_date=updated.entry_date,description=updated.description,
			account_id=coalesce(bank_account,account_id) where group_id=p_group_id and id::text=original.source_id;
	end if;
	update public.group_accounting_bank_feed_items feed set status='needs_review',matched_entry_id=null,match_confidence=null,match_reason=null
	where feed.group_id=p_group_id and feed.matched_entry_id=p_entry_id and feed.status in ('posted','matched')
	and (abs(feed.transaction_date-updated.entry_date)>7 or feed.currency<>updated.currency or
		(select sum(l.debit_cents::bigint-l.credit_cents::bigint) from public.group_accounting_lines l where l.entry_id=p_entry_id and l.account_id=feed.account_id) is distinct from feed.amount_cents::bigint);
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,before_json,after_json)
	values(p_group_id,(p_patch->>'actor_user_id')::uuid,'update','entry',p_entry_id,to_jsonb(original),to_jsonb(updated)||jsonb_build_object('line_accounts',p_line_accounts));
	return to_jsonb(updated);
end;
$$;
revoke all on function public.group_accounting_update_transaction(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.group_accounting_update_transaction(uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.group_accounting_reconcile(
	p_group_id uuid,p_account_id uuid,p_statement_date date,p_statement_balance integer,p_checked_ids uuid[],p_actor_id uuid
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare account public.group_accounting_accounts; book bigint; difference bigint; result public.group_accounting_reconciliations; ids uuid[];
begin
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	if p_statement_date is null or p_statement_balance is null then raise exception 'Enter a valid statement date and balance.'; end if;
	select * into account from public.group_accounting_accounts where id=p_account_id and group_id=p_group_id;
	if not found or account.kind not in ('asset','liability') then raise exception 'Choose a bank or card account.'; end if;
	select coalesce(array_agg(distinct id),'{}'::uuid[]) into ids from unnest(coalesce(p_checked_ids,'{}'::uuid[])) id;
	if exists(select 1 from unnest(ids) checked(id) left join public.group_accounting_bank_feed_items feed on feed.id=checked.id
		left join public.group_accounting_entries entry on entry.id=feed.matched_entry_id
		where feed.id is null or feed.group_id<>p_group_id or feed.account_id is distinct from p_account_id
		or feed.transaction_date>p_statement_date or feed.status not in ('matched','posted')
		or feed.cleared_at is not null or entry.status is distinct from 'posted'
		or entry.entry_date>p_statement_date or not exists(select 1 from public.group_accounting_lines line where line.entry_id=entry.id and line.account_id=p_account_id))
	then raise exception 'Checked activity must be matched, uncleared, and belong to this account and statement period.'; end if;
	select coalesce(sum(case when account.normal_side='credit' then l.credit_cents::bigint-l.debit_cents else l.debit_cents::bigint-l.credit_cents end),0)
	into book from public.group_accounting_lines l join public.group_accounting_entries e on e.id=l.entry_id
	where l.group_id=p_group_id and l.account_id=p_account_id and e.status in ('posted','void') and e.entry_date<=p_statement_date;
	difference:=p_statement_balance-book;
	if difference=0 and exists(select 1 from public.group_accounting_bank_feed_items where group_id=p_group_id and account_id=p_account_id and transaction_date<=p_statement_date and status='needs_review')
	then raise exception 'Review unmatched activity before completing reconciliation.'; end if;
	insert into public.group_accounting_reconciliations(group_id,account_id,statement_ending_date,statement_ending_balance_cents,book_balance_cents,difference_cents,status,checked_feed_item_ids,completed_by_user_id,completed_at)
	values(p_group_id,p_account_id,p_statement_date,p_statement_balance,book,difference,case when difference=0 then 'completed' else 'draft' end,ids,
		case when difference=0 then p_actor_id else null end,case when difference=0 then now() else null end) returning * into result;
	if difference=0 then
		update public.group_accounting_bank_feed_items set cleared_at=now(),reconciliation_id=result.id where id=any(ids);
		update public.group_accounting_lines l set cleared_at=now(),reconciliation_id=result.id
		from public.group_accounting_entries e where l.entry_id=e.id and l.account_id=p_account_id and e.group_id=p_group_id and e.entry_date<=p_statement_date and e.status in ('posted','void');
		update public.group_accounting_entries e set locked_at=coalesce(locked_at,now()) where e.group_id=p_group_id and e.entry_date<=p_statement_date
			and e.status in ('posted','void') and e.locked_at is null and exists(select 1 from public.group_accounting_lines l where l.entry_id=e.id and l.account_id=p_account_id);
	end if;
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,after_json)
	values(p_group_id,p_actor_id,'reconcile','reconciliation',result.id,to_jsonb(result));
	return to_jsonb(result);
end;
$$;
revoke all on function public.group_accounting_reconcile(uuid,uuid,date,integer,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.group_accounting_reconcile(uuid,uuid,date,integer,uuid[],uuid) to service_role;
