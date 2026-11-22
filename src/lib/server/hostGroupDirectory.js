import {
	fetchAllGroupDirectoryRows,
	fetchUserManagedGroupIds,
	loadHostGroupDirectoryCore
} from '#lib/server/hostGroupDirectoryCore.js';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient.js';

export { fetchAllGroupDirectoryRows, fetchUserManagedGroupIds };

export function loadHostGroupDirectory({
	serviceSupabase = createServiceSupabaseClient(),
	...options
} = {}) {
	return loadHostGroupDirectoryCore({
		...options,
		serviceSupabase
	});
}
