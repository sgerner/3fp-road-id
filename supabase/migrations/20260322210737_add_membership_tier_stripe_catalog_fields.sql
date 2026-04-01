alter table public.group_membership_tiers
  add column if not exists stripe_product_id text,
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_annual_price_id text,
  add column if not exists stripe_account_id text;;
