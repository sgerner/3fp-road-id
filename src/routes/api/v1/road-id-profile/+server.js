import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { ALLOWED_BLOOD_TYPES, formatMedicationList } from '#lib/server/roadIdProfile';

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
		const trimmed = value[field].trim();
		if (field === 'blood_type' && !ALLOWED_BLOOD_TYPES.has(trimmed)) return null;
		result[field] = field === 'medication' ? formatMedicationList(trimmed) : trimmed;
	}
	return Object.keys(result).length ? result : null;
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
	const safeFields = pickProfileFields(updatedFields);
	if (!safeFields) {
		return json({ error: 'No valid profile fields were provided.' }, { status: 400 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const { data, error } = await requestSupabase
		.from('road_id_profiles')
		.upsert({ user_id: user.id, ...safeFields }, { onConflict: 'user_id' })
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ profile: data?.[0] ?? null });
}
