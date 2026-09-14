select cron.unschedule(jobid)
from cron.job
where jobname in (
    'rides-maintenance-btwphx-images-nightly',
    'rides-maintenance-weeklyrides-images-nightly',
    'rides-maintenance-meetup-images-nightly',
    'rides-maintenance-meetup-geocoding-nightly'
);

select cron.schedule(
    'rides-maintenance-btwphx-images-nightly',
    '45 8 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-maintenance?source=btwphx&task=images&limit=10',
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
    'rides-maintenance-weeklyrides-images-nightly',
    '45 9 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-maintenance?source=weeklyrides&task=images&limit=10',
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
    'rides-maintenance-meetup-images-nightly',
    '45 10 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-maintenance?source=meetup-road-cycling&task=images&limit=10',
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
    'rides-maintenance-meetup-geocoding-nightly',
    '15 11 * * *',
    $$
    select
        net.http_post(
            url := coalesce(
                (select value from private.app_settings where key = 'site_origin'),
                'https://3fp.org'
            ) || '/api/cron/rides-maintenance?source=meetup-road-cycling&task=geocoding&limit=10',
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
