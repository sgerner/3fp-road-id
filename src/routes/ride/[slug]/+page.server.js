import { error } from '@sveltejs/kit';
import { canManageActivity, getActivityClient, loadRideBySlug } from '$lib/server/activities';

export const load = async ({ params, cookies }) => {
	const { supabase, user } = getActivityClient(cookies);
	const ride = await loadRideBySlug(supabase, params.slug, { includeTemplates: false }).catch(
		(err) => {
			console.error('Unable to load ride page', err);
			return null;
		}
	);
	if (!ride) throw error(404, 'Ride not found');

	let canManage = false;
	if (user?.id) {
		canManage = await canManageActivity(supabase, ride.activity.id).catch((err) => {
			console.error('Unable to verify ride page permissions', err);
			return false;
		});
	}

	return {
		ride,
		currentUser: user ?? null,
		canManage
	};
};
