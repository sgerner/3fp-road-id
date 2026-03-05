import { finalizeDonationBySessionId } from '$lib/server/donations';

function formatAmount(cents, currency = 'usd') {
	const amount = Number(cents || 0) / 100;
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: String(currency || 'usd').toUpperCase()
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

export const load = async ({ url, fetch }) => {
	const sessionId = (url.searchParams.get('session_id') || '').trim();
	if (!sessionId) {
		return {
			ok: false,
			error: 'Missing checkout session id.'
		};
	}

	const result = await finalizeDonationBySessionId(sessionId, fetch);
	if (!result?.ok) {
		return {
			ok: false,
			error: result?.error || 'Unable to verify donation.'
		};
	}

	const donation = result?.donation || null;
	return {
		ok: true,
		paid: result?.paid === true,
		donation: donation
			? {
					recipientDisplayName: donation.recipient_display_name,
					recipientType: donation.recipient_type,
					amount: formatAmount(donation.amount_total_cents, donation.currency),
					donorRequestedAnonymity: donation.donor_requested_anonymity === true,
					donorReceiptSent: Boolean(donation.donor_receipt_sent_at),
					recipientNoticeSent: Boolean(donation.recipient_notice_sent_at)
				}
			: null
	};
};
