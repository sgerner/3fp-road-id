import { json } from '@sveltejs/kit';
import {
	createStripeFinancialConnectionsSession,
	requireGroupAccountingManager
} from '$lib/server/groupAccounting';

export async function POST({ cookies, params }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	try {
		return json(await createStripeFinancialConnectionsSession(auth));
	} catch (error) {
		return json(
			{ error: error?.message || 'Unable to create Financial Connections session.' },
			{ status: 400 }
		);
	}
}
