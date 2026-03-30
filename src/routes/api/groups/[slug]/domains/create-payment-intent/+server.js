import { json } from '@sveltejs/kit';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { createDomainPaymentIntentForGroup } from '$lib/server/groupSiteDomains';
import { getStripePublishableKey } from '$lib/server/stripe';

export async function POST({ cookies, params, request, url }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug || '' });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	try {
		const result = await createDomainPaymentIntentForGroup({
			serviceSupabase: auth.serviceSupabase,
			group: auth.group,
			userId: auth.userId,
			payload,
			url
		});
		if (!result?.ok) {
			return json(
				{ error: result?.error || 'Unable to create domain payment intent.' },
				{ status: result?.status || 400 }
			);
		}
		return json({
			ok: true,
			clientSecret: result.clientSecret,
			paymentIntentId: result.paymentIntentId,
			connectedAccountId: result.connectedAccountId,
			returnUrl: result.returnUrl,
			publishableKey: getStripePublishableKey()
		});
	} catch (error) {
		return json(
			{ error: error?.message || 'Unable to create domain payment intent.' },
			{ status: 500 }
		);
	}
}
