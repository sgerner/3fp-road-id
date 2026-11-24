import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { pickEmergencyContactFields } from '#lib/server/emergencyContacts';
import { normalizeContactPhoneInput } from '#lib/server/roadIdProfile';

export async function PUT({ request, cookies, params }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const { id } = params;
	const parsedBody = await readJsonBody(request, { maxBytes: 8 * 1024 });
	if (!parsedBody.ok) {
		return json({ error: parsedBody.error }, { status: parsedBody.status });
	}
	const payload = parsedBody.value;
	if (payload?.profile_id && payload.profile_id !== user.id) {
		return json({ error: 'You can only update contacts for your own profile.' }, { status: 403 });
	}
	const safeFields = pickEmergencyContactFields(payload);
	if (!safeFields) {
		return json({ error: 'No valid contact fields were provided.' }, { status: 400 });
	}
	if (typeof safeFields.contact_phone === 'string') {
		safeFields.contact_phone = normalizeContactPhoneInput(safeFields.contact_phone);
	}
	const requestSupabase = createRequestSupabaseClient(accessToken);

	const { data: existing, error: existingError } = await requestSupabase
		.from('emergency_contacts')
		.select('id, profile_id')
		.eq('id', id)
		.eq('profile_id', user.id)
		.maybeSingle();

	if (existingError) {
		return json({ error: existingError.message }, { status: 400 });
	}

	if (!existing) {
		return json({ error: 'Contact not found.' }, { status: 404 });
	}

	const { data, error } = await requestSupabase
		.from('emergency_contacts')
		.update(safeFields)
		.eq('id', id)
		.eq('profile_id', user.id)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json(data[0]);
}

export async function DELETE({ cookies, params }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const { id } = params;
	const requestSupabase = createRequestSupabaseClient(accessToken);

	const { error } = await requestSupabase
		.from('emergency_contacts')
		.delete()
		.eq('id', id)
		.eq('profile_id', user.id)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ message: 'Contact deleted successfully' });
}
