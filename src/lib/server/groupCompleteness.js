const GROUP_COMPLETENESS_FIELDS = [
	'name',
	'tagline',
	'description',
	'city',
	'state_region',
	'country',
	'website_url',
	'public_contact_email',
	'public_phone_number',
	'preferred_contact_method_instructions',
	'how_to_join_instructions',
	'membership_info',
	'specific_meeting_point_address',
	'service_area_description',
	'skill_levels_description',
	'activity_frequency',
	'typical_activity_day_time',
	'logo_url',
	'cover_photo_url'
];

export function calculateGroupCompleteness(group) {
	let filledCount = 0;
	for (const key of GROUP_COMPLETENESS_FIELDS) {
		if (group[key] != null && group[key] !== '') filledCount += 1;
	}

	const socialLinks = group.social_links || {};
	if (Object.values(socialLinks).some((value) => value != null && value !== '')) {
		filledCount += 1;
	}

	return Math.round((filledCount / (GROUP_COMPLETENESS_FIELDS.length + 1)) * 100);
}
