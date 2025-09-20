import { supabase } from '$lib/supabaseClient';

async function resolveUserFromCookies(cookies) {
	const sessionCookie = cookies.get('sb_session');
	if (!sessionCookie) return null;
	try {
		const parsed = JSON.parse(sessionCookie);
		const access_token = parsed?.access_token;
		if (!access_token) return null;
		const { data: userRes } = await supabase.auth.getUser(access_token);
		return userRes?.user ?? null;
	} catch {
		return null;
	}
}

export const load = async ({ cookies, url }) => {
	const currentUser = await resolveUserFromCookies(cookies);
	const userId = currentUser?.id ?? null;

	const [
		{ data: groups, error: groupsError },
		{ data: eventTypes, error: eventTypesError },
		ownerQuery
	] = await Promise.all([
		supabase.from('groups').select('id, name').order('name'),
		supabase
			.from('volunteer_event_types')
			.select('slug, event_type, description')
			.order('event_type'),
		userId
			? supabase.from('group_members').select('group_id').eq('user_id', userId).eq('role', 'owner')
			: Promise.resolve({ data: [], error: null })
	]);

	const ownerGroupIds = Array.isArray(ownerQuery?.data)
		? ownerQuery.data.map((row) => row.group_id).filter(Boolean)
		: [];

	return {
		hostGroups: groupsError ? [] : (groups ?? []),
		eventTypes: eventTypesError ? [] : (eventTypes ?? []),
		ownerGroupIds,
		currentUser,
		returnTo: url.pathname + url.search
	};
};
