import { supabase } from '$lib/supabaseClient';

export const load = async () => {
	const [
		{ data: groups, error: groupsError },
		{ data: eventTypes, error: eventTypesError }
	] = await Promise.all([
		supabase.from('groups').select('id, name').order('name'),
		supabase
			.from('volunteer_event_types')
			.select('slug, event_type, description')
			.order('event_type')
	]);

	return {
		hostGroups: groupsError ? [] : groups ?? [],
		eventTypes: eventTypesError ? [] : eventTypes ?? []
	};
};
