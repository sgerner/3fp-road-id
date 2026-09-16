import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import { verifyOwnerInviteState } from '$lib/server/groupOwnerInvites';

// Redeems a short-lived capability issued to an existing group manager.
export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'group-owner-invite-redeem',
		limit: 5,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;

	try {
		const parsedBody = await readJsonBody(event.request, { maxBytes: 8 * 1024 });
		if (!parsedBody.ok) {
			return json({ error: parsedBody.error }, { status: parsedBody.status });
		}
		const inviteToken =
			parsedBody.value && typeof parsedBody.value === 'object' && !Array.isArray(parsedBody.value)
				? parsedBody.value.inviteToken
				: '';
		if (typeof inviteToken !== 'string' || !inviteToken.trim()) {
			return json({ error: 'Invitation is invalid or expired.' }, { status: 403 });
		}

		const { user } = await resolveVerifiedSession(event.cookies);
		if (!user?.id || !user.email) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}
		const serviceSupabase = createServiceSupabaseClient();
		if (!serviceSupabase) {
			return json({ error: 'Owner invitations are temporarily unavailable.' }, { status: 503 });
		}
		const slug = String(event.params.slug || '').trim();

		// Resolve group
		const { data: group, error: ge } = await serviceSupabase
			.from('groups')
			.select('id, slug')
			.eq('slug', slug)
			.maybeSingle();
		if (ge || !group) {
			return json({ error: 'Group not found' }, { status: 404 });
		}

		const invite = verifyOwnerInviteState(inviteToken.trim(), {
			groupId: group.id,
			groupSlug: group.slug,
			userEmail: user.email
		});
		if (!invite.ok) {
			return json({ error: 'Invitation is invalid or expired.' }, { status: 403 });
		}

		// Upsert owner membership
		const { data: existing, error: exErr } = await serviceSupabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner');
		if (exErr) {
			console.error('Owner membership lookup failed:', exErr);
			return json({ error: 'Unable to accept invitation.' }, { status: 400 });
		}

		if (!existing || !existing.length) {
			const { error: insErr } = await serviceSupabase
				.from('group_members')
				.insert([{ group_id: group.id, user_id: user.id, role: 'owner' }]);
			if (insErr) {
				console.error('Owner membership insert failed:', insErr);
				return json({ error: 'Unable to accept invitation.' }, { status: 400 });
			}
		}

		return json({ ok: true, slug: group.slug });
	} catch (e) {
		console.error('Add owner error', e);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}
