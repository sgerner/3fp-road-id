import { supabase } from '$lib/supabaseClient';

function normalizeEvents(rows) {
	if (!Array.isArray(rows)) return [];
	return rows
		.filter((row) => row && typeof row === 'object')
		.map((row) => ({
			id: row.id,
			slug: row.slug,
			title: row.title,
			summary: row.summary,
			description: row.description,
			event_start: row.event_start,
			event_end: row.event_end,
			timezone: row.timezone,
			location_name: row.location_name,
			location_address: row.location_address,
			latitude: row.latitude,
			longitude: row.longitude,
			host_group_id: row.host_group_id,
			event_type_slug: row.event_type_slug,
			status: row.status,
			max_volunteers: row.max_volunteers
		}));
}

export const load = async () => {
	const now = new Date();
	const horizon = new Date(now);
	horizon.setDate(horizon.getDate() - 7);
	const horizonIso = horizon.toISOString();

	const { data: eventRows, error: eventsError } = await supabase
		.from('volunteer_events')
		.select(
			[
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
			].join(', ')
		)
		.eq('status', 'published')
		.gte('event_start', horizonIso)
		.order('event_start', { ascending: true })
		.limit(500);

	if (eventsError) {
		console.error('Failed to load volunteer events', eventsError);
		return {
			events: [],
			hostGroups: [],
			eventTypes: []
		};
	}

	const events = normalizeEvents(eventRows);
	const hostGroupIds = Array.from(
		new Set(
			events.map((event) => event.host_group_id).filter((id) => id !== null && id !== undefined)
		)
	);

	let hostGroups = [];
	if (hostGroupIds.length) {
		const { data: hostRows, error: hostError } = await supabase
			.from('groups')
			.select(
				[
					'id',
					'slug',
					'name',
					'city',
					'state_region',
					'country',
					'logo_url',
					'latitude',
					'longitude'
				].join(', ')
			)
			.in('id', hostGroupIds);
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
	}

	let eventTypes = [];
	const { data: typeRows, error: typesError } = await supabase
		.from('volunteer_event_types')
		.select('slug, event_type, description')
		.order('event_type');
	if (!typesError && Array.isArray(typeRows)) {
		eventTypes = typeRows.map((row) => ({
			slug: row.slug,
			event_type: row.event_type,
			description: row.description
		}));
	} else if (typesError) {
		console.warn('Failed to load volunteer event types', typesError);
	}

	return {
		events,
		hostGroups,
		eventTypes,
		retrievedAt: now.toISOString()
	};
};
