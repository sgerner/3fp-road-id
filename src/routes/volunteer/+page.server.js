import { normalizeVolunteerEvents } from '$lib/volunteer/event-utils';

export const load = async ({ fetch }) => {
	const now = new Date();
	const horizon = new Date(now);
	horizon.setDate(horizon.getDate() - 7);
	const horizonIso = horizon.toISOString();

	const eventCols = [
		'id',
		'slug',
		'title',
		'summary',
		'description',
		'event_start',
		'event_end',
		'timezone',
		'location_name',
		'location_address',
		'latitude',
		'longitude',
		'host_group_id',
		'event_type_slug',
		'status',
		'max_volunteers'
	];
	const eventsResp = await fetch(
		`/api/v1/volunteer-events?status=eq.published&event_start=gte.${horizonIso}&order=event_start.asc&limit=500&select=${eventCols.join(
			','
		)}`
	);

	if (!eventsResp.ok) {
		console.error('Failed to load volunteer events');
		return {
			events: [],
			hostGroups: [],
			eventTypes: []
		};
	}

	const { data: eventRows, error: eventsError } = await eventsResp.json();

	if (eventsError) {
		console.error('Failed to load volunteer events', eventsError);
		return {
			events: [],
			hostGroups: [],
			eventTypes: []
		};
	}

	const events = normalizeVolunteerEvents(eventRows);
	const hostGroupIds = Array.from(
		new Set(
			events.map((event) => event.host_group_id).filter((id) => id !== null && id !== undefined)
		)
	);

	let hostGroups = [];
	if (hostGroupIds.length) {
		const groupCols = [
			'id',
			'slug',
			'name',
			'city',
			'state_region',
			'country',
			'logo_url',
			'latitude',
			'longitude'
		];
		const hostsResp = await fetch(
			`/api/v1/groups?id=in.(${hostGroupIds.join(',')})&select=${groupCols.join(',')}`
		);

		if (hostsResp.ok) {
			const { data: hostRows, error: hostError } = await hostsResp.json();
			if (!hostError && Array.isArray(hostRows)) {
				hostGroups = hostRows.map((row) => ({
					id: row.id,
					slug: row.slug,
					name: row.name,
					city: row.city,
					state_region: row.state_region,
					country: row.country,
					logo_url: row.logo_url,
					latitude: row.latitude,
					longitude: row.longitude
				}));
			} else if (hostError) {
				console.warn('Failed to load host groups for volunteer events', hostError);
			}
		} else {
			console.warn('Failed to load host groups for volunteer events');
		}
	}

	let eventTypes = [];
	const typesResp = await fetch(
		`/api/v1/volunteer-event-types?select=slug,event_type,description&order=event_type.asc`
	);

	if (typesResp.ok) {
		const { data: typeRows, error: typesError } = await typesResp.json();
		if (!typesError && Array.isArray(typeRows)) {
			eventTypes = typeRows.map((row) => ({
				slug: row.slug,
				event_type: row.event_type,
				description: row.description
			}));
		} else if (typesError) {
			console.warn('Failed to load volunteer event types', typesError);
		}
	} else {
		console.warn('Failed to load volunteer event types');
	}

	return {
		events,
		hostGroups,
		eventTypes,
		retrievedAt: now.toISOString()
	};
};
