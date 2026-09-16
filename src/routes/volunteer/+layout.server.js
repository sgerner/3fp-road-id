import { resolveVerifiedSession } from '$lib/server/session';

export const load = async ({ fetch, cookies, parent }) => {
	const parentData = await parent().catch(() => ({}));
	const { user: verifiedUser } = await resolveVerifiedSession(cookies);
	const currentUser = parentData?.user ?? verifiedUser ?? null;

	return {
		volunteerNavUser: currentUser
	};
};
