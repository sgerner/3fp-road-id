import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	// Expect a JSON payload like:
	// {
	//   profile_id: "<profile-uuid>",
	//   contact_name: "Contact Name",
	//   contact_phone: "Contact Phone",
	//   contact_relationship: "Relationship"
	// }
	const body = await request.json();

	const { data, error } = await supabase.from('emergency_contacts').insert([body]);

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ contact: data });
}
