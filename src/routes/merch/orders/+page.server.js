import { listMerchOrdersForUser } from '$lib/server/merch';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';

function formatCurrency(cents, currency = 'usd') {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: String(currency).toUpperCase()
	}).format(Number(cents || 0) / 100);
}

export const load = async ({ cookies }) => {
	const { accessToken, user } = resolveSession(cookies);
	if (!user?.id || !accessToken) {
		return { authRequired: true, isAdmin: false, orders: [] };
	}

	let isAdmin = false;
	try {
		const supabase = createRequestSupabaseClient(accessToken);
		const { data: profile } = await supabase
			.from('profiles')
			.select('admin')
			.eq('user_id', user.id)
			.maybeSingle();
		isAdmin = profile?.admin === true;
	} catch {
		isAdmin = false;
	}

	try {
		const result = await listMerchOrdersForUser({
			userId: user.id,
			userEmail: user.email || '',
			isAdmin,
			storeSlug: 'main'
		});
		const orders = (result.orders ?? []).map((order) => ({
			id: order.id,
			orderNumber: order.order_number,
			status: order.status,
			paymentStatus: order.payment_status,
			fulfillmentStatus: order.fulfillment_status,
			total: formatCurrency(order.total_cents, order.currency),
			createdAt: order.created_at,
			items: (result.orderItemsByOrderId.get(order.id) ?? []).map((item) => ({
				id: item.id,
				productName: item.product_name,
				variantName: item.variant_name,
				quantity: item.quantity
			}))
		}));

		return {
			authRequired: false,
			isAdmin,
			orders
		};
	} catch (error) {
		return {
			authRequired: false,
			isAdmin,
			error: error?.message || 'Failed to load order history.',
			orders: []
		};
	}
};
