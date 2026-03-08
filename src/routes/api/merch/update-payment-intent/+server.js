import { json } from '@sveltejs/kit';
import { updateMerchPaymentIntent } from '$lib/server/merch';

export const POST = async ({ request }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	try {
		const result = await updateMerchPaymentIntent({
			paymentIntentId: payload?.paymentIntentId,
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
			notes: payload?.notes || ''
		});

		if (!result?.ok) {
			return json(
				{ error: result?.error || 'Unable to update payment intent.' },
				{ status: result?.status || 400 }
			);
		}

		return json({ ok: true, amountCents: result.amountCents });
	} catch (error) {
		console.error('Merch payment intent update error', error);
		return json({ error: error?.message || 'Unable to update payment intent.' }, { status: 500 });
	}
};
