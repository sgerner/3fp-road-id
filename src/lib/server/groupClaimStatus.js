/**
 * Resolve a group's claimed state without exposing its owner memberships.
 *
 * The service client is used only on the server and callers should pass the
 * resulting boolean to the page, never the owner rows themselves. Returning
 * null for an unavailable client lets authenticated fallback checks continue
 * to use their existing RLS-scoped rows.
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
