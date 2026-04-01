insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'group-social-media',
	'group-social-media',
	true,
	15728640,
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
	allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
	if not exists (
		select 1
		from pg_policies
		where schemaname = 'storage'
			and tablename = 'objects'
			and policyname = 'group_social_media_select_public'
	) then
		create policy "group_social_media_select_public"
			on storage.objects
			for select
			to anon, authenticated
			using (bucket_id = 'group-social-media');
	end if;
end
$$;;
