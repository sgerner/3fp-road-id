-- Consolidate membership contribution modes to:
-- - donation: optional support, $0 allowed
-- - paid: payment required

update public.group_membership_programs
set contribution_mode = 'donation'
where contribution_mode = 'none';

update public.group_membership_programs
set contribution_mode = 'paid'
where contribution_mode = 'required_fee';

alter table public.group_membership_programs
	drop constraint if exists group_membership_programs_contribution_mode_check;

alter table public.group_membership_programs
	add constraint group_membership_programs_contribution_mode_check
	check (contribution_mode in ('paid', 'donation'));

alter table public.group_membership_programs
	alter column contribution_mode set default 'donation';;
