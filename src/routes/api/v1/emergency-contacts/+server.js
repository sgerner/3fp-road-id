import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { readJsonBody } from '#lib/server/security';
import { pickEmergencyContactFields } from '#lib/server/emergencyContacts';

export async function POST({ request, cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
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
	const serviceSupabase = createServiceSupabaseClient();
	const client = serviceSupabase ?? requestSupabase;

	const { data, error } = await client
		.from('emergency_contacts')
		.insert([{ ...safeFields, profile_id: user.id }])
		.select();

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ contact: data?.[0] ?? null });
}
