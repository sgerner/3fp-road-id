export function toLocalDateTimeValue(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function toIsoDateTimeValue(value) {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function sortSiteEditorValue(value) {
	if (Array.isArray(value)) return value.map(sortSiteEditorValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortSiteEditorValue(value[key])])
	);
}

export function siteEditorConfigFingerprint(value) {
	return JSON.stringify(sortSiteEditorValue(value || {}));
}

export function mergeGroupSiteEditorConfig(defaultConfig = {}, savedConfig = {}) {
	const defaults = structuredClone(defaultConfig || {});
	const saved = structuredClone(savedConfig || {});
	return {
		...defaults,
		...saved,
		theme_colors: { ...(defaults.theme_colors || {}), ...(saved.theme_colors || {}) },
		sections: { ...(defaults.sections || {}), ...(saved.sections || {}) },
		ride_widget_config: {
			...(defaults.ride_widget_config || {}),
			...(saved.ride_widget_config || {})
		},
		announcement_expires_at: toLocalDateTimeValue(
			saved.announcement_expires_at || defaults.announcement_expires_at
		)
	};
}
