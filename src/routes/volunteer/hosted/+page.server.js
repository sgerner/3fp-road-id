import { redirect } from '@sveltejs/kit';
import {
	fetchList,
	loadManagedVolunteerEvents,
	loadOwnedGroups
} from '$lib/server/sectionNavigation';
import { resolveSession } from '$lib/server/session';

export const load = async ({ fetch, cookies, parent, url }) => {
	const parentData = await parent().catch(() => ({}));
	const currentUser = parentData?.user ?? resolveSession(cookies).user ?? null;
	const userId = currentUser?.id ?? null;

	if (!userId) {
		throw redirect(303, `/volunteer?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
	}

	const ownedGroups = await loadOwnedGroups(fetch, userId);
	const ownerGroupIds = ownedGroups
		.map((group) => group?.id)
		.filter((value) => value !== null && value !== undefined);
	const managedEvents = await loadManagedVolunteerEvents(fetch, userId, {
		ownerGroupIds,
		limit: 100
	});

	const hostGroupIds = Array.from(
		new Set(
			managedEvents
				.map((event) => event?.host_group_id)
				.filter((value) => value !== null && value !== undefined)
		)
	);
	const hostGroups = hostGroupIds.length
		? await fetchList(fetch, 'groups', {
				select: 'id,slug,name',
				id: `in.(${hostGroupIds.join(',')})`
			}).catch((err) => {
				console.warn('Failed to load host groups for hosted events page', err);
				return [];
			})
		: [];
	const hostGroupMap = new Map(
		hostGroups.map((group) => [
			String(group?.id),
			{
				id: group?.id ?? null,
				slug: group?.slug ?? null,
				name: group?.name ?? 'Untitled group'
			}
		])
	);

	return {
		currentUser,
		hostedEvents: managedEvents.map((event) => ({
			...event,
			hostGroup: event?.host_group_id
				? (hostGroupMap.get(String(event.host_group_id)) ?? null)
				: null
		}))
	};
};
