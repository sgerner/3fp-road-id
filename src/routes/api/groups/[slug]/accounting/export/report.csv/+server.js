import { text } from '@sveltejs/kit';
import {
	buildAccountingReportCsv,
	requireGroupAccountingManager,
	resolveAccountingReportWindow
} from '$lib/server/groupAccounting';

export async function GET({ cookies, params, url }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return text(auth.error, { status: auth.status });

	const reportWindow = resolveAccountingReportWindow(url);
	const csv = await buildAccountingReportCsv(auth, reportWindow);
	return text(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.slug}-accounting-report-${reportWindow.from}-to-${reportWindow.to}.csv"`
		}
	});
}
