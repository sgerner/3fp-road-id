import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';

/** @returns {Promise<{ ok: false, status: number, error: string } | { ok: true, group: any }>} */
export async function requireGroupSiteAiOwner(cookies, groupSlug) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', groupSlug)
		.maybeSingle();
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	if (!(profile?.admin === true) && !(ownerRows ?? []).length) {
		return { ok: false, status: 403, error: 'You do not have permission to manage this site.' };
	}

	return { ok: true, group };
}

export async function readGroupSiteManagerRoles(serviceSupabase, groupId, userId) {
	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		serviceSupabase.from('profiles').select('admin').eq('user_id', userId).maybeSingle(),
		serviceSupabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', groupId)
			.eq('user_id', userId)
			.eq('role', 'owner')
			.limit(1)
	]);
	return {
		isAdmin: profile?.admin === true,
		isOwner: Array.isArray(ownerRows) && ownerRows.length > 0
	};
}

/**
 * @returns {Promise<
 *   | { ok: false, status: number, error: string }
 *   | { ok: true, serviceSupabase: any, group: any, userId: string, isAdmin: boolean }
 * >}
 */
export async function requireGroupSiteManager({ cookies, groupSlug }) {
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return { ok: false, status: 500, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
	}

	const { user } = await resolveVerifiedSession(cookies);
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

	const { isAdmin, isOwner } = await readGroupSiteManagerRoles(serviceSupabase, group.id, user.id);

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
