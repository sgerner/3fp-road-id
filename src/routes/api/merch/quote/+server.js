import { json } from '@sveltejs/kit';
import { calculateMerchQuote, getMerchStoreBySlug } from '#lib/server/merch';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';

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
			const status = result?.status === 502 ? 503 : result?.status || 400;
			return json(
				{
					ok: false,
					code: result?.code || (status === 503 ? 'service_unavailable' : 'quote_error'),
					retryable: result?.retryable ?? status === 503,
					error: result?.error || 'Unable to generate quote.'
				},
				{ status }
			);
		}
		return json({ ok: true, quote: result.quote });
	} catch (error) {
		console.error('Merch quote error', error);
		return json(
			{
				ok: false,
				code: 'service_unavailable',
				retryable: true,
				error: 'Live shipping rates are temporarily unavailable. Please retry in a moment.'
			},
			{ status: 503 }
		);
	}
};
