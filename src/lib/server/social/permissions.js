import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';

const MANAGER_ROLES = ['owner', 'admin'];

function cleanSlug(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

async function resolveProfileAdminFlag(requestSupabase, userId) {
	if (!requestSupabase || !userId) return false;
	const { data } = await requestSupabase
		.from('profiles')
		.select('admin')
		.eq('user_id', userId)
		.maybeSingle();
	return data?.admin === true;
}

export async function getSocialAuthContext(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) return null;

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}

	const isAdmin = await resolveProfileAdminFlag(requestSupabase, user.id).catch(() => false);

	return {
		accessToken,
		user,
		userId: user.id,
		isAdmin,
		requestSupabase,
		serviceSupabase
	};
}

export async function loadGroupBySlug(supabase, slug) {
	const clean = cleanSlug(slug);
	if (!clean) return null;
	const { data, error } = await supabase
		.from('groups')
		.select('id,slug,name')
		.eq('slug', clean)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function isGroupClaimed(supabase, groupId) {
	if (!groupId) return false;
	const { count, error } = await supabase
		.from('group_members')
		.select('user_id', { count: 'exact', head: true })
		.eq('group_id', groupId)
		.eq('role', 'owner');
	if (error) throw new Error(error.message);
	return (count ?? 0) > 0;
}

export async function canManageGroupSocial(requestSupabase, userId, groupId) {
	if (!requestSupabase || !userId || !groupId) return false;
	const { data, error } = await requestSupabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', groupId)
		.eq('user_id', userId)
		.in('role', MANAGER_ROLES)
		.limit(1);
	if (error) throw new Error(error.message);
	return Array.isArray(data) && data.length > 0;
}

export async function requireGroupSocialManager(cookies, groupSlug) {
	const auth = await getSocialAuthContext(cookies);
	if (!auth) return { ok: false, status: 401, error: 'Authentication required.' };

	const group = await loadGroupBySlug(auth.requestSupabase, groupSlug);
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const claimed = await isGroupClaimed(auth.requestSupabase, group.id);
	if (!claimed) {
		return {
			ok: false,
			status: 403,
			error: 'This group must be claimed before social media tools can be used.',
			group,
			claimed
		};
	}

	const canManage = await canManageGroupSocial(auth.requestSupabase, auth.userId, group.id);
	if (!canManage) {
		return {
			ok: false,
			status: 403,
			error: 'You do not have permission to manage this group social dashboard.',
			group,
			claimed
		};
	}

	return {
		ok: true,
		...auth,
		group,
		claimed,
		managerRoles: MANAGER_ROLES
	};
}
