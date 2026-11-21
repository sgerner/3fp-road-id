export const FALLBACK_TIMEZONES = [
	'America/Los_Angeles',
	'America/Denver',
	'America/Chicago',
	'America/New_York',
	'America/Toronto',
	'America/Mexico_City',
	'America/Phoenix',
	'America/Anchorage',
	'Pacific/Honolulu',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'Europe/Madrid',
	'Europe/Amsterdam',
	'Europe/Copenhagen',
	'Australia/Sydney',
	'Australia/Melbourne',
	'Pacific/Auckland',
	'Asia/Tokyo',
	'Asia/Singapore',
	'Asia/Hong_Kong',
	'UTC'
];

export const statusOptions = ['draft', 'published', 'cancelled', 'archived'];
export const opportunityTypeOptions = [
	{ value: 'coordination', label: 'Coordination & Leads' },
	{ value: 'check-in', label: 'Check-in & Registration' },
	{ value: 'logistics', label: 'Logistics & Support' },
	{ value: 'mechanic', label: 'Mechanics & Repairs' },
	{ value: 'education', label: 'Education & Coaching' },
	{ value: 'hospitality', label: 'Hospitality & Culture' },
	{ value: 'safety', label: 'Safety & Course Marshals' },
	{ value: 'outreach', label: 'Outreach & Info Booths' },
	{ value: 'other', label: 'Other' }
];
export const emailTypeOptions = ['reminder', 'thank_you', 'follow_up', 'custom'];
export const fieldTypeOptions = [
	'text',
	'textarea',
	'number',
	'select',
	'multiselect',
	'checkbox',
	'phone',
	'email',
	'url'
];
