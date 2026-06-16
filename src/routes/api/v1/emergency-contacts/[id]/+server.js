import { json } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';

/**
 * Update an existing emergency contact.
 * Expects a JSON payload with the updated fields.
 */
export async function PUT({ request, cookies, params }) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const { id } = params;
	const payload = await request.json();
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
		.update(payload)
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
	const { accessToken, user } = resolveSession(cookies);
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
