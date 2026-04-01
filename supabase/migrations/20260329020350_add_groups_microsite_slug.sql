alter table public.groups
	add column if not exists microsite_slug text;

create or replace function public.normalize_microsite_slug(input text)
returns text
language sql
immutable
as $$
	select regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '', 'g');
$$;

do $$
declare
	rec record;
	base_slug text;
	candidate text;
	suffix int;
begin
	for rec in
		select id, slug
		from public.groups
		order by created_at nulls last, id
	loop
		base_slug := public.normalize_microsite_slug(coalesce(rec.slug, ''));
		if base_slug = '' then
			base_slug := 'group' || substring(replace(rec.id::text, '-', '') from 1 for 8);
		end if;

		candidate := base_slug;
		suffix := 1;
		while exists (
			select 1
			from public.groups g
			where g.id <> rec.id
				and g.microsite_slug = candidate
		) loop
			suffix := suffix + 1;
			candidate := base_slug || suffix::text;
		end loop;

		update public.groups
		set microsite_slug = candidate
		where id = rec.id;
	end loop;
end $$;

create or replace function public.groups_set_microsite_slug()
returns trigger
language plpgsql
as $$
declare
	normalized text;
begin
	normalized := public.normalize_microsite_slug(coalesce(new.microsite_slug, ''));
	if normalized = '' then
		normalized := public.normalize_microsite_slug(coalesce(new.slug, ''));
	end if;
	if normalized = '' then
		normalized := 'group' || substring(replace(coalesce(new.id::text, md5(random()::text)), '-', '') from 1 for 8);
	end if;
	new.microsite_slug := normalized;
	return new;
end;
$$;

drop trigger if exists groups_set_microsite_slug_tg on public.groups;
create trigger groups_set_microsite_slug_tg
before insert or update of slug, microsite_slug
on public.groups
for each row
execute function public.groups_set_microsite_slug();

alter table public.groups
	alter column microsite_slug set not null;

create unique index if not exists groups_microsite_slug_unique_idx
	on public.groups (microsite_slug);

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'groups_microsite_slug_check'
	) then
		alter table public.groups
			add constraint groups_microsite_slug_check
			check (microsite_slug ~ '^[a-z0-9]+$');
	end if;
end $$;;
