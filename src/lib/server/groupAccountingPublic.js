// Public snapshots contain only the sections the publisher chose to share.
// Use an allowlist so internal account metadata and future fields stay private.
const pick = (value, keys) =>
	Object.fromEntries(
		keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]])
	);

export function buildPublicAccountingSnapshot(report = {}, budgets = [], visibility = {}) {
	const activity = visibility.activity !== false;
	const position = visibility.position !== false;
	const cash = visibility.cash !== false;
	const financial = { ...pick(report, ['from', 'to', 'currency']), totals: {} };
	const accountFields = ['code', 'name', 'kind'];
	if (activity) {
		financial.income = (report.income ?? []).map((row) =>
			pick(row, [...accountFields, 'period_balance_cents'])
		);
		financial.expenses = (report.expenses ?? []).map((row) =>
			pick(row, [...accountFields, 'period_balance_cents'])
		);
		financial.monthly = (report.monthly ?? []).map((row) =>
			pick(row, ['month', 'income_cents', 'expense_cents', 'net_cents'])
		);
		Object.assign(
			financial.totals,
			pick(report.totals, ['income_cents', 'expense_cents', 'net_cents'])
		);
	}
	if (position) {
		for (const key of ['assets', 'liabilities', 'equity']) {
			financial[key] = (report[key] ?? []).map((row) =>
				pick(row, [...accountFields, 'balance_cents'])
			);
		}
		Object.assign(
			financial.totals,
			pick(report.totals, ['assets_cents', 'liabilities_cents', 'equity_cents'])
		);
	} else if (cash) {
		Object.assign(financial.totals, pick(report.totals, ['assets_cents', 'liabilities_cents']));
	}
	const snapshot = { report: financial };
	if (visibility.budgets === true) {
		snapshot.budgets = budgets.map((row) => ({
			...pick(row, ['year', 'amount_cents', 'monthly_amounts']),
			account: pick(row.account, accountFields)
		}));
	}
	return snapshot;
}

export function publicAccountingReport(row) {
	if (!row) return row;
	return {
		...pick(row, [
			'id',
			'slug',
			'title',
			'report_period_start',
			'report_period_end',
			'visibility',
			'published_at'
		]),
		snapshot: {
			...buildPublicAccountingSnapshot(row.snapshot?.report, row.snapshot?.budgets, row.visibility),
			...pick(row.snapshot, ['generated_at', 'currency'])
		},
		notes: row.visibility?.notes === false ? null : row.notes
	};
}
