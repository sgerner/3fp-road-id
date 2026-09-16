import { json } from '@sveltejs/kit';
import { updateMerchPaymentIntent } from '$lib/server/merch';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

export const POST = async (event) => {
	const limited = enforceRateLimit(event, {
		name: 'merch-payment-update',
		limit: 30,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;
	const parsedBody = await readJsonBody(event.request, { maxBytes: 64 * 1024 });
	if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
	const payload = parsedBody.value;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	try {
		const result = await updateMerchPaymentIntent({
			paymentIntentId: payload?.paymentIntentId,
			clientSecret: payload?.clientSecret,
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
		return json({ error: 'Unable to update payment intent.' }, { status: 500 });
	}
};
