import { isValidAccountingDate } from './groupAccountingRules.js';

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function accountingHistoryFilters(params = new URLSearchParams()) {
	const text = (key, max = 120) => (params.get(key) || '').trim().slice(0, max);
	const page = (key) => Math.min(100000, Math.max(1, Number.parseInt(text(key), 10) || 1));
	const date = (key) => (isValidAccountingDate(text(key)) ? text(key) : null);
	const account = text('ledger_account');
	return {
		ledger: {
			page: page('ledger_page'),
			q: text('ledger_q'),
			account: UUID.test(account) ? account : null,
			source: text('ledger_source', 40),
			from: date('ledger_from'),
			to: date('ledger_to')
		},
		receipts: { page: page('receipt_page'), q: text('receipt_q') },
		audit: { page: page('audit_page'), q: text('audit_q') }
	};
}

function literalPattern(text) {
	return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

async function readPage(factory, requestedPage) {
	const fetch = (page) => factory().range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
	let result = await fetch(requestedPage);
	if (result.error) throw new Error(result.error.message);
	const total = result.count ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const page = Math.min(requestedPage, Math.max(1, totalPages));
	if (page !== requestedPage) {
		result = await fetch(page);
		if (result.error) throw new Error(result.error.message);
	}
	return { data: result.data ?? [], total, page, total_pages: totalPages, page_size: PAGE_SIZE };
}

export async function loadAccountingHistory(db, groupId, params) {
	const filters = accountingHistoryFilters(params);
	const ledger = () => {
		const accountJoin = filters.ledger.account
			? ',filter_lines:group_accounting_lines!inner(account_id)'
			: '';
		let query = db
			.from('group_accounting_entries')
			.select(
				`*,receipts:group_accounting_receipts!group_accounting_receipts_entry_id_fkey(id,file_name,mime_type,size_bytes,created_at),lines:group_accounting_lines(*,account:group_accounting_accounts(id,code,name,kind))${accountJoin}`,
				{ count: 'exact' }
			)
			.eq('group_id', groupId);
		if (filters.ledger.q) query = query.ilike('description', literalPattern(filters.ledger.q));
		if (filters.ledger.account) query = query.eq('filter_lines.account_id', filters.ledger.account);
		if (filters.ledger.source) query = query.eq('source', filters.ledger.source);
		if (filters.ledger.from) query = query.gte('entry_date', filters.ledger.from);
		if (filters.ledger.to) query = query.lte('entry_date', filters.ledger.to);
		return query.order('entry_date', { ascending: false }).order('id', { ascending: false });
	};
	const receipts = () => {
		let query = db
			.from('group_accounting_receipts')
			.select('*,entry:group_accounting_entries(description,entry_date,amount_cents)', {
				count: 'exact'
			})
			.eq('group_id', groupId);
		if (filters.receipts.q) query = query.ilike('file_name', literalPattern(filters.receipts.q));
		return query.order('created_at', { ascending: false }).order('id', { ascending: false });
	};
	const audit = () => {
		let query = db
			.from('group_accounting_audit_events')
			.select('*', { count: 'exact' })
			.eq('group_id', groupId);
		if (filters.audit.q) query = query.ilike('event_type', literalPattern(filters.audit.q));
		return query.order('created_at', { ascending: false }).order('id', { ascending: false });
	};
	const [entries, receiptRows, auditRows] = await Promise.all([
		readPage(ledger, filters.ledger.page),
		readPage(receipts, filters.receipts.page),
		readPage(audit, filters.audit.page)
	]);
	entries.data = entries.data.map((row) => {
		const entry = { ...row };
		delete entry.filter_lines;
		return entry;
	});
	return { entries, receipts: receiptRows, audit: auditRows };
}

export async function loadAccountingSetupProgress(db, groupId) {
	const results = await Promise.all([
		db
			.from('group_accounting_entries')
			.select('id', { count: 'exact', head: true })
			.eq('group_id', groupId)
			.eq('entry_type', 'opening_balance')
			.eq('status', 'posted'),
		db
			.from('group_accounting_bank_feed_items')
			.select('id', { count: 'exact', head: true })
			.eq('group_id', groupId),
		db
			.from('group_accounting_reconciliations')
			.select('id', { count: 'exact', head: true })
			.eq('group_id', groupId)
			.eq('status', 'completed')
	]);
	for (const result of results) if (result.error) throw new Error(result.error.message);
	return {
		has_opening_balances: (results[0].count ?? 0) > 0,
		has_imported_activity: (results[1].count ?? 0) > 0,
		has_reconciliation: (results[2].count ?? 0) > 0
	};
}
