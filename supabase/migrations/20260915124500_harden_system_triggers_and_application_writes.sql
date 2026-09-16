-- Trigger entry points are internal implementation details, not RPCs.
revoke all on function public.protect_profile_privileged_fields() from public, anon, authenticated, service_role;
revoke all on function private.create_profile_on_new_user() from public, anon, authenticated, service_role;
revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

-- Membership applications are created and advanced by the server-side
-- membership workflow. Direct browser writes could otherwise forge status,
-- reviewer, and payment-link fields on an applicant-owned row.
drop policy if exists membership_applications_insert on public.group_membership_applications;
drop policy if exists membership_applications_update on public.group_membership_applications;
revoke insert, update, delete, truncate, references, trigger
  on table public.group_membership_applications
  from public, anon, authenticated;
