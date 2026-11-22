import { getActivityClient } from '#lib/server/activities';
import { getSmsServiceClient, hasSmsInboxAccess, loadSmsThreadsForUser } from '#lib/server/sms';

export async function load({ cookies }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) return { currentUser: null, canManageSms: false, threads: [] };

	let canManageSms = false;
	try {
		const managementClient = getSmsServiceClient();
		if (!managementClient) throw new Error('SMS management service is unavailable.');
		canManageSms = await hasSmsInboxAccess(managementClient, user.id);
		if (!canManageSms) {
			return { currentUser: user, canManageSms: false, threads: [] };
		}
		const threads = await loadSmsThreadsForUser(supabase, user.id, {
			managementOnly: true,
			managementClient
		});
		return { currentUser: user, canManageSms: true, threads };
	} catch (error) {
		console.error('Unable to load SMS inbox', error);
		return {
			currentUser: user,
			canManageSms,
			threads: [],
			loadError: 'SMS messages are temporarily unavailable.'
		};
	}
}
