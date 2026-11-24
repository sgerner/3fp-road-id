import { supabase } from '#lib/supabaseClient';
import { loadHostGroupDirectory } from '#lib/server/hostGroupDirectory';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';

export const load = async ({ cookies }) => {
	const { accessToken, user: currentUser } = await resolveVerifiedSession(cookies);
	const userId = currentUser?.id ?? null;

	const supabaseReq = createRequestSupabaseClient(accessToken);

	const [directory, { data: eventTypes, error: eventTypesError }] = await Promise.all([
		loadHostGroupDirectory({
			supabase: supabaseReq,
			userId,
			allowSiteAdmin: true
		}),
		supabase
			.from('volunteer_event_types')
			.select('slug, event_type, description')
			.order('event_type')
	]);

	return {
		hostGroups: directory.hostGroups,
		eventTypes: eventTypesError ? [] : (eventTypes ?? []),
		ownerGroupIds: directory.managedGroupIds,
		currentUser,
		isAdmin: directory.isAdmin
	};
};
