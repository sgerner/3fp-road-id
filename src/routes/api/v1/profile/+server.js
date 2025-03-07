import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function PUT({ request }) {
	// Expect a JSON payload like:
	// {
	//   user_id: "<profile-uuid>",
	//   full_name: "New Name",
	//   phone: "New Phone",
	//   blood_type: "New Blood Type",
	//   allergies: "New Allergies Info",
	//   medication: "New Medication Info"
	// }
	const body = await request.json();
	const { user_id, ...updatedFields } = body;

	const { data, error } = await supabase
		.from('profiles')
		.update(updatedFields)
		.eq('user_id', user_id);

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ profile: data });
}
