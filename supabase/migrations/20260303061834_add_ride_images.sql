alter table public.ride_details
	add column if not exists image_urls text[] not null default '{}'::text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'ride-media',
	'ride-media',
	true,
	26214400,
	array[
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif'
	]
)
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;;
