import { redirect } from '@sveltejs/kit';
import { fetchList, loadOwnedGroups } from '$lib/server/sectionNavigation';
import { resolveSession } from '$lib/server/session';

export const load = async ({ fetch, cookies, parent, url }) => {
	const parentData = await parent().catch(() => ({}));
	const currentUser =
		parentData?.groupsNavUser ?? parentData?.user ?? resolveSession(cookies).user ?? null;
	const userId = currentUser?.id ?? null;

	if (!userId) {
		throw redirect(303, `/groups?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
	}

	// Load owned groups with full details (including images)
	const ownedGroupsFromParent = Array.isArray(parentData?.groupsNavOwnedGroups)
		? parentData.groupsNavOwnedGroups
		: null;
	const basicGroups = ownedGroupsFromParent ?? (await loadOwnedGroups(fetch, userId));
	
	// Fetch full group details including cover photos and logos
	let ownedGroups = basicGroups;
	if (basicGroups.length > 0) {
		const groupIds = basicGroups.map(g => g.id).filter(Boolean);
		if (groupIds.length > 0) {
			const fullGroups = await fetchList(fetch, 'groups', {
				select: 'id,slug,name,tagline,city,state_region,country,logo_url,cover_photo_url',
				id: `in.(${groupIds.join(',')})`,
				order: 'name.asc'
			}).catch(() => []);
			ownedGroups = fullGroups;
		}
	}

	return {
		currentUser,
		ownedGroups
	};
};
