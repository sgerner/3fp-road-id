import {
	fetchAllGroupDirectoryRows,
	fetchUserManagedGroupIds,
	loadHostGroupDirectoryCore
} from '#lib/server/hostGroupDirectoryCore.js';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient.js';

export { fetchAllGroupDirectoryRows, fetchUserManagedGroupIds };

/**
 * @param {Parameters<typeof loadHostGroupDirectoryCore>[0]} [options]
 */
export function loadHostGroupDirectory(options = {}) {
	const { serviceSupabase = createServiceSupabaseClient(), ...rest } = options;
	return loadHostGroupDirectoryCore({
		...rest,
		serviceSupabase
	});
}
