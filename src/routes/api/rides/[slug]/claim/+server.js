import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { getActivityClient, loadRideBySlug } from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function POST({ params, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);

	const ride = await loadRideBySlug(supabase, params.slug, { includeTemplates: false }).catch((error) => {
		console.error('Unable to load ride for claim', error);
		return null;
	});
	if (!ride?.activity?.id) return invalid('Ride not found.', 404);

	if (ride.activity.host_user_id || ride.activity.host_group_id) {
		return invalid('Ride already has a host.', 409);
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return invalid('Ride claiming is not configured.', 500);
	}

	const { data: updatedRide, error } = await serviceSupabase
		.from('activity_events')
		.update({
			host_user_id: user.id,
			updated_at: new Date().toISOString()
		})
		.eq('id', ride.activity.id)
		.is('host_user_id', null)
		.is('host_group_id', null)
		.select('id,slug')
		.maybeSingle();

	if (error) {
		console.error('Unable to claim ride', error);
		return invalid(error.message, 400);
	}
	if (!updatedRide?.id) {
		return invalid('Ride was already claimed.', 409);
	}

	return json({ ok: true, slug: updatedRide.slug });
}
