import { searchGeocode } from '$lib/server/geocoding';
import {
	filterRidesForWidget,
	normalizeRideWidgetConfig,
	parseRideWidgetConfigFromSearchParams
} from '$lib/rides/widgetConfig';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST_SCOPE_VALUES = new Set(['all', 'group_only', 'selected_groups']);

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

async function loadSavedWidgetConfig(widgetId, fetch) {
	if (!widgetId || !UUID_RE.test(widgetId)) return null;
	const response = await fetch(`/api/ride-widgets/${widgetId}`).catch(() => null);
	if (!response?.ok) return null;
	const payload = await response.json().catch(() => null);
	return payload?.data?.config ?? null;
}

async function resolveRadiusCenter(config, fetch) {
	if (!config?.radiusMiles) return null;

	const lat = toFiniteNumber(config.latitude);
	const lng = toFiniteNumber(config.longitude);
	if (lat !== null && lng !== null) {
		return {
			latitude: lat,
			longitude: lng,
			label: config.near || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
		};
	}

	if (!config.near) return null;
	let geocodeResults = await searchGeocode(config.near, {
		limit: 1,
		fetchImpl: fetch,
		countryCodes: 'us'
	}).catch(() => []);
	if (!geocodeResults.length && /^\d{5}(?:-\d{4})?$/.test(config.near)) {
		geocodeResults = await searchGeocode(`${config.near}, USA`, {
			limit: 1,
			fetchImpl: fetch,
			countryCodes: 'us'
		}).catch(() => []);
	}
	const first = geocodeResults?.[0];
	if (!first) return null;

	return {
		latitude: first.latitude,
		longitude: first.longitude,
		label: first.label
	};
}

export const load = async ({ url, fetch }) => {
	const widgetId = (url.searchParams.get('wid') || '').trim();
	const savedConfig = await loadSavedWidgetConfig(widgetId, fetch);
	const queryOverrides = parseRideWidgetConfigFromSearchParams(url.searchParams, { partial: true });
	const config = normalizeRideWidgetConfig({
		...(savedConfig ?? {}),
		...queryOverrides
	});

	const ridesResponse = await fetch('/api/rides');
	const ridesPayload = await ridesResponse.json().catch(() => ({ data: [] }));
	const rides = Array.isArray(ridesPayload?.data) ? ridesPayload.data : [];

	const center = await resolveRadiusCenter(config, fetch);
	let filteredRides = filterRidesForWidget(rides, config, { center });

	const hostScopeRaw = (url.searchParams.get('host_scope') || '').trim().toLowerCase();
	const hostScope = HOST_SCOPE_VALUES.has(hostScopeRaw) ? hostScopeRaw : 'all';
	const groupIds = (url.searchParams.get('group_ids') || '')
		.split(',')
		.map((value) => value.trim().toLowerCase())
		.filter((value) => UUID_RE.test(value));

	if (hostScope === 'selected_groups') {
		if (!groupIds.length) {
			filteredRides = [];
		} else {
			const allowed = new Set(groupIds);
			filteredRides = filteredRides.filter((ride) =>
				allowed.has(
					String(ride?.group?.id || '')
						.trim()
						.toLowerCase()
				)
			);
		}
	}

	return {
		config,
		rides: filteredRides,
		center,
		widgetId: savedConfig ? widgetId : null,
		totalRides: rides.length
	};
};
