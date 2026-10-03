-- Keep completed later statement snapshots consistent with earlier cleared activity.
create or replace function public.group_accounting_complete_reconciliation(
	p_group_id uuid,
	p_account_id uuid,
	p_statement_date date,
	p_statement_balance integer,
	p_checked_feed_item_ids uuid[],
	p_cleared_entry_ids uuid[],
	p_statement_file jsonb,
	p_actor_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
	account public.group_accounting_accounts;
	book bigint;
	cleared bigint;
	difference bigint;
	outstanding_positive bigint;
	outstanding_negative bigint;
	cleared_ids uuid[];
	feed_ids uuid[];
	outstanding_ids uuid[];
	result public.group_accounting_reconciliations;
	existing_draft public.group_accounting_reconciliations;
	new_status text;
begin
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	if exists(select 1 from public.group_accounting_reconciliations r where r.group_id=p_group_id and r.account_id=p_account_id and r.status='completed' and r.statement_ending_date>p_statement_date) then raise exception 'Reconcile statements in chronological order; reopen later statements first.'; end if;
	if p_statement_date is null or p_statement_balance is null then raise exception 'Enter a valid statement date and balance.'; end if;
	select * into account from public.group_accounting_accounts where id=p_account_id and group_id=p_group_id;
	if not found or account.kind not in ('asset','liability') then raise exception 'Choose a bank or credit card account.'; end if;
	select coalesce(array_agg(distinct id), '{}'::uuid[]) into feed_ids
	from unnest(coalesce(p_checked_feed_item_ids, '{}'::uuid[])) id;
	if exists(
		select 1 from unnest(feed_ids) checked(id)
		left join public.group_accounting_bank_feed_items feed on feed.id=checked.id
		left join public.group_accounting_entries entry on entry.id=feed.matched_entry_id
		where feed.provider_correction_pending or feed.provider_status in ('pending','void','cancelled','failed','reversed','blocked') or feed.id is null or feed.group_id<>p_group_id or feed.account_id is distinct from p_account_id
		or feed.transaction_date>p_statement_date or feed.status not in ('matched','posted')
		or feed.cleared_at is not null or entry.status is distinct from 'posted'
		or entry.entry_date>p_statement_date
		or not exists(select 1 from public.group_accounting_lines line where line.entry_id=entry.id and line.account_id=p_account_id)
	) then raise exception 'Checked activity must be matched, uncleared, and belong to this account and statement period.'; end if;
	select coalesce(array_agg(distinct id), '{}'::uuid[]) into cleared_ids
	from (
		select unnest(coalesce(p_cleared_entry_ids, '{}'::uuid[])) as id
		union
		select feed.matched_entry_id from public.group_accounting_bank_feed_items feed where feed.id=any(feed_ids)
	) selected;
	if exists(
		select 1 from unnest(cleared_ids) selected(id)
		left join public.group_accounting_entries entry on entry.id=selected.id and entry.group_id=p_group_id
		where entry.id is null or entry.status not in ('posted','void') or entry.entry_date>p_statement_date
		or not exists(select 1 from public.group_accounting_lines line where line.entry_id=entry.id and line.account_id=p_account_id)
		or exists(select 1 from public.group_accounting_lines line where line.entry_id=entry.id and line.account_id=p_account_id and line.cleared_at is not null)
	) then raise exception 'Select only uncleared posted activity for this account through the statement date.'; end if;
	if exists(select 1 from public.group_accounting_bank_feed_items feed where feed.group_id=p_group_id and feed.account_id=p_account_id and feed.matched_entry_id=any(cleared_ids) and feed.provider_correction_pending) then raise exception 'Review provider corrections before reconciling this activity.'; end if;
	if p_statement_file is not null then
		if coalesce(p_statement_file->>'object_path','') not like p_group_id::text || '/reconciliations/%'
			or coalesce(p_statement_file->>'file_name','') = ''
			or coalesce(p_statement_file->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv')
			or coalesce((p_statement_file->>'size_bytes')::bigint,0) <= 0
			or (p_statement_file->>'size_bytes')::bigint > 10485760
		then raise exception 'Choose a valid statement attachment.'; end if;
	end if;
	if exists(select 1 from public.group_accounting_bank_feed_items feed
		where feed.group_id=p_group_id and feed.account_id=p_account_id and feed.transaction_date<=p_statement_date and feed.status='needs_review')
	then raise exception 'Review unmatched bank activity before completing reconciliation.'; end if;
	select coalesce(sum(case when account.normal_side='credit' then l.credit_cents::bigint-l.debit_cents else l.debit_cents::bigint-l.credit_cents end),0)
	into book from public.group_accounting_lines l join public.group_accounting_entries e on e.id=l.entry_id
	where l.group_id=p_group_id and l.account_id=p_account_id and e.status in ('posted','void') and e.entry_date<=p_statement_date;
	select coalesce(sum(case when account.normal_side='credit' then l.credit_cents::bigint-l.debit_cents else l.debit_cents::bigint-l.credit_cents end),0)
	into cleared from public.group_accounting_lines l join public.group_accounting_entries e on e.id=l.entry_id
	where l.group_id=p_group_id and l.account_id=p_account_id and e.status in ('posted','void') and e.entry_date<=p_statement_date
	and (l.cleared_at is not null or e.id=any(cleared_ids));
	difference:=p_statement_balance-cleared;
	if book > 2147483647 or book < -2147483648 or cleared > 2147483647 or cleared < -2147483648
		or difference > 2147483647 or difference < -2147483648 then
		raise exception 'Account balance exceeds the supported reconciliation amount.';
	end if;
	select coalesce(array_agg(id order by id), '{}'::uuid[]),
		coalesce(sum(greatest(effect,0)),0), coalesce(sum(greatest(-effect,0)),0)
	into outstanding_ids,outstanding_positive,outstanding_negative
	from (
		select e.id,
			sum(case when account.normal_side='credit' then l.credit_cents::bigint-l.debit_cents else l.debit_cents::bigint-l.credit_cents end) as effect
		from public.group_accounting_lines l join public.group_accounting_entries e on e.id=l.entry_id
		where l.group_id=p_group_id and l.account_id=p_account_id and e.status in ('posted','void') and e.entry_date<=p_statement_date
		and l.cleared_at is null and e.id<>all(cleared_ids)
		group by e.id
	) open_items;
	if outstanding_positive > 2147483647 or outstanding_negative > 2147483647 then
		raise exception 'Outstanding activity exceeds the supported reconciliation amount.';
	end if;
	new_status := case when difference=0 then 'completed' else 'draft' end;
	select * into existing_draft from public.group_accounting_reconciliations
	where group_id=p_group_id and account_id=p_account_id and statement_ending_date=p_statement_date and status='draft'
	order by created_at desc limit 1 for update;
	if existing_draft.id is null and exists(select 1 from public.group_accounting_reconciliations where group_id=p_group_id and account_id=p_account_id and statement_ending_date=p_statement_date and status='completed')
	then raise exception 'This statement is already reconciled. Reopen it before posting another version.'; end if;
	if existing_draft.id is not null then
		update public.group_accounting_reconciliations set
			statement_ending_balance_cents=p_statement_balance,book_balance_cents=book,cleared_balance_cents=cleared,
			difference_cents=difference,status=new_status,checked_feed_item_ids=feed_ids,cleared_entry_ids=cleared_ids,
			outstanding_entry_ids=outstanding_ids,
			outstanding_deposits_cents=case when account.kind='asset' then least(outstanding_positive,2147483647)::integer else 0 end,
			outstanding_checks_cents=case when account.kind='asset' then least(outstanding_negative,2147483647)::integer else 0 end,
			outstanding_charges_cents=case when account.kind='liability' then least(outstanding_positive,2147483647)::integer else 0 end,
			outstanding_payments_cents=case when account.kind='liability' then least(outstanding_negative,2147483647)::integer else 0 end,
			statement_object_path=coalesce(p_statement_file->>'object_path',statement_object_path),
			statement_file_name=coalesce(p_statement_file->>'file_name',statement_file_name),
			statement_mime_type=coalesce(p_statement_file->>'mime_type',statement_mime_type),
			statement_size_bytes=coalesce((p_statement_file->>'size_bytes')::bigint,statement_size_bytes),
			completed_by_user_id=case when new_status='completed' then p_actor_id else null end,
			completed_at=case when new_status='completed' then now() else null end
		where id=existing_draft.id returning * into result;
	else
		insert into public.group_accounting_reconciliations(
			group_id,account_id,statement_ending_date,statement_ending_balance_cents,book_balance_cents,cleared_balance_cents,
			difference_cents,status,checked_feed_item_ids,cleared_entry_ids,outstanding_entry_ids,
			outstanding_deposits_cents,outstanding_checks_cents,outstanding_charges_cents,outstanding_payments_cents,
			statement_object_path,statement_file_name,statement_mime_type,statement_size_bytes,completed_by_user_id,completed_at
		) values(
			p_group_id,p_account_id,p_statement_date,p_statement_balance,book,cleared,difference,new_status,feed_ids,cleared_ids,outstanding_ids,
			case when account.kind='asset' then least(outstanding_positive,2147483647)::integer else 0 end,
			case when account.kind='asset' then least(outstanding_negative,2147483647)::integer else 0 end,
			case when account.kind='liability' then least(outstanding_positive,2147483647)::integer else 0 end,
			case when account.kind='liability' then least(outstanding_negative,2147483647)::integer else 0 end,
			p_statement_file->>'object_path',p_statement_file->>'file_name',p_statement_file->>'mime_type',(p_statement_file->>'size_bytes')::bigint,
			case when new_status='completed' then p_actor_id else null end,case when new_status='completed' then now() else null end
		) returning * into result;
	end if;
	if new_status='completed' then
		update public.group_accounting_bank_feed_items set cleared_at=now(),reconciliation_id=result.id
		where group_id=p_group_id and account_id=p_account_id and cleared_at is null
		and (id=any(feed_ids) or matched_entry_id=any(cleared_ids));
		update public.group_accounting_lines l set cleared_at=now(),reconciliation_id=result.id
		from public.group_accounting_entries e
		where l.entry_id=e.id and l.account_id=p_account_id and e.group_id=p_group_id and e.id=any(cleared_ids)
		and l.cleared_at is null and e.status in ('posted','void');
		update public.group_accounting_entries e set locked_at=coalesce(locked_at,now())
		where e.group_id=p_group_id and e.id=any(cleared_ids) and e.status in ('posted','void');
	end if;
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,before_json,after_json,metadata)
	values(p_group_id,p_actor_id,'reconcile','reconciliation',result.id,
		case when existing_draft.id is not null then to_jsonb(existing_draft) else null end,to_jsonb(result),
		jsonb_build_object('outstanding_entry_ids',outstanding_ids,'cleared_entry_ids',cleared_ids));
	return to_jsonb(result);
end;
$$;
