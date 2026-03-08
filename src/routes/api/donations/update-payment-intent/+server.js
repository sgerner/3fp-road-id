import { json } from '@sveltejs/kit';
import { updateDonationPaymentIntent } from '$lib/server/donations';

export const POST = async ({ request }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	try {
		const result = await updateDonationPaymentIntent({
			paymentIntentId: payload?.paymentIntentId,
			amount: payload?.amount,
			donorName: payload?.donorName,
			donorEmail: payload?.donorEmail,
			donorMessage: payload?.donorMessage,
			requestAnonymity: payload?.requestAnonymity === true
		});

		if (!result?.ok) {
			return json(
				{ error: result?.error || 'Failed to update payment intent.' },
				{ status: result?.status || 400 }
			);
		}

		return json({ ok: true, amountCents: result.amountCents });
	} catch (error) {
		console.error('Donation payment intent update error', error);
		return json({ error: error?.message || 'Failed to update payment intent.' }, { status: 500 });
	}
};
