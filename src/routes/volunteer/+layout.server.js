import { resolveSession } from '$lib/server/session';

export const load = async ({ fetch, cookies, parent }) => {
	const parentData = await parent().catch(() => ({}));
	const currentUser = parentData?.user ?? resolveSession(cookies).user ?? null;

	return {
		volunteerNavUser: currentUser
	};
};
