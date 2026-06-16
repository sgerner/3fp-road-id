import { json } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';

export async function POST({ request, cookies }) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	// Expect a JSON payload like:
	// {
	//   profile_id: "<profile-uuid>",
	//   contact_name: "Contact Name",
	//   contact_phone: "Contact Phone",
	//   contact_relationship: "Relationship"
	// }
	const body = await request.json();
	if (body?.profile_id && body.profile_id !== user.id) {
		return json({ error: 'You can only create contacts for your own profile.' }, { status: 403 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;

	const { data, error } = await client
		.from('emergency_contacts')
		.insert([{ ...body, profile_id: user.id }])
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ contact: data?.[0] ?? null });
}
