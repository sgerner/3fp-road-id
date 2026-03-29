import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { createDomainCheckoutForGroup } from '$lib/server/groupSiteDomains';

export async function POST({ cookies, params, request, url }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	try {
		const result = await createDomainCheckoutForGroup({
			serviceSupabase: auth.serviceSupabase,
			group: auth.group,
			userId: auth.userId,
			payload,
			url
		});
		return json({ data: result });
	} catch (error) {
		return json({ error: error?.message || 'Unable to create domain checkout.' }, { status: 400 });
	}
}
