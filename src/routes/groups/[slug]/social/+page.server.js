import { error } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';

function buildQuery(params) {
	const search = new URLSearchParams();
	if (params && typeof params === 'object') {
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item === null || item === undefined) continue;
					search.append(key, String(item));
				}
				continue;
			}
			search.set(key, String(value));
		}
	}
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

async function callApi(fetchImpl, resource, params) {
	const qs = buildQuery(params);
	const response = await fetchImpl(`/api/v1/${resource}${qs}`);
	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	if (!response.ok) {
		const message = payload?.error || payload?.message || `Failed to load ${resource}`;
		const apiError = new Error(message);
		apiError.status = response.status;
		throw apiError;
	}
	return payload ?? {};
}

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

	const { accessToken, user: sessionUser } = resolveSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;
	const supabase = createRequestSupabaseClient(accessToken);

	const ownerRows = await fetchList(fetch, 'group-members', {
		select: 'user_id',
		group_id: `eq.${group.id}`,
		role: 'eq.owner'
	}).catch((err) => {
		console.warn('Failed to load group owners for social manager page', err);
		return [];
	});

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

	const is_claimed = ownerRows.length > 0;
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
