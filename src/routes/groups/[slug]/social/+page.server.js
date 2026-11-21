import { callApi } from '#lib/server/internalApi';
import { error } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { getGroupClaimStatus } from '#lib/server/groupClaimStatus';

async function fetchSingle(fetchImpl, resource, params) {
	const payload = await callApi(fetchImpl, resource, params);
	return payload?.data ?? payload ?? null;
}

async function fetchList(fetchImpl, resource, params) {
	const payload = await callApi(fetchImpl, resource, params);
	const data = payload?.data ?? payload;
	if (Array.isArray(data)) return data;
	if (data === null || data === undefined) return [];
	return [data];
}

export const load = async ({ params, cookies, fetch }) => {
	const slug = params.slug;
	const group = await fetchSingle(fetch, 'groups', {
		slug: `eq.${slug}`,
		single: 'true'
	}).catch((err) => {
		console.warn('Failed to load group for social manager page', err);
		throw error(err?.status || 500, err?.message || 'Failed to load group.');
	});

	if (!group) {
		throw error(404, 'Group not found.');
	}

	const { accessToken, user: sessionUser } = await resolveVerifiedSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;
	const supabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();

	const [ownerRows, serviceClaimStatus] = await Promise.all([
		fetchList(fetch, 'group-members', {
			select: 'user_id',
			group_id: `eq.${group.id}`,
			role: 'eq.owner'
		}).catch((err) => {
			console.warn('Failed to load group owners for social manager page', err);
			return [];
		}),
		getGroupClaimStatus(serviceSupabase, group.id).catch((err) => {
			console.warn('Failed to load public group claim status for social page', err);
			return null;
		})
	]);

	const managerRows = sessionUserId
		? await fetchList(fetch, 'group-members', {
				select: 'user_id,role',
				group_id: `eq.${group.id}`,
				user_id: `eq.${sessionUserId}`,
				role: 'in.(owner,admin)'
			}).catch((err) => {
				console.warn('Failed to load group social managers for social manager page', err);
				return [];
			})
		: [];

	let isAdmin = false;
	if (sessionUserId) {
		try {
			const { data: prof } = await supabase
				.from('profiles')
				.select('admin')
				.eq('user_id', sessionUserId)
				.maybeSingle();
			isAdmin = Boolean(prof?.admin);
		} catch {
			isAdmin = false;
		}
	}

	const is_claimed = serviceClaimStatus ?? ownerRows.length > 0;
	const is_social_manager = managerRows.length > 0 || isAdmin;
	const can_manage_social = Boolean(sessionUserId && (is_social_manager || isAdmin));

	return {
		group,
		is_claimed,
		is_social_manager,
		can_manage_social,
		is_admin: isAdmin,
		session_user_id: sessionUserId
	};
};
