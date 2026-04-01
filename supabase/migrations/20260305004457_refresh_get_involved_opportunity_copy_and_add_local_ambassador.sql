insert into public.get_involved_opportunities (title, description, sort_order, is_active)
values
	(
		'Join the 3FP Board',
		'Help shape safer streets strategy for riders across our region.
- Lead or co-lead one focused project in safety, education, community development, or advocacy.
- Attend board meetings every 3 months and help keep momentum between meetings.
- Expand your impact with organization support, community connections, and shared tools.',
		1,
		true
	),
	(
		'Social Media',
		'Use storytelling to inspire riders and grow awareness of safer cycling.
- Create and share posts that highlight events, campaigns, and rider voices.
- Turn community wins into content that motivates action.
- Help more people discover where and how to get involved.',
		2,
		true
	),
	(
		'Local Ambassador',
		'Be a trusted connector for your local cycling community.
- We''ll send a starter kit of 3FP merch to help with outreach.
- Keep rides, groups, and volunteer opportunities up-to-date on the website.
- Welcome new riders and point people to the right resources and events.',
		3,
		true
	)
on conflict (title) do update
set
	description = excluded.description,
	sort_order = excluded.sort_order,
	is_active = excluded.is_active,
	updated_at = timezone('utc'::text, now());;
