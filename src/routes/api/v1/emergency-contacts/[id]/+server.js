import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { readJsonBody } from '$lib/server/security';

const CONTACT_FIELDS = {
	contact_name: 200,
	contact_phone: 64,
	contact_relationship: 120
};

function pickContactFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const result = {};
	for (const [field, maxLength] of Object.entries(CONTACT_FIELDS)) {
		if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
		if (typeof value[field] !== 'string' || value[field].length > maxLength) return null;
		result[field] = value[field].trim();
	}
	return Object.keys(result).length ? result : null;
}

/**
 * Update an existing emergency contact.
 * Expects a JSON payload with the updated fields.
 */
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
	const safeFields = pickContactFields(payload);
	if (!safeFields) {
		return json({ error: 'No valid contact fields were provided.' }, { status: 400 });
	}
	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;

	const { data: existing, error: existingError } = await client
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

	const { data, error } = await client
		.from('emergency_contacts')
		.update(safeFields)
		.eq('id', id)
		.eq('profile_id', user.id)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	// data is an array with the updated contact as the first element.
	return json(data[0]);
}

/**
 * Delete an emergency contact.
 */
export async function DELETE({ request, cookies, params }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const { id } = params;
	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;

	const { data, error } = await client
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
