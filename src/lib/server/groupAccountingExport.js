import { parseCsvRows } from './groupAccountingRules.js';

export function filterAccountingReportCsv(csv, type) {
	if (!['pl', 'bs'].includes(type)) return csv;
	const rows = parseCsvRows(csv);
	const selected = rows.filter((row, index) => {
		if (index < 2) return true;
		if (row[0] === 'summary') {
			return (type === 'pl' ? ['income', 'expense', 'net'] : ['position']).includes(row[1]);
		}
		return (type === 'pl' ? ['income', 'expense'] : ['asset', 'liability', 'equity']).includes(
			row[0]
		);
	});
	return selected
		.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
		.join('\n');
}
