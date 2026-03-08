import { finalizeMerchOrderByPaymentIntentId, finalizeMerchOrderBySessionId } from '$lib/server/merch';

function formatCurrency(cents, currency = 'usd') {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency).toUpperCase() }).format(
		Number(cents || 0) / 100
	);
}

export const load = async ({ url, fetch }) => {
	const sessionId = (url.searchParams.get('session_id') || '').trim();
	const paymentIntentId = (url.searchParams.get('payment_intent') || '').trim();
	if (!sessionId && !paymentIntentId) {
		return { ok: false, error: 'Missing payment confirmation id.' };
	}

	const result = paymentIntentId
		? await finalizeMerchOrderByPaymentIntentId(paymentIntentId, fetch)
		: await finalizeMerchOrderBySessionId(sessionId, fetch);
	if (!result?.ok) {
		return { ok: false, error: result?.error || 'Unable to confirm your order.' };
	}

	return {
		ok: true,
		paid: result.paid === true,
		order: result.order
			? {
					id: result.order.id,
					orderNumber: result.order.order_number,
					total: formatCurrency(result.order.total_cents, result.order.currency),
					status: result.order.status,
					fulfillmentStatus: result.order.fulfillment_status
				}
			: null,
		items: (result.orderItems ?? []).map((item) => ({
			id: item.id,
			productName: item.product_name,
			variantName: item.variant_name,
			quantity: item.quantity,
			lineTotal: formatCurrency(item.line_total_cents, result.order?.currency || 'usd')
		})),
		dispatchJobs: result.dispatchJobs ?? []
	};
};
