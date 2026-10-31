export async function loadOpportunities(fetch, events) {
	const eventIds = Array.from(new Set(events.map((event) => event?.id).filter(Boolean)));
	const batches = [];
	for (let index = 0; index < eventIds.length; index += 100) {
		batches.push(eventIds.slice(index, index + 100));
	}

	const rows = [];
	for (const batch of batches) {
		const params = new URLSearchParams({
			event_id: `in.(${batch.join(',')})`,
			select: 'id,event_id',
			limit: '500'
		});
		const response = await fetch(`/api/v1/volunteer-opportunities?${params}`);
		if (!response.ok) {
			console.warn('Failed to load volunteer opportunities for event cards');
			continue;
		}
		const { data, error } = await response.json();
		if (error) {
			console.warn('Failed to load volunteer opportunities for event cards', error);
			continue;
		}
		if (Array.isArray(data)) rows.push(...data);
	}
	return rows;
}
