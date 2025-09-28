export const ALLOWED_API_TABLES = [
	'groups',
	'group_types', // Read-only for most users, admin-managed
	'riding_disciplines', // Read-only for most users, admin-managed
	'audience_focuses', // Read-only for most users, admin-managed
	'group_x_group_types',
	'group_x_riding_disciplines',
	'group_x_audience_focuses',
	'group_members',
	'group_events',
	'group_gallery_images',
	'group_announcements',
	'group_resources',
	'group_faqs',
	'group_volunteer_ops',
	'volunteer_events',
	'volunteer_opportunities',
	'volunteer_opportunity_shifts',
	'volunteer_signups',
	'volunteer_signup_shifts',
	'volunteer_custom_questions',
	'volunteer_signup_responses',
	'volunteer_event_emails',
	'volunteer_event_hosts',
	'v_volunteer_event_hosts_with_profiles',
	'profiles'
];

// Define primary key columns for tables if not 'id' or if composite,
// though this generic endpoint will primarily assume a single PK 'id' for simplicity in PUT/DELETE by path.
// For composite PKs or non-'id' PKs, operations might need to rely on query params/body for matching.
export const TABLE_PRIMARY_KEYS = {
	groups: 'id',
	group_events: 'id',
	// For join tables with composite keys, DELETE/PUT might need .match() with body/query params
	group_x_group_types: ['group_id', 'group_type_id'],
	group_members: ['group_id', 'user_id', 'role'],
	volunteer_events: 'id',
	volunteer_opportunities: 'id',
	volunteer_opportunity_shifts: 'id',
	volunteer_signups: 'id',
	volunteer_signup_shifts: 'id',
	volunteer_custom_questions: 'id',
	volunteer_signup_responses: 'id',
	volunteer_event_emails: 'id'
};
