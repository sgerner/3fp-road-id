import { getPublicMerchCatalog } from '$lib/server/merch';
import { resolveSession } from '$lib/server/session';

export const load = async ({ cookies, url }) => {
	let catalog = null;
	let loadError = '';
	try {
		catalog = await getPublicMerchCatalog('main');
	} catch (error) {
		loadError = error?.message || 'Failed to load checkout settings.';
	}

	const { user } = resolveSession(cookies);
	return {
		loadError,
		canceled: url.searchParams.get('canceled') === '1',
		store: catalog?.store ?? null,
		taxSettings: catalog?.taxSettings ?? { mode: 'none', flat_rate_bps: 0, notes: '' },
		fulfillmentMethods: catalog?.fulfillmentMethods ?? [],
		canCheckout: catalog?.canCheckout === true,
		user: user
			? {
					id: user.id,
					email: user.email || ''
				}
			: null
	};
};
