import { supabase } from '$lib/supabaseClient';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';

export const load = async ({ cookies, url }) => {
	const { accessToken, user: currentUser } = await resolveVerifiedSession(cookies);
	const userId = currentUser?.id ?? null;

	const supabaseReq = createRequestSupabaseClient(accessToken);

	const [
		{ data: groups, error: groupsError },
		{ data: eventTypes, error: eventTypesError },
		ownerQuery,
		profileQuery
	] = await Promise.all([
		supabaseReq.from('groups').select('id, name').order('name'),
		supabase
			.from('volunteer_event_types')
			.select('slug, event_type, description')
			.order('event_type'),
		userId
			? supabaseReq
					.from('group_members')
					.select('group_id')
					.eq('user_id', userId)
					.eq('role', 'owner')
			: Promise.resolve({ data: [], error: null }),
		userId
			? supabaseReq.from('profiles').select('admin').eq('user_id', userId).maybeSingle()
			: Promise.resolve({ data: null, error: null })
	]);

	const isAdmin = profileQuery?.data?.admin === true;
	const ownerGroupIds = isAdmin
		? (groups ?? []).map((g) => g.id)
		: Array.isArray(ownerQuery?.data)
			? ownerQuery.data.map((row) => row.group_id).filter(Boolean)
			: [];

	return {
		hostGroups: groupsError ? [] : (groups ?? []),
		eventTypes: eventTypesError ? [] : (eventTypes ?? []),
		ownerGroupIds,
		currentUser,
		isAdmin,
		returnTo: url.pathname + url.search
	};
};
