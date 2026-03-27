import { ANONYMITY_NOTICE, GROUP_TAX_NOTICE, MAIN_ORG_TAX_NOTICE } from '$lib/donations/constants';
import { getDonationRecipient } from '$lib/server/donations';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';

function cleanSlug(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function resolveGroupSlug(searchParams) {
	const explicit =
		cleanSlug(searchParams.get('group')) ||
		cleanSlug(searchParams.get('groupSlug')) ||
		cleanSlug(searchParams.get('g'));
	if (explicit) return explicit;

	const emptyKeyValue = cleanSlug(searchParams.get(''));
	if (emptyKeyValue) return emptyKeyValue;

	for (const [key, value] of searchParams.entries()) {
		if (!value) {
			const candidate = cleanSlug(key);
			if (candidate) return candidate;
		}
	}

	return '';
}

export const load = async ({ url, cookies }) => {
	const groupSlug = resolveGroupSlug(url.searchParams);
	const recipientType = groupSlug ? 'group' : 'main';

	let isAdmin = false;
	const { accessToken, user } = resolveSession(cookies);
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

	let recipient = null;
	let loadError = '';
	try {
		recipient = await getDonationRecipient({ recipientType, groupSlug });
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
	const claimed = recipient?.type === 'group' ? Boolean(recipient?.claimed) : true;

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
		taxNotice: recipient?.type === 'group' ? GROUP_TAX_NOTICE : MAIN_ORG_TAX_NOTICE,
		anonymityNotice: ANONYMITY_NOTICE,
		canceled: url.searchParams.get('canceled') === '1',
		stripeStatus: url.searchParams.get('stripe') || '',
		stripeReason: url.searchParams.get('reason') || '',
		showManageMain: recipientType === 'main' && isAdmin,
		isAdmin
	};
};
