select cron.unschedule(jobid)
from cron.job
where jobname in (
    'rides-import-btwphx-nightly',
    'rides-import-weeklyrides-nightly',
    'rides-import-meetup-road-cycling-nightly',
    'rides-maintenance-btwphx-images-nightly',
    'rides-maintenance-btwphx-geocoding-nightly',
    'rides-maintenance-weeklyrides-images-nightly',
    'rides-maintenance-weeklyrides-geocoding-nightly',
    'rides-maintenance-meetup-images-nightly',
    'rides-maintenance-meetup-geocoding-nightly'
);

select cron.schedule(
    'rides-import-btwphx-nightly',
    '15 8 * * *',
    $$
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-import?source=btwphx&reconcile_missing_images=false',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
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
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-import?source=weeklyrides&reconcile_missing_images=false&allow_missing_geocode=true',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
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
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-import?source=meetup-road-cycling&reconcile_missing_images=false&skip_geocoding=true',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
    )
    $$
);

select cron.schedule(
    'rides-maintenance-btwphx-images-nightly',
    '45 8 * * *',
    $$
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=btwphx&task=images&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
    )
    $$
);

select cron.schedule(
    'rides-maintenance-btwphx-geocoding-nightly',
    '55 8 * * *',
    $$
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=btwphx&task=geocoding&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
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
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=weeklyrides&task=images&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
    )
    $$
);

select cron.schedule(
    'rides-maintenance-weeklyrides-geocoding-nightly',
    '55 9 * * *',
    $$
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=weeklyrides&task=geocoding&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
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
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=meetup-road-cycling&task=images&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
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
    select net.http_post(
        url := coalesce((select value from private.app_settings where key = 'site_origin'), 'https://3fp.org')
            || '/api/cron/rides-maintenance?source=meetup-road-cycling&task=geocoding&limit=10',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select secret from private.cron_secrets where name = 'rides_import_weeklyrides')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
    )
    $$
);
