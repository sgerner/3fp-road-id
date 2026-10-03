do $$
declare
	g uuid := gen_random_uuid(); other_group uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); income uuid := gen_random_uuid(); foreign_account uuid := gen_random_uuid();
	cash_followup uuid := gen_random_uuid(); expense_followup uuid := gen_random_uuid(); request_id uuid := gen_random_uuid();
	entry jsonb; reversed jsonb; recon jsonb; reopened jsonb; lines jsonb; feed_id uuid := gen_random_uuid(); original_id uuid; line_ids jsonb; failed boolean; balance bigint; public_row public.group_accounting_public_reports;
	deposit_entry jsonb; replay_entry jsonb; check_entry jsonb;
begin
	insert into public.groups values(g,'Accounting test','accounting-test'),(other_group,'Other group','other-group');
	insert into public.group_accounting_accounts(id,group_id,code,name,kind,subtype,normal_side,display_group)
	values(cash,g,'1000','Checking','asset','bank','debit','Cash'),(income,g,'4000','Income','income','donations','credit','Income'),(foreign_account,other_group,'1000','Foreign bank','asset','bank','debit','Cash'),
		(cash_followup,g,'1010','Follow-up Checking','asset','bank','debit','Cash'),(expense_followup,g,'5000','Follow-up Expense','expense','other','debit','Expenses');
	lines:=jsonb_build_array(jsonb_build_object('account_id',cash,'debit_cents',10000,'credit_cents',0),jsonb_build_object('account_id',income,'debit_cents',0,'credit_cents',10000));
	entry:=public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-01-01','entry_type','income','description','Donation','currency','usd'),lines);
	original_id:=(entry->>'id')::uuid;
	if (select count(*) from group_accounting_lines where entry_id=original_id)<>2 then raise exception 'Posting omitted lines'; end if;
	failed:=false;
	begin
		perform public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-01-01','entry_type','income','description','Foreign account'),jsonb_build_array(jsonb_build_object('account_id',foreign_account,'debit_cents',10000,'credit_cents',0),lines->1));
	exception when others then failed:=true; end;
	if not failed or (select count(*) from group_accounting_entries where group_id=g)<>1 then raise exception 'Cross-group posting was not atomic'; end if;
	failed:=false;
	begin
		perform public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-01-01','entry_type','income','description','Invalid line'),jsonb_build_array(jsonb_build_object('account_id',cash,'debit_cents',10000,'credit_cents',1),jsonb_build_object('account_id',income,'debit_cents',0,'credit_cents',9999)));
	exception when others then failed:=true; end;
	if not failed or (select count(*) from group_accounting_entries where group_id=g)<>1 then raise exception 'Line failure left a header'; end if;
	failed:=false;
	begin
		perform public.group_accounting_update_transaction(g,original_id,jsonb_build_object('entry_date','2026-01-02','description','Should roll back'),jsonb_build_array(jsonb_build_object('lineId',(select id from group_accounting_lines where entry_id=original_id limit 1),'accountId',cash)));
	exception when others then failed:=true; end;
	if not failed or (select description from group_accounting_entries where id=original_id)<>'Donation' then raise exception 'Incomplete edit committed'; end if;
	select jsonb_agg(jsonb_build_object('account_id',account_id,'debit_cents',credit_cents,'credit_cents',debit_cents)) into lines from group_accounting_lines where entry_id=original_id;
	reversed:=public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-02-01','entry_type','journal','source','reversal','source_id','reversal:'||original_id,'description','Reversal','metadata',jsonb_build_object('reverses_entry_id',original_id)),lines);
	if (select status from group_accounting_entries where id=original_id)<>'void' then raise exception 'Original was not voided'; end if;
	select sum(l.debit_cents-l.credit_cents) into balance from group_accounting_lines l join group_accounting_entries e on e.id=l.entry_id where e.group_id=g and l.account_id=cash and e.status in ('posted','void');
	if balance<>0 then raise exception 'Reversal changes net balance incorrectly'; end if;
	failed:=false;
	begin perform public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-02-01','entry_type','journal','source','reversal','description','Again','metadata',jsonb_build_object('reverses_entry_id',original_id)),lines);
	exception when others then failed:=true; end;
	if not failed or (select count(*) from group_accounting_entries where group_id=g)<>2 then raise exception 'Double reversal allowed'; end if;
	-- A separate account for reconciliation isolates the reversal scenarios above.
	lines:=jsonb_build_array(jsonb_build_object('account_id',cash,'debit_cents',500,'credit_cents',0),jsonb_build_object('account_id',income,'debit_cents',0,'credit_cents',500));
	insert into group_accounting_bank_feed_items(id,group_id,account_id,provider,source_transaction_id,transaction_date,description,amount_cents,status,matched_entry_id)
	values(feed_id,g,cash,'manual','test','2026-03-01','Feed',500,'needs_review',null);
	entry:=public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-03-01','entry_type','bank_feed','source','bank_feed','source_id',feed_id,
		'description','For reconciliation','metadata',jsonb_build_object('feed_account_id',cash,'feed_category_account_id',income)),lines);
	if (select status from group_accounting_bank_feed_items where id=feed_id)<>'posted'
		or (select matched_entry_id from group_accounting_bank_feed_items where id=feed_id)<>(entry->>'id')::uuid then raise exception 'Feed posting was not atomic'; end if;
	recon:=public.group_accounting_reconcile(g,cash,'2026-03-31',600,array[feed_id],null);
	if recon->>'status'<>'draft' or (select cleared_at from group_accounting_bank_feed_items where id=feed_id) is not null then raise exception 'Draft cleared activity'; end if;
	failed:=false;
	begin perform public.group_accounting_reconcile(g,foreign_account,'2026-03-31',500,array[feed_id],null);
	exception when others then failed:=true; end;
	if not failed then raise exception 'Reconciled foreign account'; end if;
	recon:=public.group_accounting_reconcile(g,cash,'2026-03-31',500,array[feed_id],null);
	if recon->>'status'<>'completed' or (select locked_at from group_accounting_entries where id=(entry->>'id')::uuid) is null then raise exception 'Completion did not lock books'; end if;
	failed:=false;
	begin perform public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-03-01','entry_type','income','description','Backdated'),lines);
	exception when others then failed:=true; end;
	if not failed then raise exception 'Posting bypassed closed statement'; end if;
	failed:=false;
	begin update group_accounting_entries set description='Tampered' where id=(entry->>'id')::uuid;
	exception when others then failed:=true; end;
	if not failed then raise exception 'Locked entry edited directly'; end if;
	failed:=false;
	begin insert into group_accounting_lines(entry_id,group_id,account_id,debit_cents,credit_cents)
		values((entry->>'id')::uuid,g,cash,10,0);
	exception when others then failed:=true; end;
	if not failed then raise exception 'Added lines to a locked entry'; end if;
	failed:=false;
	begin delete from group_accounting_entries where id=original_id;
	exception when others then failed:=true; end;
	if not failed then raise exception 'Deleted posted history'; end if;
	insert into group_accounting_settings(group_id,public_reports_enabled) values(g,false);
	failed:=false;
	begin insert into group_accounting_public_reports(group_id,title,report_period_start,report_period_end,snapshot)
		values(g,'Disabled publication','2026-01-01','2026-03-31','{"report":{}}');
	exception when others then failed:=true; end;
	if not failed then raise exception 'Published report bypassed the group setting'; end if;
	update group_accounting_settings set public_reports_enabled=true where group_id=g;
	insert into group_accounting_public_reports(group_id,title,report_period_start,report_period_end,visibility,snapshot,notes)
	values(g,'Private sections','2026-01-01','2026-03-31','{"activity":false,"position":false,"cash":false,"budgets":false,"notes":false}',
		'{"report":{"accounts":[{"description":"secret"}],"income":[{"name":"secret"}],"assets":[{"name":"secret"}],"totals":{"income_cents":999}},"budgets":[{"notes":"secret"}]}','secret note') returning * into public_row;
	if public_row.snapshot::text like '%secret%' or public_row.notes is not null or public_row.snapshot->'report'->'totals'<>'{}'::jsonb then raise exception 'Snapshot privacy is only cosmetic'; end if;
	failed:=false;
	begin update group_accounting_public_reports set title='Rewritten history' where id=public_row.id;
	exception when others then failed:=true; end;
	if not failed then raise exception 'Historical snapshot was mutable'; end if;
	update group_accounting_settings set public_reports_enabled=false where group_id=g;
	update group_accounting_public_reports set published=false where id=public_row.id;
	failed:=false;
	begin update group_accounting_public_reports set published=true where id=public_row.id;
	exception when others then failed:=true; end;
	if not failed then raise exception 'Report was republished while public reports were disabled'; end if;
	-- Repeated manual posting with the same request key must return the first row.
	lines:=jsonb_build_array(jsonb_build_object('account_id',cash_followup,'debit_cents',1000,'credit_cents',0),jsonb_build_object('account_id',income,'debit_cents',0,'credit_cents',1000));
	deposit_entry:=public.group_accounting_post_entry_idempotent(g,request_id,jsonb_build_object('entry_date','2026-04-01','entry_type','income','source','manual','description','Idempotent deposit','currency','usd'),lines);
	replay_entry:=public.group_accounting_post_entry_idempotent(g,request_id,jsonb_build_object('entry_date','2026-04-01','entry_type','income','source','manual','description','Idempotent deposit','currency','usd'),lines);
	if deposit_entry->>'id' is distinct from replay_entry->>'id' or replay_entry->>'_idempotent_replay'<>'true' then raise exception 'Repeated request posted twice'; end if;
	if (select count(*) from group_accounting_entries where group_id=g and metadata->>'idempotency_key'=request_id::text)<>1 then raise exception 'Idempotency key is not unique'; end if;
	failed:=false;
	begin perform public.group_accounting_post_entry_idempotent(g,request_id,jsonb_build_object('entry_date','2026-04-01','entry_type','income','source','manual','description','Changed payload','currency','usd'),lines);
	exception when others then failed:=true; end;
	if not failed then raise exception 'Idempotency key accepted a different payload'; end if;
	lines:=jsonb_build_array(jsonb_build_object('account_id',expense_followup,'debit_cents',300,'credit_cents',0),jsonb_build_object('account_id',cash_followup,'debit_cents',0,'credit_cents',300));
	check_entry:=public.group_accounting_post_entry(g,jsonb_build_object('entry_date','2026-04-02','entry_type','expense','source','manual','description','Outstanding check','currency','usd'),lines);
	-- A statement can be saved as a draft while the checked amount differs, then completed
	-- once cleared activity agrees. Only selected entries clear; outstanding checks remain open.
	recon:=public.group_accounting_complete_reconciliation(g,cash_followup,'2026-04-30',1100,'{}'::uuid[],array[(deposit_entry->>'id')::uuid],null,null);
	if recon->>'status'<>'draft' or (select cleared_at from group_accounting_lines where entry_id=(deposit_entry->>'id')::uuid and account_id=cash_followup) is not null then raise exception 'Draft reconciliation cleared transactions'; end if;
	recon:=public.group_accounting_complete_reconciliation(g,cash_followup,'2026-04-30',1000,'{}'::uuid[],array[(deposit_entry->>'id')::uuid],null,null);
	if recon->>'status'<>'completed' or (recon->>'book_balance_cents')::integer<>700 or (recon->>'cleared_balance_cents')::integer<>1000
		or (recon->>'outstanding_checks_cents')::integer<>300
		or not (recon->'outstanding_entry_ids' @> jsonb_build_array((check_entry->>'id')::uuid)) then raise exception 'Outstanding reconciliation activity was not captured'; end if;
	if (select reconciliation_id from group_accounting_lines where entry_id=(deposit_entry->>'id')::uuid and account_id=cash_followup) is distinct from (recon->>'id')::uuid
		or (select reconciliation_id from group_accounting_lines where entry_id=(check_entry->>'id')::uuid and account_id=cash_followup) is not null
		or (select locked_at from group_accounting_entries where id=(check_entry->>'id')::uuid) is not null then raise exception 'Reconciliation cleared outstanding entries'; end if;
	begin perform public.group_accounting_complete_reconciliation(g,cash_followup,'2026-03-31',0,'{}'::uuid[],'{}'::uuid[],null,null);
		raise exception 'Older statement was accepted after a later completed statement';
	exception when others then if sqlerrm not like 'Reconcile statements in chronological order%' then raise; end if; end;
	reopened:=public.group_accounting_reopen_reconciliation(g,(recon->>'id')::uuid,null,'Correct the selected statement activity');
	if reopened->>'status'<>'draft' or (select locked_at from group_accounting_entries where id=(deposit_entry->>'id')::uuid) is not null
		or (select cleared_at from group_accounting_lines where entry_id=(deposit_entry->>'id')::uuid and account_id=cash_followup) is not null
		or not exists(select 1 from group_accounting_audit_events where entity_id=(recon->>'id')::uuid and event_type='reopen_reconciliation' and metadata->>'reason'='Correct the selected statement activity')
	then raise exception 'Reopen did not unlock and audit the reconciliation'; end if;
	if not exists(select 1 from group_accounting_audit_events where group_id=g and event_type='void')
		or not exists(select 1 from group_accounting_audit_events where group_id=g and event_type='reconcile')
		or not exists(select 1 from group_accounting_audit_events where group_id=g and event_type='reopen_reconciliation') then raise exception 'Atomic audit records missing'; end if;
	if has_function_privilege('anon','public.group_accounting_post_entry(uuid,jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.group_accounting_reconcile(uuid,uuid,date,integer,uuid[],uuid)','execute') then raise exception 'Privileged RPC is client callable'; end if;
	if exists (
		select 1
		from unnest(array[
			'group_accounting_accounts','group_accounting_audit_events','group_accounting_bank_connections',
			'group_accounting_bank_feed_items','group_accounting_budgets','group_accounting_entries',
			'group_accounting_exports','group_accounting_lines','group_accounting_provider_accounts',
			'group_accounting_receipts','group_accounting_reconciliations','group_accounting_settings'
		]) as t(name)
		cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p(privilege)
		where has_table_privilege('anon',format('public.%I',t.name),p.privilege)
			or has_table_privilege('authenticated',format('public.%I',t.name),p.privilege)
	) then raise exception 'Private accounting tables have client grants'; end if;
	if exists (
		select 1 from pg_policies
		where schemaname='public' and tablename = any(array[
			'group_accounting_accounts','group_accounting_audit_events','group_accounting_bank_connections',
			'group_accounting_bank_feed_items','group_accounting_budgets','group_accounting_entries',
			'group_accounting_exports','group_accounting_lines','group_accounting_provider_accounts',
			'group_accounting_receipts','group_accounting_reconciliations','group_accounting_settings'
		])
	) then raise exception 'Private accounting tables retain client policies'; end if;
	if has_column_privilege('anon','public.group_accounting_public_reports','share_token','SELECT')
		or has_column_privilege('anon','public.group_accounting_public_reports','published_by_user_id','SELECT')
		or has_column_privilege('authenticated','public.group_accounting_public_reports','share_token','SELECT')
		or has_column_privilege('authenticated','public.group_accounting_public_reports','published_by_user_id','SELECT')
		or not has_column_privilege('anon','public.group_accounting_public_reports','slug','SELECT')
		or not has_column_privilege('anon','public.group_accounting_public_reports','snapshot','SELECT') then raise exception 'Public report columns are misconfigured'; end if;
end;
$$;
select 'accounting database checks passed';
