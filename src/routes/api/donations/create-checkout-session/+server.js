import { json } from '@sveltejs/kit';
import { createDonationCheckout } from '$lib/server/donations';

export const POST = async ({ request, url }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	try {
		const result = await createDonationCheckout({
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
				{ error: result?.error || 'Failed to create checkout session.' },
				{ status: result?.status || 400 }
			);
		}

		return json({ ok: true, url: result.checkoutUrl });
	} catch (error) {
		console.error('Donation checkout session error', error);
		return json({ error: error?.message || 'Failed to create checkout session.' }, { status: 500 });
	}
};
