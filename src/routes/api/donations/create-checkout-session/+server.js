import { json } from '@sveltejs/kit';
import { createDonationCheckout } from '$lib/server/donations';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

export const POST = async (event) => {
	const limited = enforceRateLimit(event, {
		name: 'donation-checkout-create',
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
		const result = await createDonationCheckout({
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
				{ error: result?.error || 'Failed to create checkout session.' },
				{ status: result?.status || 400 }
			);
		}

		return json({ ok: true, url: result.checkoutUrl });
	} catch (error) {
		console.error('Donation checkout session error', error);
		return json({ error: 'Failed to create checkout session.' }, { status: 500 });
	}
};
