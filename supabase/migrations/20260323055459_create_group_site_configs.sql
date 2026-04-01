create table if not exists public.group_site_configs (
	id uuid primary key default uuid_generate_v4(),
	group_id uuid not null unique references public.groups(id) on delete cascade,
	site_title text null,
	site_tagline text null,
	home_intro text null,
	featured_quote text null,
	footer_blurb text null,
	seo_description text null,
	layout_preset text not null default 'poster',
	hero_style text not null default 'immersive',
	nav_style text not null default 'floating',
	font_pairing text not null default 'poster',
	theme_mode text not null default 'derived',
	theme_name text null,
	theme_colors jsonb not null default '{}'::jsonb,
	sections jsonb not null default '{}'::jsonb,
	ai_prompt text null,
	published boolean not null default true,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint group_site_configs_layout_preset_check check (
		layout_preset in ('poster', 'editorial', 'split', 'minimal')
	),
	constraint group_site_configs_hero_style_check check (
		hero_style in ('immersive', 'stacked', 'spotlight', 'plain')
	),
	constraint group_site_configs_nav_style_check check (
		nav_style in ('floating', 'inline', 'minimal')
	),
	constraint group_site_configs_font_pairing_check check (
		font_pairing in ('poster', 'editorial', 'friendly', 'utility')
	),
	constraint group_site_configs_theme_mode_check check (
		theme_mode in ('derived', 'repo', 'custom')
	)
);

create index if not exists group_site_configs_published_idx
	on public.group_site_configs (published);;
