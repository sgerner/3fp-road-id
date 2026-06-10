import { json } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export async function PUT({ request, cookies }) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	// Expect a JSON payload like:
	// {
	//   user_id: "<profile-uuid>",
	//   full_name: "New Name",
	//   phone: "New Phone",
	//   blood_type: "New Blood Type",
	//   allergies: "New Allergies Info",
	//   medication: "New Medication Info"
	// }
	const body = await request.json();
	const { user_id, ...updatedFields } = body;
	if (user_id && user_id !== user.id) {
		return json({ error: 'You can only update your own profile.' }, { status: 403 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;
	const { data, error } = await client
		.from('road_id_profiles')
		.update(updatedFields)
		.eq('user_id', user.id)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ profile: data?.[0] ?? null });
}
