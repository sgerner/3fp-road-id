import { getActivityClient } from '$lib/server/activities';
import { loadSmsThreadsForUser } from '$lib/server/sms';

export async function load({ cookies }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) return { currentUser: null, threads: [] };

	try {
		const threads = await loadSmsThreadsForUser(supabase, user.id);
		return { currentUser: user, threads };
	} catch (error) {
		console.error('Unable to load SMS inbox', error);
		return {
			currentUser: user,
			threads: [],
			loadError: 'SMS messages are temporarily unavailable.'
		};
	}
}
