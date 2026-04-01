drop policy if exists policies_select_public on policies.policies;
drop policy if exists policies_insert_anon on policies.policies;
create policy policies_select_public on policies.policies for select using (true);
create policy policies_insert_anon  on policies.policies for insert to anon with check (true);;
