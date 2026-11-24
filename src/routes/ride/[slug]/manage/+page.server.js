import { error, redirect } from '@sveltejs/kit';
import {
	canManageActivity,
	getActivityClient,
	loadRideBySlug,
	loadRideLookups
} from '#lib/server/activities';
import { loadActiveEventSponsorshipRequest } from '#lib/server/eventSponsorships';
import { loadHostGroupDirectory } from '#lib/server/hostGroupDirectory';

export const load = async ({ params, cookies }) => {
	const { supabase, user } = await getActivityClient(cookies);
	if (!user?.id) throw redirect(303, `/ride/${params.slug}`);

	const ride = await loadRideBySlug(supabase, params.slug, {
		includeTemplates: true,
		includePrivateProfiles: true,
		includePrivateRsvps: true
	}).catch((err) => {
		console.error('Unable to load manage ride page', err);
		return null;
	});
	if (!ride) throw error(404, 'Ride not found');

	const canManageResult = await canManageActivity(supabase, ride.activity.id).catch((err) => {
		console.error('Unable to verify manage ride permissions', err);
		return false;
	});
	if (!canManageResult) throw redirect(303, `/ride/${params.slug}`);

	const [lookups, directory, activeSponsorshipRequest] = await Promise.all([
		loadRideLookups(supabase),
		loadHostGroupDirectory({
			supabase,
			userId: user.id,
			allowSiteAdmin: false
		}),
		loadActiveEventSponsorshipRequest({ activityEventId: ride.activity.id }).catch(() => null)
	]);

	return {
		ride,
		currentUser: user,
		hostGroups: directory.hostGroups,
		activeSponsorshipRequest,
		...lookups
	};
};
