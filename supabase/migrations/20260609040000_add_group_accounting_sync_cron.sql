insert into private.cron_secrets (name, secret)
values ('group_accounting_sync', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'group-accounting-sync-hourly';

select
	cron.schedule(
		'group-accounting-sync-hourly',
		'0 * * * *',
		$$
		select
			net.http_post(
				url := coalesce(
					(select value from private.app_settings where key = 'site_origin'),
					'https://3fp.org'
				) || '/api/cron/group-accounting-sync',
				headers := jsonb_build_object(
					'Content-Type', 'application/json',
					'x-cron-secret',
					(select secret from private.cron_secrets where name = 'group_accounting_sync')
				),
				body := '{}'::jsonb,
				timeout_milliseconds := 300000
			)
		$$
	);;
