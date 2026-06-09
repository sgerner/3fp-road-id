import { json } from '@sveltejs/kit';
import {
	completeStripeFinancialConnectionsSession,
	requireGroupAccountingManager
} from '$lib/server/groupAccounting';

export async function POST({ cookies, params, request }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	const payload = await request.json().catch(() => ({}));
	try {
		const connection = await completeStripeFinancialConnectionsSession(auth, payload.session_id);
		return json({ ok: true, connection });
	} catch (error) {
		return json(
			{ error: error?.message || 'Unable to finish Financial Connections setup.' },
			{ status: 400 }
		);
	}
}
