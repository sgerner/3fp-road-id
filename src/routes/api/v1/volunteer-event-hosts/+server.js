import { json } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

async function getSupabaseInstance(event) {
	const { accessToken } = await resolveVerifiedSession(event.cookies);
	const supabase = createRequestSupabaseClient(accessToken);
	return { supabase, serviceSupabase: createServiceSupabaseClient() };
}

export async function GET(event) {
	const { url } = event;
	const {
		supabase: sbInstance,
		serviceSupabase,
		error: authError
	} = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const eventId = url.searchParams.get('event_id');
	if (!eventId) {
		return json({ error: 'event_id is required' }, { status: 400 });
	}

	const lookupEmail = url.searchParams.get('lookup_email')?.trim().toLowerCase() || '';
	if (lookupEmail) {
		const { data: canManage, error: permissionError } = await sbInstance.rpc(
			'can_manage_volunteer_event',
			{ target_event_id: eventId }
		);
		if (permissionError || canManage !== true) {
			return json({ error: 'You do not have permission to manage this event.' }, { status: 403 });
		}

		const lookupClient = serviceSupabase || sbInstance;
		const safeTerm = lookupEmail.replace(/[%_]/g, '');
		const { data, error } = await lookupClient
			.from('profiles')
			.select('id,user_id,email,full_name,phone,emergency_contact_name,emergency_contact_phone')
			.ilike('email', `%${safeTerm}%`)
			.order('email', { ascending: true })
			.limit(5);
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ data: data ?? [] });
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
	const limited = enforceRateLimit(event, {
		name: 'volunteer-event-hosts-write',
		limit: 60,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;
	const {
		supabase: sbInstance,
		serviceSupabase,
		error: authError
	} = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	try {
		const parsedBody = await readJsonBody(request, { maxBytes: 16 * 1024 });
		if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
		const body = parsedBody.value;
		const eventId = typeof body?.event_id === 'string' ? body.event_id.trim().slice(0, 80) : '';
		const email =
			typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
		if (!eventId || !email) {
			return json({ error: 'event_id and email are required.' }, { status: 400 });
		}

		const { data: canManage, error: permissionError } = await sbInstance.rpc(
			'can_manage_volunteer_event',
			{ target_event_id: eventId }
		);
		if (permissionError || canManage !== true) {
			return json({ error: 'You do not have permission to manage this event.' }, { status: 403 });
		}

		const lookupClient = serviceSupabase || sbInstance;
		const { data: user, error: userError } = await lookupClient
			.from('profiles')
			.select('user_id')
			.eq('email', email)
			.single();

		if (userError || !user) {
			return json({ error: 'User not found.' }, { status: 404 });
		}

		const { data, error } = await sbInstance
			.from('volunteer_event_hosts')
			.insert({ event_id: eventId, user_id: user.user_id })
			.select('*, profile:profiles(email)')
			.single();

		if (error) return json({ error: 'Unable to add event host.' }, { status: 400 });

		return json({ data }, { status: 201 });
	} catch (e) {
		return json({ error: 'Invalid JSON body or server error.' }, { status: 400 });
	}
}

export async function DELETE(event) {
	const { request } = event;
	const limited = enforceRateLimit(event, {
		name: 'volunteer-event-hosts-write',
		limit: 60,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	try {
		const parsedBody = await readJsonBody(request, { maxBytes: 16 * 1024 });
		if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
		const body = parsedBody.value;
		const eventId = typeof body?.event_id === 'string' ? body.event_id.trim().slice(0, 80) : '';
		const userId = typeof body?.user_id === 'string' ? body.user_id.trim().slice(0, 80) : '';
		if (!eventId || !userId) {
			return json({ error: 'event_id and user_id are required.' }, { status: 400 });
		}

		const { data: canManage, error: permissionError } = await sbInstance.rpc(
			'can_manage_volunteer_event',
			{ target_event_id: eventId }
		);
		if (permissionError || canManage !== true) {
			return json({ error: 'You do not have permission to manage this event.' }, { status: 403 });
		}

		const { error } = await sbInstance
			.from('volunteer_event_hosts')
			.delete()
			.eq('event_id', eventId)
			.eq('user_id', userId);

		if (error) {
			return json({ error: 'Unable to remove event host.' }, { status: 400 });
		}

		return json({ message: 'Host removed successfully.' }, { status: 200 });
	} catch (e) {
		return json({ error: 'Invalid JSON body or server error.' }, { status: 400 });
	}
}
