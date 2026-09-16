import { json } from '@sveltejs/kit';
import { createDonationPaymentIntent } from '$lib/server/donations';
import { getStripePublishableKey } from '$lib/server/stripe';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

export const POST = async (event) => {
	const limited = enforceRateLimit(event, {
		name: 'donation-payment-create',
		limit: 12,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;
	const parsedBody = await readJsonBody(event.request, { maxBytes: 16 * 1024 });
	if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
	const payload = parsedBody.value;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	try {
		const result = await createDonationPaymentIntent({
			requestUrl: event.url,
			recipientType: payload?.recipient,
			groupSlug: payload?.group,
			amount: payload?.amount,
			donorName: payload?.donorName,
			donorEmail: payload?.donorEmail,
			donorMessage: payload?.donorMessage,
			requestAnonymity: payload?.requestAnonymity === true
		});

		if (!result?.ok) {
			return json(
				{ error: result?.error || 'Failed to create payment intent.' },
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
		console.error('Donation payment intent error', error);
		return json({ error: 'Failed to create payment intent.' }, { status: 500 });
	}
};
