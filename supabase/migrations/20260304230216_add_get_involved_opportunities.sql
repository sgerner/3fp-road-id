create table if not exists public.get_involved_opportunities (
	id uuid primary key default uuid_generate_v4(),
	title text not null unique,
	description text,
	is_active boolean not null default true,
	sort_order integer not null default 0,
	created_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc'::text, now()),
	updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists get_involved_opportunities_active_sort_idx
	on public.get_involved_opportunities (is_active, sort_order, created_at);

create table if not exists public.get_involved_interest_submissions (
	id uuid primary key default uuid_generate_v4(),
	opportunity_id uuid not null references public.get_involved_opportunities(id) on delete cascade,
	user_id uuid references auth.users(id) on delete set null,
	full_name text not null,
	email text not null,
	phone text,
	message text,
	created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists get_involved_interest_submissions_opportunity_idx
	on public.get_involved_interest_submissions (opportunity_id, created_at desc);

create index if not exists get_involved_interest_submissions_user_idx
	on public.get_involved_interest_submissions (user_id, created_at desc);

insert into public.get_involved_opportunities (title, description, sort_order)
values
	(
		'Join the 3FP Board',
		'Ideal for candidates who are passionate about something specific in cycling safety, education, community development, or advocacy and want to expand their reach. Meetings happen every 3 months, and board members are ideally pushing a project forward between meetings with organization support.',
		1
	),
	(
		'Social Media',
		'Help create and share content that keeps riders informed, inspired, and connected to 3 Feet Please campaigns and events.',
		2
	)
on conflict (title) do update
set
	description = excluded.description,
	is_active = true,
	sort_order = excluded.sort_order,
	updated_at = timezone('utc'::text, now());;
