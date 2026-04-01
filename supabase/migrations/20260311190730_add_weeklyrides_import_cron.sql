insert into private.cron_secrets (name, secret)
values ('rides_import_weeklyrides', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'rides-import-weeklyrides-nightly';

select
	cron.schedule(
		'rides-import-weeklyrides-nightly',
		'15 8 * * *',
		$$
		select
			net.http_post(
				url := coalesce(
					(select value from private.app_settings where key = 'site_origin'),
					'https://3fp.org'
				) || '/api/cron/rides-import',
				headers := jsonb_build_object(
					'Content-Type', 'application/json',
					'x-cron-secret',
					(select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
				),
				body := '{}'::jsonb,
				timeout_milliseconds := 120000
			)
		$$
	);;
