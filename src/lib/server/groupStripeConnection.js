export async function loadGroupStripeConnection(auth) {
	const { data: donationAccount, error } = await auth.serviceSupabase
		.from('donation_accounts')
		.select('stripe_account_id, charges_enabled')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return {
		connected: Boolean(donationAccount?.stripe_account_id),
		charges_enabled: Boolean(donationAccount?.charges_enabled),
		stripe_account_id: donationAccount?.stripe_account_id || null
	};
}
