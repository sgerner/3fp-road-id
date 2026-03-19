import { getActivityClient, loadRideLookups } from '$lib/server/activities';

async function loadHostGroups(supabase) {
	const { data: groups, error: groupsError } = await supabase
		.from('groups')
		.select('id,name,slug,city,state_region,country')
		.order('name', { ascending: true });
	if (groupsError) throw groupsError;
	return groups ?? [];
}

export const load = async ({ cookies }) => {
	const { supabase, user } = getActivityClient(cookies);
	const [lookups, hostGroups, profileResult] = await Promise.all([
		loadRideLookups(supabase),
		loadHostGroups(supabase),
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
		hostGroups,
		...lookups
	};
};
