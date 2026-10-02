-- RLS exposes published rows through PostgREST too. Hiding sections in Svelte
-- does not protect the underlying JSON; redact them before storing a snapshot.
create or replace function public.group_accounting_public_snapshot(payload jsonb, visibility jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
	financial jsonb := coalesce(payload->'report','{}'::jsonb);
	result_report jsonb := jsonb_strip_nulls(jsonb_build_object('from',financial->'from','to',financial->'to','currency',financial->'currency'));
	totals jsonb := '{}'::jsonb;
	section text;
	rows jsonb;
	result jsonb;
begin
	if coalesce((visibility->>'activity')::boolean,true) then
		foreach section in array array['income','expenses'] loop
			select coalesce(jsonb_agg(jsonb_build_object('code',a->'code','name',a->'name','kind',a->'kind','period_balance_cents',a->'period_balance_cents')),'[]'::jsonb)
			into rows from jsonb_array_elements(coalesce(financial->section,'[]'::jsonb)) a;
			result_report := result_report || jsonb_build_object(section,rows);
		end loop;
		select coalesce(jsonb_agg(jsonb_build_object('month',a->'month','income_cents',a->'income_cents','expense_cents',a->'expense_cents','net_cents',a->'net_cents')),'[]'::jsonb)
		into rows from jsonb_array_elements(coalesce(financial->'monthly','[]'::jsonb)) a;
		result_report := result_report || jsonb_build_object('monthly',rows);
		totals := totals || jsonb_strip_nulls(jsonb_build_object('income_cents',financial->'totals'->'income_cents','expense_cents',financial->'totals'->'expense_cents','net_cents',financial->'totals'->'net_cents'));
	end if;
	if coalesce((visibility->>'position')::boolean,true) then
		foreach section in array array['assets','liabilities','equity'] loop
			select coalesce(jsonb_agg(jsonb_build_object('code',a->'code','name',a->'name','kind',a->'kind','balance_cents',a->'balance_cents')),'[]'::jsonb)
			into rows from jsonb_array_elements(coalesce(financial->section,'[]'::jsonb)) a;
			result_report := result_report || jsonb_build_object(section,rows);
		end loop;
		totals := totals || jsonb_strip_nulls(jsonb_build_object('assets_cents',financial->'totals'->'assets_cents','liabilities_cents',financial->'totals'->'liabilities_cents','equity_cents',financial->'totals'->'equity_cents'));
	elsif coalesce((visibility->>'cash')::boolean,true) then
		totals := totals || jsonb_strip_nulls(jsonb_build_object('assets_cents',financial->'totals'->'assets_cents','liabilities_cents',financial->'totals'->'liabilities_cents'));
	end if;
	result := jsonb_strip_nulls(jsonb_build_object('report',result_report || jsonb_build_object('totals',totals),'generated_at',payload->'generated_at','currency',payload->'currency'));
	if coalesce((visibility->>'budgets')::boolean,false) then
		select coalesce(jsonb_agg(jsonb_build_object('year',a->'year','amount_cents',a->'amount_cents','monthly_amounts',a->'monthly_amounts',
			'account',jsonb_build_object('code',a->'account'->'code','name',a->'account'->'name','kind',a->'account'->'kind'))),'[]'::jsonb)
		into rows from jsonb_array_elements(coalesce(payload->'budgets','[]'::jsonb)) a;
		result := result || jsonb_build_object('budgets',rows);
	end if;
	return result;
end;
$$;

create or replace function public.group_accounting_redact_public_report()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare reports_enabled boolean;
begin
	if (tg_op = 'INSERT' and new.published)
		or (tg_op = 'UPDATE' and old.published is distinct from new.published and new.published) then
		select public_reports_enabled into reports_enabled
		from public.group_accounting_settings where group_id = new.group_id;
		if reports_enabled is distinct from true then
			raise exception 'Public accounting reports are disabled for this group.';
		end if;
	end if;
	new.snapshot := public.group_accounting_public_snapshot(new.snapshot,new.visibility);
	if not coalesce((new.visibility->>'notes')::boolean,true) then new.notes := null; end if;
	return new;
end;
$$;
create trigger group_accounting_public_reports_visibility before insert or update on public.group_accounting_public_reports
for each row execute function public.group_accounting_redact_public_report();

-- Remove hidden content from legacy snapshots while preserving their shared
-- historical values. Do not regenerate reports from today's ledger.
update public.group_accounting_public_reports
set snapshot = public.group_accounting_public_snapshot(snapshot,visibility),
	notes = case when coalesce((visibility->>'notes')::boolean,true) then notes else null end;

create or replace function public.group_accounting_preserve_snapshot()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
	if (to_jsonb(new)-'published') is distinct from (to_jsonb(old)-'published') then
		raise exception 'Published snapshots are fixed. Publish a new report to change their contents.';
	end if;
	return new;
end;
$$;
create trigger group_accounting_public_reports_immutable before update on public.group_accounting_public_reports
for each row execute function public.group_accounting_preserve_snapshot();

-- Public report pages use the server-side service client. Direct PostgREST
-- readers still need the published report fields, but not internal publisher
-- identifiers or the legacy share token.
revoke select on table public.group_accounting_public_reports from anon, authenticated;
grant select (id, group_id, slug, title, report_period_start, report_period_end, visibility,
	snapshot, notes, published, published_at, created_at)
on table public.group_accounting_public_reports to anon, authenticated;
