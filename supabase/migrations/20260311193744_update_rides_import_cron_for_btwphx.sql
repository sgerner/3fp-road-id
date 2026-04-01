select cron.unschedule(jobid)
from cron.job
where jobname in ('rides-import-weeklyrides-nightly', 'rides-import-nightly');

select
	cron.schedule(
		'rides-import-nightly',
		'15 8 * * *',
		$$
		select
			net.http_post(
				url := coalesce(
					(select value from private.app_settings where key = 'site_origin'),
					'https://3fp.org'
				) || '/api/cron/rides-import?source=all',
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
