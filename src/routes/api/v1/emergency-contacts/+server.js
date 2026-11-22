import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { pickEmergencyContactFields } from '#lib/server/emergencyContacts';

export async function POST({ request, cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const parsedBody = await readJsonBody(request, { maxBytes: 8 * 1024 });
	if (!parsedBody.ok) {
		return json({ error: parsedBody.error }, { status: parsedBody.status });
	}
	const body = parsedBody.value;
	if (body?.profile_id && body.profile_id !== user.id) {
		return json({ error: 'You can only create contacts for your own profile.' }, { status: 403 });
	}
	const safeFields = pickEmergencyContactFields(body);
	if (!safeFields) {
		return json({ error: 'No valid contact fields were provided.' }, { status: 400 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const existingRoadId = await requestSupabase
		.from('road_id_profiles')
		.select('user_id')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!existingRoadId.error && !existingRoadId.data) {
		const seedProfile = await requestSupabase.from('road_id_profiles').insert({ user_id: user.id });
		if (seedProfile.error) {
			return json({ error: seedProfile.error.message }, { status: 400 });
		}
	}

	const { data, error } = await requestSupabase
		.from('emergency_contacts')
		.insert([{ ...safeFields, profile_id: user.id }])
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ contact: data?.[0] ?? null });
}
