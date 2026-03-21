import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { resolveSession } from '$lib/server/session';

export const load = async ({ params, cookies, fetch }) => {
	const slug = params.slug;

	// Load the group
	let group = null;
	try {
		const res = await fetch(`/api/v1/groups?slug=eq.${encodeURIComponent(slug)}&single=true`);
		const json = await res.json().catch(() => ({}));
		group = json?.data ?? json ?? null;
	} catch {
		group = null;
	}

	if (!group) {
		throw redirect(303, `/groups/${slug}`);
	}

	// Resolve session
	const { user: sessionUser } = resolveSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;

	if (!sessionUserId) {
		throw redirect(303, `/groups/${slug}?auth=required`);
	}

	// Check admin
	let isAdmin = false;
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

	// Check ownership
	let isOwner = false;
	let isSocialManager = false;
	try {
		const { data: memberRows } = await supabase
			.from('group_members')
			.select('role')
			.eq('group_id', group.id)
			.eq('user_id', sessionUserId)
			.in('role', ['owner', 'admin']);

		isOwner = (memberRows ?? []).some((r) => r.role === 'owner');
		isSocialManager = (memberRows ?? []).length > 0;
	} catch {
		isOwner = false;
	}

	const canEdit = isAdmin || isOwner;
	const canManageSocial = (isAdmin || isSocialManager) && group !== null;
	let assetSummary = { buckets: 3, assets: 0 };

	try {
		const assetResult = await supabase
			.from('group_assets')
			.select('id', { count: 'exact', head: true })
			.eq('group_id', group.id);

		assetSummary = {
			buckets: 3,
			assets: assetResult.count ?? 0
		};
	} catch (err) {
		console.warn('Failed to load asset counts for group manage layout', err);
	}

	if (!canEdit) {
		throw redirect(303, `/groups/${slug}?auth=forbidden`);
	}

	return {
		group,
		is_owner: isOwner,
		is_admin: isAdmin,
		can_manage_social: canManageSocial,
		session_user_id: sessionUserId,
		asset_summary: assetSummary
	};
};
