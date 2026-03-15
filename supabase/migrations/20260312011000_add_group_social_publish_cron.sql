insert into private.cron_secrets (name, secret)
values ('social_publish', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'group-social-publish-15m';

select
	cron.schedule(
		'group-social-publish-15m',
		'*/15 * * * *',
		$$
		select
			net.http_post(
				url := coalesce(
					(select value from private.app_settings where key = 'site_origin'),
					'https://3fp.org'
				) || '/api/cron/social-publish',
				headers := jsonb_build_object(
					'Content-Type', 'application/json',
					'x-cron-secret',
					(select secret from private.cron_secrets where name = 'social_publish')
				),
				body := '{}'::jsonb,
				timeout_milliseconds := 120000
			)
		$$
	);
