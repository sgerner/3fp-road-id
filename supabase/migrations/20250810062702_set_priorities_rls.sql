drop policy if exists priorities_select_public on policies.priorities;
drop policy if exists priorities_insert_anon on policies.priorities;
drop policy if exists priorities_delete_anon on policies.priorities;
create policy priorities_select_public on policies.priorities for select using (true);
create policy priorities_insert_anon  on policies.priorities for insert to anon with check (true);
create policy priorities_delete_anon  on policies.priorities for delete to anon using (true);;
