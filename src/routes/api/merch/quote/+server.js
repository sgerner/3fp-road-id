import { json } from '@sveltejs/kit';
import { calculateMerchQuote, getMerchStoreBySlug } from '$lib/server/merch';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';

export const POST = async (event) => {
	const limited = enforceRateLimit(event, {
		name: 'merch-quote',
		limit: 120,
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
		const storeSlug = payload?.storeSlug || 'main';
		const store = await getMerchStoreBySlug(storeSlug);
		const donationCents = Math.max(0, Math.round(Number(payload?.donationAmount || 0) * 100));
		const result = await calculateMerchQuote({
			storeId: store.id,
			items: payload?.items ?? [],
			manualFulfillmentMethodId: payload?.manualFulfillmentMethodId || null,
			printfulShippingOptionId: payload?.printfulShippingOptionId || null,
			shippingAddress: payload?.shippingAddress || {},
			donationCents
		});
		if (!result?.ok) {
			return json(
				{ error: result?.error || 'Unable to generate quote.' },
				{ status: result?.status || 400 }
			);
		}
		return json({ ok: true, quote: result.quote });
	} catch (error) {
		console.error('Merch quote error', error);
		return json({ error: 'Unable to generate quote.' }, { status: 500 });
	}
};
