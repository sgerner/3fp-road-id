alter table public.activity_events alter column host_user_id drop not null;

drop policy if exists activity_events_insert on public.activity_events;

create policy activity_events_insert
on public.activity_events
for insert
with check (
  auth.uid() is not null
  and created_by_user_id = auth.uid()
  and (host_user_id is null or host_user_id = auth.uid())
  and (host_group_id is null or public.can_manage_group(host_group_id))
);;
