-- Simplify default membership application fields:
-- keep one casual motivation question, deactivate prior extra defaults.

update public.group_membership_form_fields
set
	label = 'What got you interested in joining us?',
	help_text = 'Optional, but helpful for organizers.',
	required = true,
	sort_order = 10,
	updated_at = timezone('utc', now())
where label = 'What motivates you to join this group?';

update public.group_membership_form_fields
set
	active = false,
	updated_at = timezone('utc', now())
where label in (
	'How would you like to participate?',
	'What neighborhood or area do you primarily ride in?'
);;
