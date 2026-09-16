import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { enforceRateLimit } from '$lib/server/security';

export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'group-claim',
		limit: 10,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;

	try {
		const { user } = await resolveVerifiedSession(event.cookies);
		if (!user?.id) return json({ error: 'Not authenticated' }, { status: 401 });
		const userLimited = enforceRateLimit(event, {
			name: 'group-claim-user',
			limit: 10,
			windowMs: 60 * 60 * 1000,
			key: user.id
		});
		if (userLimited) return userLimited;

		const serviceSupabase = createServiceSupabaseClient();
		if (!serviceSupabase) {
			return json({ error: 'Group claiming is temporarily unavailable.' }, { status: 503 });
		}
		const slug = String(event.params.slug || '').trim();

		// Find group by slug
		const { data: group, error: ge } = await serviceSupabase
			.from('groups')
			.select('id, slug')
			.eq('slug', slug)
			.maybeSingle();
		if (ge || !group) return json({ error: 'Group not found' }, { status: 404 });

		const { data: claimed, error: claimError } = await serviceSupabase.rpc(
			'claim_unclaimed_group',
			{
				target_group_id: group.id,
				claimant_user_id: user.id
			}
		);
		if (claimError) {
			console.error('Atomic group claim failed:', claimError);
			return json({ error: 'Unable to claim group.' }, { status: 400 });
		}
		if (claimed !== true) return json({ error: 'Group already claimed' }, { status: 409 });

		return json({ ok: true, slug: group.slug });
	} catch (e) {
		console.error('Claim group error', e);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}
