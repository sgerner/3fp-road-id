import { ANONYMITY_NOTICE, GROUP_TAX_NOTICE } from '$lib/donations/constants';
import { getDonationRecipient } from '$lib/server/donations';

export const load = async ({ params, url }) => {
	const groupSlug = String(params.slug || '').trim();

	let recipient = null;
	let loadError = '';
	try {
		recipient = await getDonationRecipient({ recipientType: 'group', groupSlug });
	} catch (error) {
		loadError = error?.message || 'Unable to load donation recipient.';
	}

	if (!recipient && !loadError) {
		loadError = 'Unable to load donation recipient.';
	}

	const donationAccount = recipient?.donationAccount || null;
	const donationEnabled = Boolean(
		donationAccount?.stripe_account_id && donationAccount?.charges_enabled === true
	);
	const claimed = Boolean(recipient?.claimed);

	return {
		loadError,
		groupSlug,
		recipient: recipient
			? {
					type: recipient.type,
					label: recipient.label,
					group: recipient.group
						? {
								id: recipient.group.id,
								slug: recipient.group.slug,
								name: recipient.group.name
							}
						: null,
					donationEnabled,
					claimed,
					accountConnected: Boolean(donationAccount?.stripe_account_id),
					accountReady: donationAccount?.charges_enabled === true,
					accountEmail: donationAccount?.stripe_account_email || '',
					connectedAt: donationAccount?.connected_at || null
				}
			: null,
		taxNotice: GROUP_TAX_NOTICE,
		anonymityNotice: ANONYMITY_NOTICE,
		canceled: url.searchParams.get('canceled') === '1',
		stripeStatus: url.searchParams.get('stripe') || '',
		stripeReason: url.searchParams.get('reason') || '',
		showManageMain: false,
		isAdmin: false
	};
};
