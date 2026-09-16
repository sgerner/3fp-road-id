create or replace function public.can_view_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
	select exists (
		select 1
		from public.groups g
		where g.id = target_group_id
		  and (g.is_published or public.can_manage_group(g.id))
	);
$function$;

create or replace function public.can_view_volunteer_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
	select exists (
		select 1
		from public.volunteer_events ve
		where ve.id = target_event_id
		  and (
			ve.status = 'published'
			or public.can_manage_group(ve.host_group_id)
			or ve.created_by_user_id = auth.uid()
			or ve.host_user_id = auth.uid()
		  )
	);
$function$;

create or replace function public.can_manage_volunteer_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
	select exists (
		select 1
		from public.volunteer_events ve
		where ve.id = target_event_id
		  and (
			ve.host_user_id = auth.uid()
			or ve.created_by_user_id = auth.uid()
			or public.can_manage_group(ve.host_group_id)
		  )
	);
$function$;

create or replace function public.can_view_merch_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
	select exists (
		select 1
		from public.merch_stores ms
		where ms.id = target_store_id
		  and (ms.is_active or public.can_manage_group(ms.group_id))
	);
$function$;

alter table public.audience_focuses enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.group_announcements enable row level security;
alter table public.group_events enable row level security;
alter table public.group_faqs enable row level security;
alter table public.group_gallery_images enable row level security;
alter table public.group_members enable row level security;
alter table public.group_resources enable row level security;
alter table public.group_types enable row level security;
alter table public.group_x_audience_focuses enable row level security;
alter table public.group_x_group_types enable row level security;
alter table public.group_x_riding_disciplines enable row level security;
alter table public.groups enable row level security;
alter table public.qr_codes enable row level security;
alter table public.riding_disciplines enable row level security;
alter table public.road_id_profiles enable row level security;
alter table public.scan_logs enable row level security;
alter table public.skill_levels enable row level security;
alter table public.group_x_skill_levels enable row level security;
alter table public.volunteer_events enable row level security;
alter table public.volunteer_opportunities enable row level security;
alter table public.volunteer_opportunity_shifts enable row level security;
alter table public.volunteer_signups enable row level security;
alter table public.volunteer_signup_shifts enable row level security;
alter table public.volunteer_custom_questions enable row level security;
alter table public.volunteer_signup_responses enable row level security;
alter table public.volunteer_event_emails enable row level security;
alter table public.volunteer_event_types enable row level security;
alter table public.volunteer_event_hosts enable row level security;
alter table public.get_involved_opportunities enable row level security;
alter table public.get_involved_interest_submissions enable row level security;
alter table public.donation_accounts enable row level security;
alter table public.donations enable row level security;
alter table public.merch_stores enable row level security;
alter table public.merch_tax_settings enable row level security;
alter table public.merch_fulfillment_methods enable row level security;
alter table public.merch_products enable row level security;
alter table public.merch_product_variants enable row level security;
alter table public.merch_orders enable row level security;
alter table public.merch_order_items enable row level security;
alter table public.merch_dispatch_jobs enable row level security;
alter table public.merch_refunds enable row level security;
alter table public.merch_partner_accounts enable row level security;
alter table public.merch_shipping_rules enable row level security;
alter table public.group_asset_sections enable row level security;
alter table public.group_assets enable row level security;
alter table public.group_site_configs enable row level security;
alter table public.group_site_domains enable row level security;
alter table public.group_site_domain_orders enable row level security;
alter table public.group_site_domain_events enable row level security;
alter table public.media_assets enable row level security;

drop policy if exists audience_focuses_select on public.audience_focuses;
create policy audience_focuses_select on public.audience_focuses
for select using (true);

drop policy if exists group_types_select on public.group_types;
create policy group_types_select on public.group_types
for select using (true);

drop policy if exists riding_disciplines_select on public.riding_disciplines;
create policy riding_disciplines_select on public.riding_disciplines
for select using (true);

