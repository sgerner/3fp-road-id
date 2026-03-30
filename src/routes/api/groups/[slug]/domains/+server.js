import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import {
	attachExistingDomainToGroup,
	listGroupSiteDomainOrders,
	listGroupSiteDomains
} from '$lib/server/groupSiteDomains';

export async function GET({ cookies, params }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	try {
		const [domains, orders] = await Promise.all([
			listGroupSiteDomains(auth.serviceSupabase, auth.group.id),
			listGroupSiteDomainOrders(auth.serviceSupabase, auth.group.id, 20)
		]);
		return json({
			data: {
				domains,
				orders
			}
		});
	} catch (error) {
		return json({ error: error?.message || 'Unable to load group domains.' }, { status: 500 });
	}
}

export async function POST({ cookies, params, request }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	try {
		const result = await attachExistingDomainToGroup({
			serviceSupabase: auth.serviceSupabase,
			group: auth.group,
			userId: auth.userId,
			domain: payload?.domain
		});
		return json({ data: result });
	} catch (error) {
		return json({ error: error?.message || 'Unable to attach domain.' }, { status: 400 });
	}
}
