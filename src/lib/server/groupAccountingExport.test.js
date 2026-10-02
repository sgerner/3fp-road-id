import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAccountingReportCsv } from './groupAccountingExport.js';
import { parseCsvRows } from './groupAccountingRules.js';

test('report export filtering understands quoted sections, commas, and multiline account names', () => {
	const csv =
		'Report,Dates\nsection,kind,name,amount\n"summary","income","Money in",100\n"summary","position","Assets",200\n"income",income,"Event, proceeds\nsecond line",100\n"asset",asset,"Bank",200';
	const pl = parseCsvRows(filterAccountingReportCsv(csv, 'pl'));
	assert.deepEqual(pl.slice(2), [
		['summary', 'income', 'Money in', '100'],
		['income', 'income', 'Event, proceeds\nsecond line', '100']
	]);
	const bs = parseCsvRows(filterAccountingReportCsv(csv, 'bs'));
	assert.deepEqual(bs.slice(2), [
		['summary', 'position', 'Assets', '200'],
		['asset', 'asset', 'Bank', '200']
	]);
});
