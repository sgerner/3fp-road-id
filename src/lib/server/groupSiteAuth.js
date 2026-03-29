import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';

export async function requireGroupSiteManager({ cookies, groupSlug }) {
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return { ok: false, status: 500, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
	}

	const { user } = resolveSession(cookies);
	if (!user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}

	const slug = String(groupSlug || '').trim();
	if (!slug) {
		return { ok: false, status: 400, error: 'Group slug is required.' };
	}

	const { data: group } = await serviceSupabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.maybeSingle();
	if (!group) {
		return { ok: false, status: 404, error: 'Group not found.' };
	}

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		serviceSupabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		serviceSupabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
			.limit(1)
	]);
	const isAdmin = profile?.admin === true;
	const isOwner = Array.isArray(ownerRows) && ownerRows.length > 0;

	if (!isAdmin && !isOwner) {
		return { ok: false, status: 403, error: 'You are not allowed to manage this group site.' };
	}

	return {
		ok: true,
		serviceSupabase,
		group,
		userId: user.id,
		isAdmin
	};
}
