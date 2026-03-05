import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';
import { normalizeRideWidgetConfig } from '$lib/rides/widgetConfig';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function GET({ params, cookies }) {
	const id = (params.id || '').trim();
	if (!UUID_RE.test(id)) {
		return invalid('Invalid widget id.');
	}

	const { supabase } = getActivityClient(cookies);
	const { data, error } = await supabase
		.from('ride_widget_configs')
		.select('id, config, created_at')
		.eq('id', id)
		.eq('is_active', true)
		.maybeSingle();

	if (error) {
		console.error('Unable to load ride widget config', error);
		return invalid(error.message, 500);
	}

	if (!data) {
		return invalid('Widget config not found.', 404);
	}

	return json({
		data: {
			id: data.id,
			createdAt: data.created_at,
			config: normalizeRideWidgetConfig(data.config ?? {})
		}
	});
}
