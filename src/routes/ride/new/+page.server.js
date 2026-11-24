import { getActivityClient, loadRideLookups } from '#lib/server/activities';
import { loadHostGroupDirectory } from '#lib/server/hostGroupDirectory';

export const load = async ({ cookies }) => {
	const { supabase, user } = await getActivityClient(cookies);
	const [lookups, directory, profileResult] = await Promise.all([
		loadRideLookups(supabase),
		loadHostGroupDirectory({
			supabase,
			userId: user?.id ?? null,
			allowSiteAdmin: false
		}),
		user?.id
			? supabase
					.from('profiles')
					.select('full_name,email,phone')
					.eq('user_id', user.id)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null })
	]);

	return {
		currentUser: user ?? null,
		currentProfile: profileResult?.data ?? null,
		hostGroups: directory.hostGroups,
		...lookups
	};
};
