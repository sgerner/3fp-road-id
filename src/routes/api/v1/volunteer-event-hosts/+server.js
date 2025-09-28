import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

async function getSupabaseInstance(event) {
	return { supabase };
}

export async function GET(event) {
	const { url } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const eventId = url.searchParams.get('event_id');
	if (!eventId) {
		return json({ error: 'event_id is required' }, { status: 400 });
	}

	const { data, error } = await sbInstance
		.from('v_volunteer_event_hosts_with_profiles')
		.select('*')
		.eq('event_id', eventId);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ data });
}

export async function POST(event) {
	const { request } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	try {
		const { event_id, email } = await request.json();
		if (!event_id || !email) {
			return json({ error: 'event_id and email are required.' }, { status: 400 });
		}

		const { data: user, error: userError } = await sbInstance
			.from('profiles')
			.select('user_id')
			.eq('email', email)
			.single();

		if (userError || !user) {
			return json({ error: 'User not found.' }, { status: 404 });
		}

		const { data, error } = await sbInstance
			.from('volunteer_event_hosts')
			.insert({ event_id, user_id: user.user_id })
			.select('*, profile:profiles(email)')
			.single();

		if (error) {
			return json({ error: error.message }, { status: 400 });
		}

		return json({ data }, { status: 201 });
	} catch (e) {
		return json({ error: 'Invalid JSON body or server error.' }, { status: 400 });
	}
}

export async function DELETE(event) {
	const { request } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	try {
		const { event_id, user_id } = await request.json();
		if (!event_id || !user_id) {
			return json({ error: 'event_id and user_id are required.' }, { status: 400 });
		}

		const { error } = await sbInstance
			.from('volunteer_event_hosts')
			.delete()
			.eq('event_id', event_id)
			.eq('user_id', user_id);

		if (error) {
			return json({ error: error.message }, { status: 400 });
		}

		return json({ message: 'Host removed successfully.' }, { status: 200 });
	} catch (e) {
		return json({ error: 'Invalid JSON body or server error.' }, { status: 400 });
	}
}
