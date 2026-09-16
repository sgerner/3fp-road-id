import { json } from '@sveltejs/kit';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';
import { normalizeRideWidgetConfig } from '$lib/rides/widgetConfig';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function POST(event) {
	const { request, cookies } = event;
	const limited = enforceRateLimit(event, {
		name: 'ride-widget-create',
		limit: 20,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;

	const parsedBody = await readJsonBody(request, { maxBytes: 16 * 1024 });
	if (!parsedBody.ok) {
		return invalid(parsedBody.error, parsedBody.status);
	}
	const payload = parsedBody.value;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return invalid('Invalid request body.');
	}

	const serviceSupabase = getActivityServiceClient();
	if (!serviceSupabase) {
		return invalid('Widget config saving is not available right now.', 503);
	}

	const { user } = await getActivityClient(cookies);
	const config = normalizeRideWidgetConfig(payload?.config ?? payload);
	const nowIso = new Date().toISOString();

	const { data, error } = await serviceSupabase
		.from('ride_widget_configs')
		.insert({
			config,
			created_by_user_id: user?.id ?? null,
			updated_at: nowIso
		})
		.select('id, config, created_at')
		.single();

	if (error) {
		console.error('Unable to save ride widget config', error);
		return invalid('Unable to save widget configuration right now.', 500);
	}

	return json({ data });
}
