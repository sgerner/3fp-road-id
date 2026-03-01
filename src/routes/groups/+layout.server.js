import { resolveSession } from '$lib/server/session';
import { loadOwnedGroups } from '$lib/server/sectionNavigation';

export const load = async ({ fetch, cookies, parent }) => {
	const parentData = await parent().catch(() => ({}));
	const currentUser = parentData?.user ?? resolveSession(cookies).user ?? null;
	const userId = currentUser?.id ?? null;

	const ownedGroups = await loadOwnedGroups(fetch, userId);

	return {
		groupsNavUser: currentUser,
		groupsNavOwnedGroups: ownedGroups
	};
};
