import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { loadUserRoadIdBundle, pickRoadIdProfileFields } from '#lib/server/roadId';

export async function GET({ cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;
	const bundle = await loadUserRoadIdBundle(client, user.id);

	return json({
		profile: bundle.roadIdProfile,
		emergency_contacts: bundle.emergencyContacts,
		codes: bundle.linkedCodes
	});
}

export async function PUT({ request, cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const parsedBody = await readJsonBody(request, { maxBytes: 8 * 1024 });
	if (!parsedBody.ok) {
		return json({ error: parsedBody.error }, { status: parsedBody.status });
	}
	const body = parsedBody.value;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid profile update.' }, { status: 400 });
	}
	const { user_id, ...updatedFields } = body;
	if (user_id && user_id !== user.id) {
		return json({ error: 'You can only update your own profile.' }, { status: 403 });
	}
	const safeFields = pickRoadIdProfileFields(updatedFields);
	if (!safeFields) {
		return json({ error: 'No valid profile fields were provided.' }, { status: 400 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;
	const { data, error } = await client
		.from('road_id_profiles')
		.upsert({ user_id: user.id, ...safeFields }, { onConflict: 'user_id' })
		.select('user_id,full_name,phone,blood_type,allergies,medication,created_at')
		.single();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ profile: data ?? null });
}
