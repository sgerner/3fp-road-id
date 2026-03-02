import { error } from '@sveltejs/kit';
import { getActivityClient, loadRideBySlug } from '$lib/server/activities';

export const load = async ({ params, cookies }) => {
	const { supabase, user } = getActivityClient(cookies);
	const ride = await loadRideBySlug(supabase, params.slug, { includeTemplates: false }).catch((err) => {
		console.error('Unable to load ride page', err);
		return null;
	});
	if (!ride) throw error(404, 'Ride not found');

	let canManage = false;
	if (user?.id) {
		const { data } = await supabase.rpc('can_manage_activity', {
			target_activity_event_id: ride.activity.id
		});
		canManage = Boolean(data);
	}

	return {
		ride,
		currentUser: user ?? null,
		canManage
	};
};
