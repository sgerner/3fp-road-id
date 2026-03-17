import { error, redirect } from '@sveltejs/kit';
import {
	canManageActivity,
	getActivityClient,
	loadRideBySlug,
	loadRideLookups
} from '$lib/server/activities';

async function loadHostGroups(supabase) {
	const { data: groups } = await supabase
		.from('groups')
		.select('id,name,slug')
		.order('name', { ascending: true });
	return groups ?? [];
}

export const load = async ({ params, cookies }) => {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) throw redirect(303, `/ride/${params.slug}`);

	const ride = await loadRideBySlug(supabase, params.slug, { includeTemplates: true }).catch(
		(err) => {
			console.error('Unable to load manage ride page', err);
			return null;
		}
	);
	if (!ride) throw error(404, 'Ride not found');

	const canManageResult = await canManageActivity(supabase, ride.activity.id).catch((err) => {
		console.error('Unable to verify manage ride permissions', err);
		return false;
	});
	if (!canManageResult) throw redirect(303, `/ride/${params.slug}`);

	const [lookups, hostGroups] = await Promise.all([
		loadRideLookups(supabase),
		loadHostGroups(supabase)
	]);

	return {
		ride,
		currentUser: user,
		hostGroups,
		...lookups
	};
};
