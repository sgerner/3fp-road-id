export const MAIN_ORG_DONATION_ACCOUNT_ID = 'main';
export const MAIN_ORG_NAME = '3 Feet Please';
export const MAIN_ORG_LEGAL_NAME = 'CycleSafe Coalition';
export const MAIN_ORG_EIN = '99-3658890';
export const DEFAULT_DONATION_AMOUNT = 25;

export function resolveDonationPrefillAmount(rawAmount) {
	if (rawAmount === null || rawAmount === undefined) {
		return DEFAULT_DONATION_AMOUNT;
	}
	let parsed;
	if (typeof rawAmount === 'number') {
		parsed = rawAmount;
	} else if (typeof rawAmount === 'string') {
		const trimmed = rawAmount.trim();
		if (!trimmed) {
			return DEFAULT_DONATION_AMOUNT;
		}
		parsed = Number(trimmed);
	} else {
		return DEFAULT_DONATION_AMOUNT;
	}
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_DONATION_AMOUNT;
	}
	return Math.max(1, Math.min(25000, Math.round(parsed)));
}

export const MAIN_ORG_TAX_NOTICE = `${MAIN_ORG_LEGAL_NAME} is a 501(c)(3) nonprofit registered in Arizona operating as ${MAIN_ORG_NAME} (EIN ${MAIN_ORG_EIN}). Donations are tax-deductible.`;

export const GROUP_TAX_NOTICE =
	'This donation goes directly to the selected group. The group may or may not be a registered nonprofit, so tax deductibility is not guaranteed. Contact the group directly to confirm.';

export const ANONYMITY_NOTICE =
	'You can request anonymity, but card and payment processor records may still contain personally identifiable information. This option is a request for the recipient organization to keep your donation private.';
