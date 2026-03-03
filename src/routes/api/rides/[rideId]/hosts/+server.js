import { json } from '@sveltejs/kit';
import { canManageActivity, getActivityClient, loadRideById } from '$lib/server/activities';

function invalid(message, status = 400) {
	return json({ error: message }, { status });
}

export async function GET({ params, cookies }) {
	const { supabase } = getActivityClient(cookies);
	const ride = await loadRideById(supabase, params.rideId, { includeTemplates: false }).catch(() => null);
	if (!ride) return invalid('Ride not found.', 404);
	return json({
		data: {
			hosts: ride.hosts,
			groupManagers: ride.groupManagers
		}
	});
}

export async function POST({ params, request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);
	const canManage = await canManageActivity(supabase, params.rideId).catch((error) => {
		console.error('Unable to verify ride host permissions', error);
		return null;
	});
	if (canManage === null) return invalid('Unable to verify ride permissions.', 400);
	if (!canManage) return invalid('You do not have permission to manage co-hosts for this ride.', 403);

	const payload = await request.json().catch(() => null);
	const email = String(payload?.email || '').trim().toLowerCase();
	if (!email) return invalid('Email is required.');

	const ride = await loadRideById(supabase, params.rideId, { includeTemplates: false }).catch(() => null);
	if (!ride) return invalid('Ride not found or unavailable.', 404);

	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('user_id,full_name,email')
		.eq('email', email)
		.maybeSingle();
	if (profileError) {
		console.error('Unable to look up host profile', profileError);
		return invalid(profileError.message, 400);
	}
	if (!profile?.user_id) return invalid('No user with that email was found.', 404);

	const { error: insertError } = await supabase.from('activity_hosts').upsert(
		{
			activity_event_id: params.rideId,
			user_id: profile.user_id
		},
		{ onConflict: 'activity_event_id,user_id' }
	);
	if (insertError) {
		console.error('Unable to add ride host', insertError);
		return invalid(insertError.message, 400);
	}

	return json({
		data: {
			userId: profile.user_id,
			profile: {
				userId: profile.user_id,
				fullName: profile.full_name || null,
				email: profile.email || null
			}
		}
	});
}

export async function DELETE({ params, request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	if (!user?.id) return invalid('Authentication required.', 401);
	const canManage = await canManageActivity(supabase, params.rideId).catch((error) => {
		console.error('Unable to verify ride host permissions', error);
		return null;
	});
	if (canManage === null) return invalid('Unable to verify ride permissions.', 400);
	if (!canManage) return invalid('You do not have permission to manage co-hosts for this ride.', 403);

	const payload = await request.json().catch(() => null);
	if (!payload?.userId) return invalid('userId is required.');

	const { error } = await supabase
		.from('activity_hosts')
		.delete()
		.eq('activity_event_id', params.rideId)
		.eq('user_id', payload.userId);
	if (error) {
		console.error('Unable to remove ride host', error);
		return invalid(error.message, 400);
	}

	return json({ data: { removed: true } });
}
