-- Disposable local tests for provider monitoring and corrections.
do $$
declare
 g uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid(); income uuid:=gen_random_uuid();
 run uuid:=gen_random_uuid(); other_run uuid:=gen_random_uuid(); result jsonb; connection uuid;
 entry jsonb; rows jsonb; feed uuid;
begin
 insert into groups values(g,'Sync testing','sync-test');
 insert into group_accounting_accounts(id,group_id,code,name,kind,normal_side,subtype,display_group) values
 (cash,g,'1000','Cash','asset','debit','bank','Cash'),(income,g,'4000','Income','income','credit','donations','Income');
 result:=claim_group_accounting_provider_sync(g,'stripe',run,'cron',false,600);
 if result->>'acquired'<>'true' then raise exception 'First run not acquired'; end if;
 connection:=(result->>'connection_id')::uuid;
 result:=claim_group_accounting_provider_sync(g,'stripe',other_run,'manual',true,600);
 if result->>'acquired'<>'false' or result->>'reason'<>'sync_in_progress' then raise exception 'Overlapping run acquired'; end if;
 perform finish_group_accounting_provider_sync(run,'failed',0,0,0,0,'provider_auth','Safe error');
 if (select last_sync_success_at from group_accounting_bank_connections where id=connection) is not null then raise exception 'Failure marked successful'; end if;
 result:=claim_group_accounting_provider_sync(g,'stripe',gen_random_uuid(),'cron',false,600);
 if result->>'reason'<>'backoff' then raise exception 'Failed run ignored backoff'; end if;
 run:=gen_random_uuid(); result:=claim_group_accounting_provider_sync(g,'stripe',run,'manual',true,600);
 perform finish_group_accounting_provider_sync(run,'succeeded',1,0,0,0,null,null);
 if (select last_sync_success_at from group_accounting_bank_connections where id=connection) is null then raise exception 'Success not recorded'; end if;
 rows:=jsonb_build_array(jsonb_build_object('group_id',g,'connection_id',connection,'provider','stripe','source_transaction_id','txn','account_id',cash,'transaction_date','2026-04-01','description','Deposit','amount_cents',100,'currency','usd','provider_status','posted','should_import',true));
 result:=sync_group_accounting_feed_items(rows);
 if result->>'inserted'<>'1' then raise exception 'Feed not imported'; end if;
 rows:=jsonb_set(rows,'{0,amount_cents}','200'); result:=sync_group_accounting_feed_items(rows);
 if result->>'updated'<>'1' then raise exception 'Unposted provider correction not updated'; end if;
 entry:=group_accounting_post_entry(g,'{"entry_date":"2026-04-01","entry_type":"income","description":"Deposit","source":"test","currency":"usd"}',jsonb_build_array(jsonb_build_object('account_id',cash,'debit_cents',200,'credit_cents',0),jsonb_build_object('account_id',income,'debit_cents',0,'credit_cents',200)));
 select id into feed from group_accounting_bank_feed_items where group_id=g;
 update group_accounting_bank_feed_items set status='posted',matched_entry_id=(entry->>'id')::uuid where id=feed;
 rows:=jsonb_set(rows,'{0,amount_cents}','300'); result:=sync_group_accounting_feed_items(rows);
 if result->>'corrections'<>'1' or (select amount_cents from group_accounting_bank_feed_items where id=feed)<>200 then raise exception 'Posted books changed'; end if;
 perform resolve_group_accounting_provider_correction(g,feed,'accepted',null);
 result:=sync_group_accounting_feed_items(rows);
 if result->>'corrections'<>'0' or (select provider_correction_pending from group_accounting_bank_feed_items where id=feed) then raise exception 'Acknowledged correction reappeared'; end if;
 if not exists(select 1 from group_accounting_audit_events where group_id=g and event_type='provider_correction_reviewed') then raise exception 'Correction review not audited'; end if;
 rows:=jsonb_set(rows,'{0,amount_cents}','400'); result:=sync_group_accounting_feed_items(rows);
 if result->>'corrections'<>'1' then raise exception 'New correction not flagged'; end if;
 raise notice 'Provider sync integrity checks passed';
end $$;
