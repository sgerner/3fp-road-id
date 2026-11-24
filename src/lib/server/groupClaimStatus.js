/**
 * Resolve a group's claimed state without exposing its owner memberships.
 *
 * The service client is used only on the server and callers should pass the
 * resulting boolean to the page, never the owner rows themselves. Returning
 * null for an unavailable client lets authenticated fallback checks continue
 * to use their existing RLS-scoped rows.
 * @param {any} serviceSupabase
 * @param {string | null | undefined} groupId
 */
export async function getGroupClaimStatus(serviceSupabase, groupId) {
	if (!serviceSupabase || !groupId) return null;

	const { count, error } = await serviceSupabase
		.from('group_members')
		.select('user_id', { count: 'exact', head: true })
		.eq('group_id', groupId)
		.eq('role', 'owner');

	if (error) throw new Error(error.message);
	return (count ?? 0) > 0;
}

/**
 * Build a server-only Set of group IDs that currently have at least one owner.
 *
 * Queries only `group_id` (never `user_id`) and paginates across 500-row
 * PostgREST boundaries so large directories never truncate claim status.
 *
 * @param {any} serviceSupabase
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 */
export async function getClaimedGroupIdSet(
	serviceSupabase,
	{ pageSize = 500, maxPages = 50 } = {}
) {
	if (!serviceSupabase) return null;

	const safePageSize = Math.max(1, Math.min(1000, Number(pageSize) || 500));
	const claimedIds = new Set();

	for (let page = 0; page < maxPages; page += 1) {
		const offset = page * safePageSize;
		const { data, error } = await serviceSupabase
			.from('group_members')
			.select('group_id')
			.eq('role', 'owner')
			.order('group_id', { ascending: true })
			.range(offset, offset + safePageSize - 1);

		if (error) throw new Error(error.message);

		const rows = Array.isArray(data) ? data : [];
		for (const row of rows) {
			if (row?.group_id) {
				claimedIds.add(String(row.group_id));
			}
		}

		if (rows.length < safePageSize) {
			break;
		}
	}

	return claimedIds;
}
