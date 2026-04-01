alter table public.group_site_configs
  add column if not exists simple_mode boolean not null default true,
  add column if not exists microsite_notice text,
  add column if not exists microsite_notice_href text,
  add column if not exists new_rider_note text,
  add column if not exists meeting_instructions text,
  add column if not exists faq_1_q text,
  add column if not exists faq_1_a text,
  add column if not exists faq_2_q text,
  add column if not exists faq_2_a text,
  add column if not exists safety_note text,
  add column if not exists sponsor_links jsonb not null default '[]'::jsonb,
  add column if not exists announcement_expires_at timestamptz;

alter table public.group_site_configs
  drop constraint if exists group_site_configs_sponsor_links_is_array;

alter table public.group_site_configs
  add constraint group_site_configs_sponsor_links_is_array
  check (jsonb_typeof(sponsor_links) = 'array');;
