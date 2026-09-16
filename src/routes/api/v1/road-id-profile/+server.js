import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '$lib/server/session';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { readJsonBody } from '$lib/server/security';

const PROFILE_FIELDS = {
	full_name: 200,
	phone: 64,
	blood_type: 64,
	allergies: 2_000,
	medication: 2_000
};

function pickProfileFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const result = {};
	for (const [field, maxLength] of Object.entries(PROFILE_FIELDS)) {
		if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
		if (typeof value[field] !== 'string' || value[field].length > maxLength) return null;
		result[field] = value[field].trim();
	}
	return Object.keys(result).length ? result : null;
}

export async function PUT({ request, cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
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
	const safeFields = pickProfileFields(updatedFields);
	if (!safeFields) {
		return json({ error: 'No valid profile fields were provided.' }, { status: 400 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;
	const { data, error } = await client
		.from('road_id_profiles')
		.update(safeFields)
		.eq('user_id', user.id)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ profile: data?.[0] ?? null });
}
