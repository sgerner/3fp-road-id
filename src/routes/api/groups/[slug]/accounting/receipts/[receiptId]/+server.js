import { text } from '@sveltejs/kit';
import { createReceiptViewUrl, requireGroupAccountingManager } from '$lib/server/groupAccounting';

const PRIVATE_HEADERS = {
	'cache-control': 'private, no-store',
	'referrer-policy': 'no-referrer',
	'x-content-type-options': 'nosniff'
};

export async function GET({ cookies, params }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return text(auth.error, { status: auth.status, headers: PRIVATE_HEADERS });

	try {
		const signedUrl = await createReceiptViewUrl(auth, params.receiptId);
		if (!signedUrl) return text('Receipt not found.', { status: 404, headers: PRIVATE_HEADERS });
		return new Response(null, {
			status: 302,
			headers: { ...PRIVATE_HEADERS, location: signedUrl }
		});
	} catch {
		return text('Unable to open receipt.', { status: 500, headers: PRIVATE_HEADERS });
	}
}