drop policy if exists skill_levels_select on public.skill_levels;
create policy skill_levels_select on public.skill_levels
for select using (true);

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
for select using (public.can_view_group(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
for insert with check (auth.uid() is not null);

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
for update using (public.can_manage_group(id))
with check (public.can_manage_group(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
for delete using (public.can_manage_group(id));

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
for select using (
	auth.uid() = user_id
	or public.can_manage_group(group_id)
);

drop policy if exists group_members_manage on public.group_members;
create policy group_members_manage on public.group_members
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_x_group_types_select on public.group_x_group_types;
create policy group_x_group_types_select on public.group_x_group_types
for select using (public.can_view_group(group_id));

drop policy if exists group_x_group_types_manage on public.group_x_group_types;
create policy group_x_group_types_manage on public.group_x_group_types
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_x_audience_focuses_select on public.group_x_audience_focuses;
create policy group_x_audience_focuses_select on public.group_x_audience_focuses
for select using (public.can_view_group(group_id));

drop policy if exists group_x_audience_focuses_manage on public.group_x_audience_focuses;
create policy group_x_audience_focuses_manage on public.group_x_audience_focuses
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_x_riding_disciplines_select on public.group_x_riding_disciplines;
create policy group_x_riding_disciplines_select on public.group_x_riding_disciplines
for select using (public.can_view_group(group_id));

drop policy if exists group_x_riding_disciplines_manage on public.group_x_riding_disciplines;
create policy group_x_riding_disciplines_manage on public.group_x_riding_disciplines
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_x_skill_levels_select on public.group_x_skill_levels;
create policy group_x_skill_levels_select on public.group_x_skill_levels
for select using (public.can_view_group(group_id));

drop policy if exists group_x_skill_levels_manage on public.group_x_skill_levels;
create policy group_x_skill_levels_manage on public.group_x_skill_levels
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_announcements_select on public.group_announcements;
create policy group_announcements_select on public.group_announcements
for select using (public.can_view_group(group_id));

drop policy if exists group_announcements_manage on public.group_announcements;
create policy group_announcements_manage on public.group_announcements
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_events_select on public.group_events;
create policy group_events_select on public.group_events
for select using (public.can_view_group(group_id));

drop policy if exists group_events_manage on public.group_events;
create policy group_events_manage on public.group_events
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_faqs_select on public.group_faqs;
create policy group_faqs_select on public.group_faqs
for select using (is_published = true or public.can_view_group(group_id));

drop policy if exists group_faqs_manage on public.group_faqs;
create policy group_faqs_manage on public.group_faqs
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_gallery_images_select on public.group_gallery_images;
create policy group_gallery_images_select on public.group_gallery_images
for select using (public.can_view_group(group_id));

drop policy if exists group_gallery_images_manage on public.group_gallery_images;
create policy group_gallery_images_manage on public.group_gallery_images
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_resources_select on public.group_resources;
create policy group_resources_select on public.group_resources
for select using (public.can_view_group(group_id));

drop policy if exists group_resources_manage on public.group_resources;
create policy group_resources_manage on public.group_resources
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_asset_sections_select on public.group_asset_sections;
create policy group_asset_sections_select on public.group_asset_sections
for select using (public.can_view_group(group_id));

drop policy if exists group_asset_sections_manage on public.group_asset_sections;
create policy group_asset_sections_manage on public.group_asset_sections
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_assets_select on public.group_assets;
create policy group_assets_select on public.group_assets
for select using (public.can_view_group(group_id));

drop policy if exists group_assets_manage on public.group_assets;
create policy group_assets_manage on public.group_assets
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_configs_select on public.group_site_configs;
create policy group_site_configs_select on public.group_site_configs
for select using (published = true or public.can_view_group(group_id));

drop policy if exists group_site_configs_manage on public.group_site_configs;
create policy group_site_configs_manage on public.group_site_configs
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_domains_manage on public.group_site_domains;
create policy group_site_domains_manage on public.group_site_domains
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_domain_orders_manage on public.group_site_domain_orders;
create policy group_site_domain_orders_manage on public.group_site_domain_orders
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_domain_events_manage on public.group_site_domain_events;
create policy group_site_domain_events_manage on public.group_site_domain_events
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists donation_accounts_select on public.donation_accounts;
create policy donation_accounts_select on public.donation_accounts
for select using (public.can_view_group(group_id));

drop policy if exists donation_accounts_manage on public.donation_accounts;
create policy donation_accounts_manage on public.donation_accounts
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists volunteer_events_select on public.volunteer_events;
create policy volunteer_events_select on public.volunteer_events
for select using (public.can_view_volunteer_event(id));

drop policy if exists volunteer_events_manage on public.volunteer_events;
create policy volunteer_events_manage on public.volunteer_events
for all using (public.can_manage_volunteer_event(id))
with check (public.can_manage_volunteer_event(id));

drop policy if exists volunteer_opportunities_select on public.volunteer_opportunities;
create policy volunteer_opportunities_select on public.volunteer_opportunities
for select using (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_view_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_opportunities_manage on public.volunteer_opportunities;
create policy volunteer_opportunities_manage on public.volunteer_opportunities
for all using (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_opportunity_shifts_select on public.volunteer_opportunity_shifts;
create policy volunteer_opportunity_shifts_select on public.volunteer_opportunity_shifts
for select using (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_view_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_opportunity_shifts_manage on public.volunteer_opportunity_shifts;
create policy volunteer_opportunity_shifts_manage on public.volunteer_opportunity_shifts
for all using (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_manage_volunteer_event(ve.id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_manage_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_custom_questions_select on public.volunteer_custom_questions;
create policy volunteer_custom_questions_select on public.volunteer_custom_questions
for select using (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_view_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_custom_questions_manage on public.volunteer_custom_questions;
create policy volunteer_custom_questions_manage on public.volunteer_custom_questions
for all using (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_manage_volunteer_event(ve.id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_opportunities vo
		join public.volunteer_events ve on ve.id = vo.event_id
		where vo.id = opportunity_id
		  and public.can_manage_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_event_types_select on public.volunteer_event_types;
create policy volunteer_event_types_select on public.volunteer_event_types
for select using (true);

drop policy if exists volunteer_signups_select on public.volunteer_signups;
create policy volunteer_signups_select on public.volunteer_signups
for select using (
	auth.uid() = volunteer_user_id
	or public.can_manage_volunteer_event(event_id)
);

drop policy if exists volunteer_signups_insert on public.volunteer_signups;
create policy volunteer_signups_insert on public.volunteer_signups
for insert with check (
	public.can_view_volunteer_event(event_id)
);

drop policy if exists volunteer_signups_update on public.volunteer_signups;
create policy volunteer_signups_update on public.volunteer_signups
for update using (
	auth.uid() = volunteer_user_id
	or public.can_manage_volunteer_event(event_id)
) with check (
	auth.uid() = volunteer_user_id
	or public.can_manage_volunteer_event(event_id)
);

drop policy if exists volunteer_signups_delete on public.volunteer_signups;
create policy volunteer_signups_delete on public.volunteer_signups
for delete using (
	auth.uid() = volunteer_user_id
	or public.can_manage_volunteer_event(event_id)
);

drop policy if exists volunteer_signup_shifts_select on public.volunteer_signup_shifts;
create policy volunteer_signup_shifts_select on public.volunteer_signup_shifts
for select using (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and (vs.volunteer_user_id = auth.uid() or public.can_manage_volunteer_event(vs.event_id))
	)
);

drop policy if exists volunteer_signup_shifts_manage on public.volunteer_signup_shifts;
create policy volunteer_signup_shifts_manage on public.volunteer_signup_shifts
for all using (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and public.can_manage_volunteer_event(vs.event_id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and public.can_manage_volunteer_event(vs.event_id)
	)
);

drop policy if exists volunteer_signup_responses_select on public.volunteer_signup_responses;
create policy volunteer_signup_responses_select on public.volunteer_signup_responses
for select using (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and (vs.volunteer_user_id = auth.uid() or public.can_manage_volunteer_event(vs.event_id))
	)
);

drop policy if exists volunteer_signup_responses_manage on public.volunteer_signup_responses;
create policy volunteer_signup_responses_manage on public.volunteer_signup_responses
for all using (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and public.can_manage_volunteer_event(vs.event_id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_signups vs
		where vs.id = signup_id
		  and public.can_manage_volunteer_event(vs.event_id)
	)
);

drop policy if exists volunteer_event_emails_manage on public.volunteer_event_emails;
create policy volunteer_event_emails_manage on public.volunteer_event_emails
for all using (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
);

drop policy if exists volunteer_event_hosts_manage on public.volunteer_event_hosts;
create policy volunteer_event_hosts_manage on public.volunteer_event_hosts
for all using (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
)
with check (
	exists (
		select 1
		from public.volunteer_events ve
		where ve.id = event_id
		  and public.can_manage_volunteer_event(ve.id)
	)
);

drop policy if exists get_involved_opportunities_select on public.get_involved_opportunities;
create policy get_involved_opportunities_select on public.get_involved_opportunities
for select using (true);

drop policy if exists get_involved_interest_submissions_insert on public.get_involved_interest_submissions;
create policy get_involved_interest_submissions_insert on public.get_involved_interest_submissions
for insert with check (true);

drop policy if exists merch_stores_select on public.merch_stores;
create policy merch_stores_select on public.merch_stores
for select using (public.can_view_merch_store(id));

drop policy if exists merch_products_select on public.merch_products;
create policy merch_products_select on public.merch_products
for select using (
	exists (
		select 1
		from public.merch_stores ms
		where ms.id = store_id
		  and public.can_view_merch_store(ms.id)
	)
);

drop policy if exists merch_product_variants_select on public.merch_product_variants;
create policy merch_product_variants_select on public.merch_product_variants
for select using (
	exists (
		select 1
		from public.merch_products mp
		join public.merch_stores ms on ms.id = mp.store_id
		where mp.id = product_id
		  and public.can_view_merch_store(ms.id)
	)
);

drop policy if exists merch_fulfillment_methods_select on public.merch_fulfillment_methods;
create policy merch_fulfillment_methods_select on public.merch_fulfillment_methods
for select using (true);

drop policy if exists merch_tax_settings_select on public.merch_tax_settings;
create policy merch_tax_settings_select on public.merch_tax_settings
for select using (true);

drop policy if exists road_id_profiles_select on public.road_id_profiles;
create policy road_id_profiles_select on public.road_id_profiles
for select using (auth.uid() = user_id);

drop policy if exists road_id_profiles_insert on public.road_id_profiles;
create policy road_id_profiles_insert on public.road_id_profiles
for insert with check (auth.uid() = user_id);

drop policy if exists road_id_profiles_update on public.road_id_profiles;
create policy road_id_profiles_update on public.road_id_profiles
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists road_id_profiles_delete on public.road_id_profiles;
create policy road_id_profiles_delete on public.road_id_profiles
for delete using (auth.uid() = user_id);

drop policy if exists emergency_contacts_select on public.emergency_contacts;
create policy emergency_contacts_select on public.emergency_contacts
for select using (
	exists (
		select 1
		from public.road_id_profiles rp
		where rp.user_id = profile_id
		  and rp.user_id = auth.uid()
	)
);

drop policy if exists emergency_contacts_insert on public.emergency_contacts;
create policy emergency_contacts_insert on public.emergency_contacts
for insert with check (
	exists (
		select 1
		from public.road_id_profiles rp
		where rp.user_id = profile_id
		  and rp.user_id = auth.uid()
	)
);

drop policy if exists emergency_contacts_update on public.emergency_contacts;
create policy emergency_contacts_update on public.emergency_contacts
for update using (
	exists (
		select 1
		from public.road_id_profiles rp
		where rp.user_id = profile_id
		  and rp.user_id = auth.uid()
	)
)
with check (
	exists (
		select 1
		from public.road_id_profiles rp
		where rp.user_id = profile_id
		  and rp.user_id = auth.uid()
	)
);

drop policy if exists emergency_contacts_delete on public.emergency_contacts;
create policy emergency_contacts_delete on public.emergency_contacts
for delete using (
	exists (
		select 1
		from public.road_id_profiles rp
		where rp.user_id = profile_id
		  and rp.user_id = auth.uid()
	)
);

drop policy if exists qr_codes_select on public.qr_codes;
create policy qr_codes_select on public.qr_codes
for select using (profile_id = auth.uid());

drop policy if exists scan_logs_manage on public.scan_logs;
create policy scan_logs_manage on public.scan_logs
for all using (false)
with check (false);

drop policy if exists donation_accounts_select on public.donation_accounts;
create policy donation_accounts_select on public.donation_accounts
for select using (public.can_view_group(group_id));

drop policy if exists donation_accounts_manage on public.donation_accounts;
create policy donation_accounts_manage on public.donation_accounts
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_domain_orders_manage on public.group_site_domain_orders;
create policy group_site_domain_orders_manage on public.group_site_domain_orders
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists group_site_domain_events_manage on public.group_site_domain_events;
create policy group_site_domain_events_manage on public.group_site_domain_events
for all using (public.can_manage_group(group_id))
with check (public.can_manage_group(group_id));

drop policy if exists media_assets_manage on public.media_assets;
create policy media_assets_manage on public.media_assets
for all using (false)
with check (false);
