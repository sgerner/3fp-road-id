import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ params, cookies, request }) {
	try {
		const slug = params.slug;
		const body = await request.json().catch(() => ({}));
		const user_id = body.user_id;
		if (!user_id) return json({ error: 'Missing user_id' }, { status: 400 });

		const sessionCookie = cookies.get('sb_session');
		if (!sessionCookie) return json({ error: 'Not authenticated' }, { status: 401 });
		let parsed;
		try {
			parsed = JSON.parse(sessionCookie);
		} catch {
			parsed = null;
		}
		const access_token = parsed?.access_token;
		if (!access_token) return json({ error: 'Not authenticated' }, { status: 401 });

		const { data: me } = await supabase.auth.getUser(access_token);
		const my_id = me?.user?.id;
		if (!my_id) return json({ error: 'Invalid user' }, { status: 401 });

		// Can't remove self
		if (my_id === user_id) return json({ error: 'You cannot remove yourself.' }, { status: 400 });

		// Resolve group
		const { data: group, error: ge } = await supabase
			.from('groups')
			.select('id')
			.eq('slug', slug)
			.single();
		if (ge || !group) return json({ error: 'Group not found' }, { status: 404 });

		// Ensure requester is an owner
		const { data: owners, error: ownersErr } = await supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', my_id)
			.eq('role', 'owner');
		if (ownersErr) return json({ error: ownersErr.message }, { status: 400 });
		if (!owners || !owners.length) return json({ error: 'Forbidden' }, { status: 403 });

		// Delete the specified owner
		const { error: delErr } = await supabase
			.from('group_members')
			.delete()
			.eq('group_id', group.id)
			.eq('user_id', user_id)
			.eq('role', 'owner');
		if (delErr) return json({ error: delErr.message }, { status: 400 });

		return json({ ok: true });
	} catch (e) {
		console.error('Remove owner error', e);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}
