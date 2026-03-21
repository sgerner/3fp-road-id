import { json } from '@sveltejs/kit';
import { calculateMerchQuote, getMerchStoreBySlug } from '$lib/server/merch';

export const POST = async ({ request }) => {
	let payload = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
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
		return json({ error: error?.message || 'Unable to generate quote.' }, { status: 500 });
	}
};
