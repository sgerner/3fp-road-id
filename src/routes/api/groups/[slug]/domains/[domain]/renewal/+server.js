import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { setDomainAutoRenewForGroup } from '$lib/server/groupSiteDomains';

export async function PATCH({ cookies, params, request }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	try {
		const domain = await setDomainAutoRenewForGroup({
			serviceSupabase: auth.serviceSupabase,
			groupId: auth.group.id,
			domain: params.domain || '',
			autoRenew: payload?.autoRenew === true
		});
		return json({ data: { domain } });
	} catch (error) {
		return json({ error: error?.message || 'Unable to update auto-renew.' }, { status: 400 });
	}
}
