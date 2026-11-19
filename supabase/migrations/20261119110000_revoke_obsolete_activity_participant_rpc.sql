-- This legacy RPC has no remaining callers. Keep it unavailable to browser roles.
revoke execute on function public.can_view_activity_participants(uuid)
  from PUBLIC, anon, authenticated;
