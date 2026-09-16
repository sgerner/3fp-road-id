import { resolveVerifiedSession } from '$lib/server/session';
import { loadOwnedGroups } from '$lib/server/sectionNavigation';

export const load = async ({ fetch, cookies, parent }) => {
	const parentData = await parent().catch(() => ({}));
	const { user: verifiedUser } = await resolveVerifiedSession(cookies);
	const currentUser = parentData?.user ?? verifiedUser ?? null;
	const userId = currentUser?.id ?? null;

	const ownedGroups = await loadOwnedGroups(fetch, userId);

	return {
		groupsNavUser: currentUser,
		groupsNavOwnedGroups: ownedGroups
	};
};
