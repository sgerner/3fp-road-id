alter table public.group_social_posts
	add column if not exists post_target text;

update public.group_social_posts
set post_target = 'page'
where post_target is null
	or post_target not in ('page', 'story');

alter table public.group_social_posts
	alter column post_target set default 'page';

alter table public.group_social_posts
	alter column post_target set not null;

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'group_social_posts_post_target_check'
	) then
		alter table public.group_social_posts
			add constraint group_social_posts_post_target_check
			check (post_target in ('page', 'story'));
	end if;
end;
$$;

create index if not exists group_social_posts_group_target_status_created_idx
	on public.group_social_posts (group_id, post_target, status, created_at desc);
