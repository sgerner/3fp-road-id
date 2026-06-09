import { text } from '@sveltejs/kit';
import { buildEntriesCsv, requireGroupAccountingManager } from '$lib/server/groupAccounting';

export async function GET({ cookies, params }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return text(auth.error, { status: auth.status });
	const csv = await buildEntriesCsv(auth);
	return text(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.slug}-accounting-entries.csv"`
		}
	});
}
