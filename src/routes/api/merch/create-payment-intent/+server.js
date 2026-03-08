import { json } from '@sveltejs/kit';
import { createMerchPaymentIntent } from '$lib/server/merch';
import { resolveSession } from '$lib/server/session';
import { getStripePublishableKey } from '$lib/server/stripe';

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
		const result = await createMerchPaymentIntent({
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
			return json(
				{ error: result?.error || 'Unable to create payment intent.' },
				{ status: result?.status || 400 }
			);
		}

		return json({
			ok: true,
			clientSecret: result.clientSecret,
			paymentIntentId: result.paymentIntentId,
			connectedAccountId: result.connectedAccountId,
			returnUrl: result.returnUrl,
			orderNumber: result.orderNumber,
			publishableKey: getStripePublishableKey()
		});
	} catch (error) {
		console.error('Merch payment intent error', error);
		return json({ error: error?.message || 'Unable to create payment intent.' }, { status: 500 });
	}
};
