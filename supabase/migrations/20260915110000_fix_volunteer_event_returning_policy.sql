-- The event builder inserts with RETURNING. A SELECT policy that asks a
-- self-querying helper to find the just-inserted row can reject that response
-- even though the INSERT check passed. Evaluate visibility on the returned row
-- directly instead.

drop policy if exists volunteer_events_select on public.volunteer_events;
create policy volunteer_events_select on public.volunteer_events
for select to anon, authenticated
using (
  status = 'published'
  or public.can_manage_group(host_group_id)
  or created_by_user_id = (select auth.uid())
  or host_user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.admin = true
  )
);
