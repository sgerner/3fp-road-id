import { json } from '@sveltejs/kit';
import { createMerchPaymentIntent } from '#lib/server/merch';
import { resolveVerifiedSession } from '#lib/server/session';
import { getStripePublishableKey } from '#lib/server/stripe';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';

export const POST = async (event) => {
	const { request, url, cookies } = event;
	const limited = enforceRateLimit(event, {
		name: 'merch-payment-create',
		limit: 12,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;
	const parsedBody = await readJsonBody(request, { maxBytes: 64 * 1024 });
	if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
	const payload = parsedBody.value;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	const { user } = await resolveVerifiedSession(cookies);
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
			const status = result?.status === 502 ? 503 : result?.status || 400;
			return json(
				{
					ok: false,
					code: result?.code || (status === 503 ? 'service_unavailable' : 'payment_intent_error'),
					retryable: result?.retryable ?? status === 503,
					error: result?.error || 'Unable to create payment intent.'
				},
				{ status }
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
		return json(
			{
				ok: false,
				code: 'service_unavailable',
				retryable: true,
				error: 'Unable to create payment intent.'
			},
			{ status: 503 }
		);
	}
};
