insert into private.cron_secrets (name, secret)
values ('rides_import_weeklyrides', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname in (
    'rides-import-weeklyrides-nightly',
    'rides-import-nightly',
    'rides-import-btwphx-nightly',
    'rides-import-meetup-road-cycling-nightly'
);

select cron.schedule(
    'rides-import-btwphx-nightly',
    '15 8 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-import?source=btwphx',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret',
                (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 300000
        )
    $$
);

select cron.schedule(
    'rides-import-weeklyrides-nightly',
    '15 9 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-import?source=weeklyrides',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret',
                (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 300000
        )
    $$
);

select cron.schedule(
    'rides-import-meetup-road-cycling-nightly',
    '15 10 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-import?source=meetup-road-cycling',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret',
                (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 300000
        )
    $$
);
