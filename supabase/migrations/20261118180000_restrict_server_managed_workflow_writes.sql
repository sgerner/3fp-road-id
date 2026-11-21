-- These workflows write through the application server. Browser writes would
-- bypass membership and billing validation, email delivery controls, and
-- accounting report publication checks. Keep the existing read policies.
revoke insert, update, delete on table
  public.group_membership_programs,
  public.group_membership_tiers,
  public.group_membership_form_fields,
  public.group_membership_application_answers,
  public.group_memberships,
  public.group_membership_tier_change_requests,
  public.group_membership_emails,
  public.group_membership_email_sends,
  public.group_accounting_public_reports
from public, anon, authenticated;

drop policy if exists membership_programs_manage_insert on public.group_membership_programs;
drop policy if exists membership_programs_manage_update on public.group_membership_programs;
drop policy if exists membership_programs_manage_delete on public.group_membership_programs;
drop policy if exists membership_tiers_manage_insert on public.group_membership_tiers;
drop policy if exists membership_tiers_manage_update on public.group_membership_tiers;
drop policy if exists membership_tiers_manage_delete on public.group_membership_tiers;
drop policy if exists membership_form_fields_manage_insert on public.group_membership_form_fields;
drop policy if exists membership_form_fields_manage_update on public.group_membership_form_fields;
drop policy if exists membership_form_fields_manage_delete on public.group_membership_form_fields;
drop policy if exists membership_application_answers_insert on public.group_membership_application_answers;
drop policy if exists membership_application_answers_update on public.group_membership_application_answers;
drop policy if exists memberships_insert_manager on public.group_memberships;
drop policy if exists memberships_update_manager on public.group_memberships;
drop policy if exists membership_tier_change_insert on public.group_membership_tier_change_requests;
drop policy if exists membership_tier_change_update on public.group_membership_tier_change_requests;
drop policy if exists membership_emails_manage_insert on public.group_membership_emails;
drop policy if exists membership_emails_manage_update on public.group_membership_emails;
drop policy if exists membership_emails_manage_delete on public.group_membership_emails;
drop policy if exists membership_email_sends_manage_insert on public.group_membership_email_sends;
drop policy if exists membership_email_sends_manage_update on public.group_membership_email_sends;
drop policy if exists membership_email_sends_manage_delete on public.group_membership_email_sends;
drop policy if exists group_accounting_public_reports_manager_insert on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_update on public.group_accounting_public_reports;
drop policy if exists group_accounting_public_reports_manager_delete on public.group_accounting_public_reports;
