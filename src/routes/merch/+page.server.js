import { getPublicMerchCatalog } from '$lib/server/merch';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';

export const load = async ({ cookies }) => {
	let catalog = null;
	let loadError = '';
	try {
		catalog = await getPublicMerchCatalog('main');
	} catch (error) {
		loadError = error?.message || 'Failed to load merch store.';
	}

	const { accessToken, user } = resolveSession(cookies);
	let isAdmin = false;
	if (accessToken && user?.id) {
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
	}

	return {
		loadError,
		isAdmin,
		store: catalog?.store ?? null,
		taxSettings: catalog?.taxSettings ?? null,
		fulfillmentMethods: catalog?.fulfillmentMethods ?? [],
		products: catalog?.products ?? [],
		canCheckout: catalog?.canCheckout === true
	};
};
