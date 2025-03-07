import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

/**
 * Update an existing emergency contact.
 * Expects a JSON payload with the updated fields.
 */
export async function PUT({ request, params }) {
	const { id } = params;
	const payload = await request.json();

	const { data, error } = await supabase
		.from('emergency_contacts')
		.update(payload)
		.eq('id', id)
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
export async function DELETE({ params }) {
	const { id } = params;

	const { data, error } = await supabase.from('emergency_contacts').delete().eq('id', id);

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ message: 'Contact deleted successfully' });
}
