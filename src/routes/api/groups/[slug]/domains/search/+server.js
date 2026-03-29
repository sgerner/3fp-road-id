import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { searchDomainsForGroup } from '$lib/server/groupSiteDomains';

export async function POST({ cookies, params, request }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	try {
		const results = await searchDomainsForGroup({
			query: payload?.query || '',
			group: auth.group
		});
		return json({ data: { results } });
	} catch (error) {
		return json({ error: error?.message || 'Unable to search domains.' }, { status: 400 });
	}
}
