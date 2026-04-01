drop policy if exists submissions_insert_anon on policies.submissions;
drop policy if exists submissions_update_anon on policies.submissions;
create policy submissions_insert_anon on policies.submissions for insert to anon with check (true);
create policy submissions_update_anon on policies.submissions for update to anon using (true) with check (true);;
