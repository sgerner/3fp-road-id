export const RIDE_TIMEZONES = [
	'America/Los_Angeles',
	'America/Denver',
	'America/Chicago',
	'America/New_York',
	'America/Toronto',
	'America/Phoenix',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'UTC'
];

export const WEEKDAY_OPTIONS = [
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' },
	{ value: 7, label: 'Sun' }
];

export const MONTH_POSITION_OPTIONS = [
	{ value: 1, label: '1st' },
	{ value: 2, label: '2nd' },
	{ value: 3, label: '3rd' },
	{ value: 4, label: '4th' },
	{ value: -1, label: 'Last' }
];

export const SURFACE_TYPE_OPTIONS = [
	'Paved',
	'Gravel',
	'Dirt',
	'Mixed Surface',
	'Trail',
	'Bike Path'
];

export const BIKE_SUITABILITY_OPTIONS = [
	'Road Bike',
	'Gravel Bike',
	'Mountain Bike',
	'Hybrid',
	'City Bike',
	'Cargo Bike',
	'E-bike',
	'Adaptive Bike',
	'Kid-Friendly Setup'
];

export const DEFAULT_RIDE_EMAIL_TEMPLATES = [
	{
		name: 'Day-before reminder',
		templateType: 'reminder',
		sendOffsetMinutes: 24 * 60,
		subject: 'Tomorrow: {{ride_title}}',
		body: [
			'Hi {{participant_name}},',
			'',
			'Quick heads-up for {{ride_title}} tomorrow at {{ride_time}}.',
			'Meet at {{start_location}}.',
			'{{pace_line}}',
			'{{distance_line}}',
			'{{waiver_line}}',
			'',
			'Details: {{ride_url}}'
		].join('\n')
	}
];

export const DEFAULT_RIDE_FORM = {
	title: '',
	slug: '',
	summary: '',
	description: '',
	status: 'draft',
	timezone: RIDE_TIMEZONES[0],
	isHost: true,
	startsAt: '',
	endsAt: '',
	startLocationName: '',
	startLocationAddress: '',
	startLatitude: '',
	startLongitude: '',
	endLocationName: '',
	endLocationAddress: '',
	endLatitude: '',
	endLongitude: '',
	contactEmail: '',
	contactPhone: '',
	hostGroupId: '',
	participantVisibility: 'public',
	estimatedDistanceMiles: '',
	estimatedDurationMinutes: '',
	elevationGainFeet: '',
	paceNotes: '',
	isNoDrop: true,
	surfaceTypes: [],
	bikeSuitability: [],
	accessibilityNotes: '',
	waiverRequired: false,
	difficultyLevelIds: [],
	ridingDisciplineIds: [],
	recurrenceEnabled: false,
	recurrenceFrequency: 'weekly',
	recurrenceInterval: 1,
	recurrenceWeekdays: [],
	recurrenceMonthPositions: [1],
	recurrenceUntilOn: '',
	exclusions: [],
	emailTemplates: DEFAULT_RIDE_EMAIL_TEMPLATES.map((template, index) => ({
		id: `new-template-${index + 1}`,
		...template,
		isActive: true
	}))
};
