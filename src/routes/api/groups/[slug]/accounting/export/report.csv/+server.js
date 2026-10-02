import { text } from '@sveltejs/kit';
import { filterAccountingReportCsv } from '$lib/server/groupAccountingExport';
import {
	buildAccountingReportCsv,
	requireGroupAccountingManager,
	resolveAccountingReportWindow
} from '$lib/server/groupAccounting';

export async function GET({ cookies, params, url }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return text(auth.error, { status: auth.status });

	const reportWindow = resolveAccountingReportWindow(url);
	let csv = await buildAccountingReportCsv(auth, reportWindow);

	const type = url.searchParams.get('type');
	csv = filterAccountingReportCsv(csv, type);

	const filenamePrefix =
		type === 'pl' ? 'profit-and-loss' : type === 'bs' ? 'balance-sheet' : 'report';

	return text(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.slug}-${filenamePrefix}-${reportWindow.from}-to-${reportWindow.to}.csv"`
		}
	});
}
