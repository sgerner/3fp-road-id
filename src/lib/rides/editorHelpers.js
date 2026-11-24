export function toLocalDateTimeValue(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (part) => String(part).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildOccurrenceDraft(occurrence) {
	if (!occurrence) return null;
	return {
		id: occurrence.id,
		titleOverride: occurrence.title_override || '',
		startsAt: toLocalDateTimeValue(occurrence.starts_at),
		endsAt: toLocalDateTimeValue(occurrence.ends_at),
		status: occurrence.status,
		startLocationName: occurrence.start_location_name || '',
		startLocationAddress: occurrence.start_location_address || '',
		endLocationName: occurrence.end_location_name || '',
		endLocationAddress: occurrence.end_location_address || ''
	};
}

export function buildHostGroupOptions(hostGroups = []) {
	return (hostGroups ?? []).map((group) => ({
		label: group.name || '',
		value: String(group.id),
		slug: group.slug || ''
	}));
}

export function filterHostGroupOptions(options = [], inputValue = '') {
	const query = (inputValue == null ? '' : String(inputValue)).trim().toLowerCase();
	if (!query) {
		return options;
	}
	return options.filter(
		(option) =>
			option.label?.toLowerCase().includes(query) || option.slug?.toLowerCase().includes(query)
	);
}
