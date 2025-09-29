export function normalizeVolunteerEvents(rows) {
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
