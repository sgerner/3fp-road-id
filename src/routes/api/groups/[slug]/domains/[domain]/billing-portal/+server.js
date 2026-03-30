import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { createDomainBillingPortalSession } from '$lib/server/groupSiteDomains';

export async function POST({ cookies, params, url }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const domainName = String(params.domain || '')
		.trim()
		.toLowerCase();
	try {
		const { data: domainRow } = await auth.serviceSupabase
			.from('group_site_domains')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('domain', domainName)
			.maybeSingle();
		if (!domainRow) return json({ error: 'Domain not found.' }, { status: 404 });

		const billingPortalUrl = await createDomainBillingPortalSession({
			serviceSupabase: auth.serviceSupabase,
			domainRow,
			groupSlug: auth.group.slug,
			url
		});
		return json({ data: { billingPortalUrl } });
	} catch (error) {
		return json(
			{ error: error?.message || 'Unable to create billing portal session.' },
			{ status: 400 }
		);
	}
}
