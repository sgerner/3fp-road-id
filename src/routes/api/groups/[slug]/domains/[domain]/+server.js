import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { deleteAttachedDomainForGroup } from '$lib/server/groupSiteDomains';

export async function DELETE({ cookies, params }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	try {
		const result = await deleteAttachedDomainForGroup({
			serviceSupabase: auth.serviceSupabase,
			groupId: auth.group.id,
			domain: params.domain || ''
		});
		return json({ data: result });
	} catch (error) {
		return json({ error: error?.message || 'Unable to remove domain.' }, { status: 400 });
	}
}
