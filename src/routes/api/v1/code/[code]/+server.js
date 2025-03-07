import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET({ params }) {
	const { code } = params;

	// Query the qr_codes table, joining the related profile and emergency contacts
	const { data, error } = await supabase
		.from('qr_codes')
		.select(
			`
			code,
			created_at,
			profile:profiles (
				user_id,
				full_name,
				phone,
				blood_type,
				allergies,
				medication,
				emergency_contacts (
					id,
					contact_name,
					contact_phone,
					contact_relationship
				)
			)
		`
		)
		.eq('code', code)
		.single();

	if (error) {
		return json({ error: error.message }, { status: 404 });
	}

	return json(data);
}
