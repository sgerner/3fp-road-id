import { error } from '@sveltejs/kit';
import { normalizeVolunteerEvents } from '$lib/volunteer/event-utils';

export const load = async (event) => {
	const { params, fetch } = event;
	const slug = params.slug?.trim();
	if (!slug) {
		throw error(404, 'Group not found');
	}

	const groupCols = [
		'id',
		'slug',
		'name',
		'tagline',
		'city',
		'state_region',
		'country',
		'logo_url',
		'cover_photo_url',
		'website_url',
		'social_links',
		'public_contact_email',
		'public_phone_number',
		'preferred_cta_kind',
		'preferred_cta_label',
		'preferred_cta_url',
		'latitude',
		'longitude'
	];
	const groupResp = await fetch(
		`/api/v1/groups?slug=eq.${slug}&select=${groupCols.join(',')}&single=maybe`
	);
	const { data: groupRow, error: groupError } = await groupResp.json();

	if (groupError || !groupRow) {
		throw error(404, 'Group not found');
	}

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
		`/api/v1/volunteer-events?status=eq.published&host_group_id=eq.${
			groupRow.id
		}&event_start=gte.${horizonIso}&order=event_start.asc&limit=500&select=${eventCols.join(',')}`
	);

	let eventRows = [];
	if (eventsResp.ok) {
		const { data, error: eventsError } = await eventsResp.json();
		if (eventsError) {
			console.warn('Failed to load volunteer events for group page', eventsError);
		} else {
			eventRows = data;
		}
	}

	const events = normalizeVolunteerEvents(eventRows);

	const hostGroups = [
		{
			id: groupRow.id,
			slug: groupRow.slug,
			name: groupRow.name,
			city: groupRow.city,
			state_region: groupRow.state_region,
			country: groupRow.country,
			logo_url: groupRow.logo_url,
			latitude: groupRow.latitude,
			longitude: groupRow.longitude
		}
	];

	let eventTypes = [];
	const eventTypesResp = await fetch(
		`/api/v1/volunteer-event-types?select=slug,event_type,description&order=event_type.asc`
	);
	if (eventTypesResp.ok) {
		const { data: typeRows, error: typesError } = await eventTypesResp.json();
		if (typesError) {
			console.warn('Failed to load volunteer event types for group page', typesError);
		} else if (Array.isArray(typeRows)) {
			eventTypes = typeRows.map((row) => ({
				slug: row.slug,
				event_type: row.event_type,
				description: row.description
			}));
		}
	}

	return {
		group: groupRow,
		events,
		hostGroups,
		eventTypes,
		retrievedAt: now.toISOString()
	};
};
