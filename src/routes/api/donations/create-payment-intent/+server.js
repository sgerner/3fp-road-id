import { json } from '@sveltejs/kit';
import { createDonationPaymentIntent } from '$lib/server/donations';
import { getStripePublishableKey } from '$lib/server/stripe';

export const POST = async ({ request, url }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	try {
		const result = await createDonationPaymentIntent({
			requestUrl: url,
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
		return json({ error: error?.message || 'Failed to create payment intent.' }, { status: 500 });
	}
};
