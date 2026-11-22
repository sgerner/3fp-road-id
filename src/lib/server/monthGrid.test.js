import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMonthGrid, toLocalDateKey } from '../calendar/monthGrid.js';

const monthGridUrl = new URL('../calendar/monthGrid.js', import.meta.url).href;
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

test('toLocalDateKey returns empty string for nullish, non-Date, and invalid Date inputs', () => {
	assert.equal(toLocalDateKey(null), '');
	assert.equal(toLocalDateKey(undefined), '');
	assert.equal(toLocalDateKey(/** @type {any} */ (NaN)), '');
	assert.equal(toLocalDateKey(/** @type {any} */ ('2026-11-23')), '');
	assert.equal(toLocalDateKey(new Date('not-a-date')), '');
	assert.equal(toLocalDateKey(new Date(NaN)), '');
});

test('toLocalDateKey formats local year, month, and day with zero padding', () => {
	assert.equal(toLocalDateKey(new Date(2026, 0, 5, 0, 0, 0)), '2026-01-05');
	assert.equal(toLocalDateKey(new Date(2026, 10, 23, 18, 0, 0)), '2026-11-23');
	assert.equal(toLocalDateKey(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31');
});

test('buildMonthGrid defaults to toLocalDateKey for local midnight cells and preserves custom toDateKey', () => {
	const mondayEveningLocal = new Date(2026, 10, 23, 18, 0, 0);
	const key = toLocalDateKey(mondayEveningLocal);
	const itemsByDate = {
		[key]: [{ slug: 'monday-evening-ride' }]
	};

	const grid = buildMonthGrid(new Date(2026, 10, 1), itemsByDate);
	assert.equal(grid.length, 6);
	assert.ok(grid.every((week) => week.length === 7));

	const flat = grid.flat();
	assert.equal(flat[0].key, '2026-11-01');
	assert.equal(flat[0].inMonth, true);

	const mondayCell = flat.find((day) => day.key === '2026-11-23');
	const tuesdayCell = flat.find((day) => day.key === '2026-11-24');
	assert.ok(mondayCell);
	assert.ok(tuesdayCell);
	assert.equal(mondayCell.date.getHours(), 0);
	assert.equal(mondayCell.date.getMinutes(), 0);
	assert.deepEqual(mondayCell.items, [{ slug: 'monday-evening-ride' }]);
	assert.deepEqual(tuesdayCell.items, []);

	const trailingDecCell = flat.find((day) => day.key === '2026-12-01');
	assert.ok(trailingDecCell);
	assert.equal(trailingDecCell.inMonth, false);

	const customGrid = buildMonthGrid(
		new Date(2026, 10, 1),
		{ 'custom:2026-11-15': ['ride-a'] },
		(d) => `custom:${toLocalDateKey(d)}`
	);
	const customMatch = customGrid.flat().find((day) => day.key === 'custom:2026-11-15');
	assert.ok(customMatch);
	assert.deepEqual(customMatch.items, ['ride-a']);
});

test('evening timestamps past UTC midnight stay on their local calendar day across timezones', () => {
	const script = `
		import assert from 'node:assert/strict';
		import { buildMonthGrid, toLocalDateKey } from ${JSON.stringify(monthGridUrl)};

		// Monday, Nov 23, 2026 at 6:00 PM MST (America/Phoenix, UTC-7) is 2026-11-24T01:00:00.000Z in UTC.
		const rideStart = new Date('2026-11-24T01:00:00.000Z');
		assert.equal(rideStart.toISOString().slice(0, 10), '2026-11-24');

		const key = toLocalDateKey(rideStart);
		assert.equal(key, '2026-11-23');

		const grid = buildMonthGrid(new Date(2026, 10, 1), {
			[key]: [{ slug: 'meetup-monday-night-flat-route-evening-ride-3' }]
		});
		const flat = grid.flat();
		const monday = flat.find((day) => day.key === '2026-11-23');
		const tuesday = flat.find((day) => day.key === '2026-11-24');

		assert.equal(monday.date.getDay(), 1);
		assert.equal(monday.items.length, 1);
		assert.equal(tuesday.items.length, 0);
	`;

	execFileSync(process.execPath, ['--input-type=module', '-e', script], {
		cwd: repoRoot,
		env: { ...process.env, TZ: 'America/Phoenix' },
		stdio: 'pipe'
	});

	const positiveOffsetScript = `
		import assert from 'node:assert/strict';
		import { buildMonthGrid, toLocalDateKey } from ${JSON.stringify(monthGridUrl)};

		// In Asia/Tokyo (UTC+9), local midnight 2026-11-23 is 2026-11-22T15:00:00.000Z in UTC.
		const localMidnight = new Date(2026, 10, 23, 0, 0, 0);
		assert.equal(localMidnight.toISOString().slice(0, 10), '2026-11-22');
		assert.equal(toLocalDateKey(localMidnight), '2026-11-23');

		const grid = buildMonthGrid(new Date(2026, 10, 1), {
			'2026-11-23': [{ slug: 'tokyo-morning-ride' }]
		});
		const monday = grid.flat().find((day) => day.key === '2026-11-23');
		assert.equal(monday.date.getDate(), 23);
		assert.equal(monday.items.length, 1);
	`;

	execFileSync(process.execPath, ['--input-type=module', '-e', positiveOffsetScript], {
		cwd: repoRoot,
		env: { ...process.env, TZ: 'Asia/Tokyo' },
		stdio: 'pipe'
	});
});
