import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { verifyAttachedDomainForGroup } from '$lib/server/groupSiteDomains';

export async function POST({ cookies, params }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	try {
		const domain = await verifyAttachedDomainForGroup({
			serviceSupabase: auth.serviceSupabase,
			domain: params.domain || ''
		});
		return json({ data: { domain } });
	} catch (error) {
		return json({ error: error?.message || 'Unable to verify domain.' }, { status: 400 });
	}
}
