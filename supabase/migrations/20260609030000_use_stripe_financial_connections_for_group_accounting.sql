alter table public.group_accounting_bank_connections
	drop constraint if exists group_accounting_bank_connections_provider_check;

alter table public.group_accounting_bank_connections
	add constraint group_accounting_bank_connections_provider_check
	check (provider in ('stripe', 'stripe_financial_connections', 'plaid', 'mercury', 'manual'));

alter table public.group_accounting_bank_feed_items
	drop constraint if exists group_accounting_bank_feed_items_provider_check;

alter table public.group_accounting_bank_feed_items
	add constraint group_accounting_bank_feed_items_provider_check
	check (provider in ('stripe', 'stripe_financial_connections', 'plaid', 'mercury', 'manual'));

alter table public.group_accounting_provider_accounts
	drop constraint if exists group_accounting_provider_accounts_provider_check;

alter table public.group_accounting_provider_accounts
	add constraint group_accounting_provider_accounts_provider_check
	check (provider in ('stripe', 'stripe_financial_connections', 'plaid', 'mercury', 'manual'));
