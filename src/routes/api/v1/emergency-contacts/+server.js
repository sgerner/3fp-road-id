import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { pickEmergencyContactFields } from '#lib/server/emergencyContacts';
import { ensureRoadIdProfileExists } from '#lib/server/roadId';
import { normalizeContactPhoneInput } from '#lib/server/roadIdProfile';

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
	if (typeof safeFields.contact_phone === 'string') {
		safeFields.contact_phone = normalizeContactPhoneInput(safeFields.contact_phone);
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const ensured = await ensureRoadIdProfileExists({
		client: requestSupabase,
		userId: user.id,
		fallbackFullName:
			typeof user.user_metadata?.full_name === 'string'
				? user.user_metadata.full_name.trim().slice(0, 200)
				: ''
	});
	if (!ensured.ok) {
		return json({ error: ensured.error }, { status: 400 });
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
