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
	let csv = await buildAccountingReportCsv(auth, reportWindow);

	const type = url.searchParams.get('type');
	if (type === 'pl' || type === 'bs') {
		const lines = csv.split('\n');
		const filteredLines = [];
		// Keep the first two header lines
		if (lines.length > 0) filteredLines.push(lines[0]);
		if (lines.length > 1) filteredLines.push(lines[1]);

		for (let i = 2; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const firstComma = line.indexOf(',');
			const section = firstComma !== -1 ? line.substring(0, firstComma) : line;

			if (section === 'summary') {
				const parts = line.split(',');
				const kind = parts[1];
				if (type === 'pl' && ['income', 'expense', 'net'].includes(kind)) {
					filteredLines.push(line);
				} else if (type === 'bs' && ['position'].includes(kind)) {
					filteredLines.push(line);
				}
			} else if (type === 'pl' && ['income', 'expense'].includes(section)) {
				filteredLines.push(line);
			} else if (type === 'bs' && ['asset', 'liability', 'equity'].includes(section)) {
				filteredLines.push(line);
			}
		}
		csv = filteredLines.join('\n');
	}

	const filenamePrefix = type === 'pl' ? 'profit-and-loss' : type === 'bs' ? 'balance-sheet' : 'report';

	return text(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.slug}-${filenamePrefix}-${reportWindow.from}-to-${reportWindow.to}.csv"`
		}
	});
}
