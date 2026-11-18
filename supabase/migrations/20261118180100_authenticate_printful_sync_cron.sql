insert into private.cron_secrets (name, secret)
values ('merch_sync_printful', gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (name) do nothing;

-- Preserve the existing schedule, URL and gateway credentials. The edge
-- handler separately verifies this private secret before syncing any store.
do $$
declare
  job record;
  header_marker constant text := '''Content-Type'', ''application/json'',';
  secret_header constant text := $header$'x-cron-secret', (select secret from private.cron_secrets where name = 'merch_sync_printful'),$header$;
begin
  select jobid, command into job
  from cron.job
  where jobname = 'merch-sync-printful-hourly';

  if not found or strpos(job.command, secret_header) > 0 then
    return;
  end if;

  if strpos(job.command, header_marker) = 0 then
    raise exception 'Expected JSON header in the Printful sync cron command';
  end if;

  perform cron.alter_job(
    job.jobid,
    command := replace(job.command, header_marker, header_marker || E'\n' || secret_header)
  );
end;
$$;
