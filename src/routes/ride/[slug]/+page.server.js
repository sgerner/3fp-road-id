import { error } from '@sveltejs/kit';
import { getActivityClient, loadRideBySlug } from '#lib/server/activities';

export const load = async ({ params, cookies, setHeaders }) => {
	const { supabase, user } = await getActivityClient(cookies);
	if (user?.id) setHeaders({ 'cache-control': 'private, no-store' });
	const ride = await loadRideBySlug(supabase, params.slug, {
		rsvpViewerId: user?.id ?? null
	}).catch((err) => {
		console.error('Unable to load ride page', err);
		return null;
	});
	if (!ride) throw error(404, 'Ride not found');

	return {
		ride,
		currentUser: user ?? null,
		canManage: ride.canManageRsvps
	};
};
