import { json } from '@sveltejs/kit';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';
import { normalizeRideWidgetConfig } from '$lib/rides/widgetConfig';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function POST({ request, cookies }) {
	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') {
		return invalid('Invalid request body.');
	}

	const serviceSupabase = getActivityServiceClient();
	if (!serviceSupabase) {
		return invalid('Widget config saving is not available right now.', 503);
	}

	const { user } = getActivityClient(cookies);
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
		return invalid(error.message, 500);
	}

	return json({ data });
}
