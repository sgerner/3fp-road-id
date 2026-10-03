-- Account record ids determine the permitted primary-organization exception.
-- Guard renames too, so a shared main record cannot become another organization.
create trigger donation_stripe_tenant_id_guard
before update of id on public.donation_accounts
for each row execute function public.guard_donation_stripe_tenant();
