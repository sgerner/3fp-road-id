alter table policies.policies enable row level security;
alter table policies.submissions enable row level security;
alter table policies.priorities enable row level security;

drop policy if exists policies_select_public on policies.policies;
create policy policies_select_public on policies.policies for select using (true);
drop policy if exists policies_insert_anon on policies.policies;
create policy policies_insert_anon  on policies.policies for insert to anon with check (true);

drop policy if exists priorities_select_public on policies.priorities;
create policy priorities_select_public on policies.priorities for select using (true);
drop policy if exists priorities_insert_anon on policies.priorities;
create policy priorities_insert_anon  on policies.priorities for insert to anon with check (true);
drop policy if exists priorities_delete_anon on policies.priorities;
create policy priorities_delete_anon  on policies.priorities for delete to anon using (true);

drop policy if exists submissions_insert_anon on policies.submissions;
create policy submissions_insert_anon on policies.submissions for insert to anon with check (true);
drop policy if exists submissions_update_anon on policies.submissions;
create policy submissions_update_anon on policies.submissions for update to anon using (true) with check (true);;
