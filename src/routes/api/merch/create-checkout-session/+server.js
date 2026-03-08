import { json } from '@sveltejs/kit';
import { createMerchCheckoutSession } from '$lib/server/merch';
import { resolveSession } from '$lib/server/session';

export const POST = async ({ request, url, cookies }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	const { user } = resolveSession(cookies);
	const customerUserId = user?.id || null;

	try {
		const result = await createMerchCheckoutSession({
			requestUrl: url,
			storeSlug: payload?.storeSlug || 'main',
			items: payload?.items ?? [],
			manualFulfillmentMethodId: payload?.manualFulfillmentMethodId || null,
			printfulShippingOptionId: payload?.printfulShippingOptionId || null,
			donationAmount: payload?.donationAmount || 0,
			customer: {
				email: payload?.customer?.email || '',
				name: payload?.customer?.name || '',
				phone: payload?.customer?.phone || ''
			},
			shippingAddress: payload?.shippingAddress || {},
			notes: payload?.notes || '',
			customerUserId
		});
		if (!result?.ok) {
			return json({ error: result?.error || 'Unable to create checkout session.' }, { status: result?.status || 400 });
		}
		return json({ ok: true, url: result.checkoutUrl, orderNumber: result.orderNumber });
	} catch (error) {
		console.error('Merch checkout session error', error);
		return json({ error: error?.message || 'Unable to create checkout session.' }, { status: 500 });
	}
};
