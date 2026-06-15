import { text } from '@sveltejs/kit';
import { chromium } from 'playwright';
import {
	loadAccountingDashboard,
	requireGroupAccountingManager,
	resolveAccountingReportWindow
} from '$lib/server/groupAccounting';

export const config = {
	runtime: 'nodejs20.x',
	maxDuration: 60
};

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}

function formatMoney(cents, currency = 'usd') {
	const amount = Number(cents || 0) / 100;
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency.toUpperCase()
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

function formatDate(value) {
	if (!value) return '';
	return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

function accountPanel(title, tone, accounts, currency, balanceKey) {
	const total = accounts.reduce((sum, account) => sum + Number(account[balanceKey] || 0), 0);
	const rows = accounts
		.map(
			(account) => `
				<tr>
					<td class="code">${escapeHtml(account.code)}</td>
					<td>${escapeHtml(account.name)}</td>
					<td>${escapeHtml(account.display_group || 'Other')}</td>
					<td class="num">${escapeHtml(formatMoney(account[balanceKey], currency))}</td>
				</tr>
			`
		)
		.join('');

	if (!accounts.length) {
		return `
			<div class="panel">
				<div class="panel-title">
					<span class="pill ${tone}">${escapeHtml(title)}</span>
				</div>
				<p class="empty">No ${escapeHtml(title.toLowerCase())} recorded.</p>
			</div>
		`;
	}

	return `
		<div class="panel">
			<div class="panel-title">
				<span class="pill ${tone}">${escapeHtml(title)}</span>
				<span class="panel-total">${escapeHtml(formatMoney(total, currency))}</span>
			</div>
			<table>
				<thead>
					<tr>
						<th>Code</th>
						<th>Account</th>
						<th>Group</th>
						<th class="num">Amount</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</div>
	`;
}

function buildReportHtml(data, reportWindow) {
	const currency = data.settings?.currency || 'usd';
	const report = data.report ?? {};
	const cards = [
		['Income', report.totals?.income_cents, 'positive'],
		['Expenses', report.totals?.expense_cents, 'warning'],
		['Net', report.totals?.net_cents, 'neutral'],
		['Assets', report.totals?.assets_cents, 'neutral'],
		['Liabilities', report.totals?.liabilities_cents, 'danger'],
		['Equity', report.totals?.equity_cents, 'neutral']
	]
		.map(
			([label, value, tone]) => `
				<div class="stat ${tone}">
					<div class="stat-label">${escapeHtml(label)}</div>
					<div class="stat-value">${escapeHtml(formatMoney(value, currency))}</div>
				</div>
			`
		)
		.join('');

	const monthlyRows = (report.monthly ?? [])
		.map(
			(row) => `
				<tr>
					<td>${escapeHtml(formatDate(`${row.month}-01`))}</td>
					<td class="num">${escapeHtml(formatMoney(row.income_cents, currency))}</td>
					<td class="num">${escapeHtml(formatMoney(row.expense_cents, currency))}</td>
					<td class="num">${escapeHtml(formatMoney(row.net_cents, currency))}</td>
				</tr>
			`
		)
		.join('');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(data.group?.name || 'Accounting report')}</title>
	<style>
		:root {
			--bg: #f5f7fb;
			--surface: #ffffff;
			--text: #0f172a;
			--muted: #64748b;
			--border: rgba(15, 23, 42, 0.1);
			--primary: #2554d6;
			--success: #13733d;
			--warning: #b45309;
			--danger: #b42318;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			color: var(--text);
			background: linear-gradient(180deg, #eaf0ff 0%, var(--bg) 14%, var(--bg) 100%);
		}
		.page {
			max-width: 1120px;
			margin: 0 auto;
			padding: 32px;
		}
		.header {
			display: flex;
			justify-content: space-between;
			gap: 24px;
			padding: 28px;
			border: 1px solid var(--border);
			border-radius: 24px;
			background: linear-gradient(135deg, rgba(37, 84, 214, 0.12), rgba(255, 255, 255, 0.95));
			box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
		}
		.kicker {
			text-transform: uppercase;
			letter-spacing: .22em;
			font-size: 11px;
			font-weight: 800;
			color: var(--primary);
		}
		h1 {
			margin: 10px 0 8px;
			font-size: 34px;
			line-height: 1.05;
		}
		.meta { color: var(--muted); font-size: 14px; line-height: 1.6; }
		.badge {
			display: inline-flex;
			align-items: center;
			padding: 10px 14px;
			border-radius: 999px;
			background: rgba(255,255,255,.8);
			border: 1px solid rgba(37,84,214,.15);
			font-size: 13px;
			font-weight: 700;
			white-space: nowrap;
		}
		.stats {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 14px;
			margin-top: 18px;
		}
		.stat {
			padding: 18px;
			border-radius: 18px;
			border: 1px solid var(--border);
			background: var(--surface);
		}
		.stat-label {
			color: var(--muted);
			font-size: 12px;
			font-weight: 800;
			text-transform: uppercase;
			letter-spacing: .15em;
		}
		.stat-value { margin-top: 12px; font-size: 24px; font-weight: 800; }
		.stat.positive { border-color: rgba(19, 115, 61, .2); }
		.stat.warning { border-color: rgba(180, 83, 9, .2); }
		.stat.danger { border-color: rgba(180, 35, 24, .2); }
		.grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 18px;
			margin-top: 24px;
		}
		.panel {
			padding: 22px;
			border-radius: 22px;
			border: 1px solid var(--border);
			background: var(--surface);
			box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
			page-break-inside: avoid;
		}
		.panel-title {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			margin-bottom: 14px;
		}
		.pill {
			display: inline-flex;
			align-items: center;
			padding: 8px 12px;
			border-radius: 999px;
			font-size: 12px;
			font-weight: 800;
			text-transform: uppercase;
			letter-spacing: .12em;
		}
		.pill.primary { background: rgba(37,84,214,.12); color: var(--primary); }
		.pill.neutral { background: rgba(15,23,42,.06); color: var(--text); }
		.pill.warning { background: rgba(180,83,9,.12); color: var(--warning); }
		.pill.danger { background: rgba(180,35,24,.12); color: var(--danger); }
		.panel-total { font-size: 16px; font-weight: 800; color: var(--muted); }
		table { width: 100%; border-collapse: collapse; }
		thead th {
			padding: 10px 0;
			border-bottom: 1px solid var(--border);
			text-align: left;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: .15em;
			color: var(--muted);
		}
		tbody td {
			padding: 12px 0;
			border-bottom: 1px solid rgba(15, 23, 42, 0.06);
			font-size: 14px;
		}
		tbody tr:last-child td { border-bottom: 0; }
		.num { text-align: right; font-variant-numeric: tabular-nums; }
		.code { width: 88px; font-weight: 800; color: var(--primary); }
		.empty { margin: 0; color: var(--muted); font-size: 14px; }
		.monthly {
			margin-top: 24px;
			padding: 22px;
			border-radius: 22px;
			border: 1px solid var(--border);
			background: var(--surface);
		}
		.section-title { margin: 0 0 14px; font-size: 18px; font-weight: 800; }
		@media print {
			body { background: white; }
			.page { padding: 0; }
			.header, .stat, .panel, .monthly { box-shadow: none; }
		}
	</style>
</head>
<body>
	<div class="page">
		<header class="header">
			<div>
				<div class="kicker">Accounting report</div>
				<h1>${escapeHtml(data.group?.name || 'Group')} report</h1>
				<div class="meta">
					<div>${escapeHtml(reportWindow.label)} · ${escapeHtml(formatDate(report.from))} to ${escapeHtml(formatDate(report.to))}</div>
					<div>Generated ${escapeHtml(new Date().toLocaleString())}</div>
				</div>
			</div>
			<div class="badge">${escapeHtml(reportWindow.period === 'custom' ? 'Custom range' : reportWindow.label)}</div>
		</header>

		<section class="stats">
${cards}
		</section>

		<section class="grid">
			${accountPanel('Profit & Loss', 'primary', report.income ?? [], currency, 'period_balance_cents')}
			${accountPanel('Expenses', 'warning', report.expenses ?? [], currency, 'period_balance_cents')}
			${accountPanel('Assets', 'neutral', report.assets ?? [], currency, 'balance_cents')}
			${accountPanel('Liabilities', 'danger', report.liabilities ?? [], currency, 'balance_cents')}
		</section>

		${(report.monthly ?? []).length
			? `<section class="monthly">
				<h2 class="section-title">Monthly trend</h2>
				<table>
					<thead>
						<tr>
							<th>Month</th>
							<th class="num">Income</th>
							<th class="num">Expenses</th>
							<th class="num">Net</th>
						</tr>
					</thead>
					<tbody>${monthlyRows}</tbody>
				</table>
			</section>`
			: ''}
	</div>
</body>
</html>`;
}

export async function GET({ cookies, params, url }) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return text(auth.error, { status: auth.status });

	const reportWindow = resolveAccountingReportWindow(url);
	const data = await loadAccountingDashboard(auth, url);
	const html = buildReportHtml(data, reportWindow);
	const browser = await chromium.launch({ args: ['--no-sandbox'] });

	try {
		const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });
		await page.setContent(html, { waitUntil: 'load' });
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }
		});
		return new Response(pdf, {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${params.slug}-accounting-report-${reportWindow.from}-to-${reportWindow.to}.pdf"`
			}
		});
	} finally {
		await browser.close();
	}
}
