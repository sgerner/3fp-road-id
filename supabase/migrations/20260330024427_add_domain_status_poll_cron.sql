insert into private.cron_secrets (name, secret)
values ('domain_status_poll', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'group-domain-status-poll-10m';

select
	cron.schedule(
		'group-domain-status-poll-10m',
		'*/10 * * * *',
		$$
		select
			net.http_post(
				url := coalesce(
					(select value from private.app_settings where key = 'site_origin'),
					'https://3fp.org'
				) || '/api/cron/domain-status-poll',
				headers := jsonb_build_object(
					'Content-Type', 'application/json',
					'x-cron-secret',
					(select secret from private.cron_secrets where name = 'domain_status_poll')
				),
				body := '{}'::jsonb,
				timeout_milliseconds := 120000
			)
		$$
	);
