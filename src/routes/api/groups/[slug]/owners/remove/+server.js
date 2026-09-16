import { json } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

export async function POST(event) {
	try {
		const limited = enforceRateLimit(event, {
			name: 'group-owner-remove',
			limit: 30,
			windowMs: 60 * 60 * 1000
		});
		if (limited) return limited;

		const parsedBody = await readJsonBody(event.request, { maxBytes: 8 * 1024 });
		if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
		const userId =
			parsedBody.value && typeof parsedBody.value.user_id === 'string'
				? parsedBody.value.user_id.trim().slice(0, 80)
				: '';
		if (!userId) return json({ error: 'Missing user_id' }, { status: 400 });

		const { accessToken, user: meUser } = await resolveVerifiedSession(event.cookies);
		if (!accessToken || !meUser?.id) return json({ error: 'Not authenticated' }, { status: 401 });

		const supabase = createRequestSupabaseClient(accessToken);
		const my_id = meUser.id;
		const serviceSupabase = createServiceSupabaseClient();
		if (!serviceSupabase)
			return json({ error: 'Owner management is temporarily unavailable.' }, { status: 503 });

		// Can't remove self
		if (my_id === userId) return json({ error: 'You cannot remove yourself.' }, { status: 400 });

		// Resolve group
		const { data: group, error: ge } = await supabase
			.from('groups')
			.select('id')
			.eq('slug', event.params.slug)
			.maybeSingle();
		if (ge || !group) return json({ error: 'Group not found' }, { status: 404 });

		// Check admin status
		const { data: profile } = await supabase
			.from('profiles')
			.select('admin')
			.eq('user_id', my_id)
			.maybeSingle();
		const isAdmin = profile?.admin === true;

		if (!isAdmin) {
			// Ensure requester is an owner
			const { data: owners, error: ownersErr } = await supabase
				.from('group_members')
				.select('user_id')
				.eq('group_id', group.id)
				.eq('user_id', my_id)
				.eq('role', 'owner');
			if (ownersErr) return json({ error: 'Unable to verify group ownership.' }, { status: 400 });
			if (!owners || !owners.length) return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Delete the specified owner
		const { error: delErr } = await serviceSupabase
			.from('group_members')
			.delete()
			.eq('group_id', group.id)
			.eq('user_id', userId)
			.eq('role', 'owner');
		if (delErr) return json({ error: 'Unable to remove group owner.' }, { status: 400 });

		return json({ ok: true });
	} catch (e) {
		console.error('Remove owner error', e);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}
