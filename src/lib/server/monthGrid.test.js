import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
	addDaysToDateKey,
	bucketEventsByTimezone,
	buildMonthGrid,
	canonicalizeTimezone,
	formatRideDayBlock,
	formatRideSchedule,
	formatVolunteerSchedule,
	getCachedDateTimeFormat,
	getFormatterCacheSize,
	getTimezoneBadge,
	getTimezoneShortName,
	matchesCivilDateRange,
	normalizeEventTimezone,
	startOfMonthFromDateKey,
	toCivilDateKey,
	toEventDateKey
} from '#lib/calendar/monthGrid.js';

test('buildMonthGrid keys day cells by civil YYYY-MM-DD dates across DST and month boundaries', () => {
	// November 2026 starts on Sunday Nov 1 (US DST fall-back day)
	const reference = new Date(2026, 10, 1);
	const itemsByDate = {
		'2026-11-01': [{ slug: 'dst-sunday' }],
		'2026-11-23': [{ slug: 'full-moon-ride' }],
		'2026-12-05': [{ slug: 'december-trailing' }]
	};

	const grid = buildMonthGrid(reference, itemsByDate);
	assert.equal(grid.length, 6);
	assert.equal(grid[0].length, 7);

	assert.equal(grid[0][0].key, '2026-11-01');
	assert.equal(grid[0][0].inMonth, true);
	assert.deepEqual(grid[0][0].items, [{ slug: 'dst-sunday' }]);

	// Nov 2, 2026 is Monday right after US DST fall-back — must not duplicate Nov 1
	assert.equal(grid[0][1].key, '2026-11-02');

	// Week 3, Monday (index 1) is Monday, November 23, 2026
	const mondayNov23 = grid[3][1];
	assert.equal(mondayNov23.key, '2026-11-23');
	assert.equal(mondayNov23.date.getDay(), 1);
	assert.equal(mondayNov23.inMonth, true);
	assert.deepEqual(mondayNov23.items, [{ slug: 'full-moon-ride' }]);

	// Trailing week cell in December
	const saturdayDec5 = grid[4][6];
	assert.equal(saturdayDec5.key, '2026-12-05');
	assert.equal(saturdayDec5.inMonth, false);
	assert.deepEqual(saturdayDec5.items, [{ slug: 'december-trailing' }]);
});

test('Full Moon Ride (2026-11-24T01:00:00+00:00, America/Phoenix) buckets and formats on Monday Nov 23 across US, European, Australian, and UTC viewer timezones', () => {
	const fullMoonRide = {
		slug: 'full-moon-ride',
		title: 'Full Moon Ride',
		nextOccurrenceStart: '2026-11-24T01:00:00+00:00',
		nextOccurrenceEnd: '2026-11-24T03:00:00+00:00',
		timezone: 'America/Phoenix'
	};

	const script = `
		import {
			bucketEventsByTimezone,
			buildMonthGrid,
			formatRideDayBlock,
			formatRideSchedule,
			getTimezoneBadge,
			getViewerTimezone,
			toCivilDateKey
		} from './src/lib/calendar/monthGrid.js';

		const ride = ${JSON.stringify(fullMoonRide)};
		const byDate = bucketEventsByTimezone([ride], (r) => r.nextOccurrenceStart, (r) => r.timezone);
		const grid = buildMonthGrid(new Date(2026, 10, 1), byDate);
		const mondayCell = grid[3][1];
		const viewerTz = getViewerTimezone();
		const eveningNow = new Date('2026-11-24T01:30:00Z');
		console.log(JSON.stringify({
			viewerTz,
			dateKeys: Object.keys(byDate),
			mondayCellKey: mondayCell.key,
			mondayWeekday: mondayCell.date.getDay(),
			mondayCount: mondayCell.items.length,
			schedule: formatRideSchedule(ride.nextOccurrenceStart, ride.nextOccurrenceEnd, ride.timezone),
			dayBlock: formatRideDayBlock(ride.nextOccurrenceStart, ride.timezone),
			badge: getTimezoneBadge(ride.nextOccurrenceStart, ride.timezone, viewerTz),
			localTodayKeyAt0130Z: toCivilDateKey(eveningNow)
		}));
	`;

	const viewerTimezones = [
		'UTC',
		'America/Phoenix',
		'America/Los_Angeles',
		'America/New_York',
		'Europe/Berlin',
		'Australia/Sydney'
	];

	for (const tz of viewerTimezones) {
		const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
			cwd: process.cwd(),
			env: { ...process.env, TZ: tz },
			encoding: 'utf8'
		}).trim();
		const result = JSON.parse(raw);

		assert.deepEqual(result.dateKeys, ['2026-11-23'], `expected Nov 23 bucket under TZ=${tz}`);
		assert.equal(result.mondayCellKey, '2026-11-23', `expected civil cell key under TZ=${tz}`);
		assert.equal(result.mondayWeekday, 1, `expected Monday column under TZ=${tz}`);
		assert.equal(result.mondayCount, 1, `expected Full Moon Ride in Monday cell under TZ=${tz}`);
		assert.equal(result.schedule, 'Mon, Nov 23 · 6:00 PM – 8:00 PM');
		assert.deepEqual(result.dayBlock, { month: 'NOV', day: '23', time: '6:00 PM' });

		if (tz === 'America/Phoenix') {
			assert.equal(result.badge, '');
			assert.equal(result.localTodayKeyAt0130Z, '2026-11-23');
		} else {
			assert.equal(result.badge, 'MST', `expected MST badge for viewer in ${tz}`);
		}

		if (tz === 'America/Los_Angeles' || tz === 'America/New_York') {
			assert.equal(result.localTodayKeyAt0130Z, '2026-11-23');
		}
	}
});

test('IANA timezone bucketing handles US, European, and Australian offsets around midnight UTC', () => {
	const events = [
		{
			id: 'la-evening',
			startsAt: '2026-11-24T05:30:00Z', // Mon Nov 23, 9:30 PM PST
			timezone: 'America/Los_Angeles'
		},
		{
			id: 'chi-evening',
			startsAt: '2026-11-24T01:30:00Z', // Mon Nov 23, 7:30 PM CST
			timezone: 'America/Chicago'
		},
		{
			id: 'nyc-evening',
			startsAt: '2026-11-24T02:00:00Z', // Mon Nov 23, 9:00 PM EST
			timezone: 'America/New_York'
		},
		{
			id: 'london-late',
			startsAt: '2026-07-15T23:30:00Z', // Thu Jul 16, 12:30 AM BST (UTC+1)
			timezone: 'Europe/London'
		},
		{
			id: 'berlin-late',
			startsAt: '2026-11-23T23:30:00Z', // Tue Nov 24, 12:30 AM CET (UTC+1)
			timezone: 'Europe/Berlin'
		},
		{
			id: 'sydney-morning',
			startsAt: '2026-11-23T20:00:00Z', // Tue Nov 24, 7:00 AM AEDT (UTC+11)
			timezone: 'Australia/Sydney'
		}
	];

	const bucketed = bucketEventsByTimezone(
		events,
		(event) => event.startsAt,
		(event) => event.timezone
	);

	assert.deepEqual(
		bucketed['2026-11-23']?.map((e) => e.id),
		['la-evening', 'chi-evening', 'nyc-evening']
	);
	assert.deepEqual(
		bucketed['2026-07-16']?.map((e) => e.id),
		['london-late']
	);
	assert.deepEqual(
		bucketed['2026-11-24']?.map((e) => e.id),
		['berlin-late', 'sydney-morning']
	);

	// Exact midnight boundaries in America/Phoenix (UTC-7)
	assert.equal(toEventDateKey('2026-11-23T07:00:00Z', 'America/Phoenix'), '2026-11-23');
	assert.equal(toEventDateKey('2026-11-24T06:59:59Z', 'America/Phoenix'), '2026-11-23');
	assert.equal(toEventDateKey('2026-11-24T07:00:00Z', 'America/Phoenix'), '2026-11-24');
});

test('malformed or missing timezones never throw RangeError and fall back cleanly', () => {
	const instant = new Date('2026-11-23T18:00:00Z');
	const expectedLocalKey = toCivilDateKey(instant);

	for (const badZone of ['', '   ', null, undefined, 'Invalid/Timezone', 'Mars/Olympus', 42]) {
		assert.equal(normalizeEventTimezone(badZone, null), null);
		assert.equal(canonicalizeTimezone(badZone), null);
		assert.equal(toEventDateKey(instant, badZone), expectedLocalKey);
		assert.equal(getTimezoneBadge(instant, badZone, 'America/New_York'), '');
		assert.doesNotThrow(() => formatRideSchedule(instant, null, badZone));
		assert.doesNotThrow(() => formatVolunteerSchedule(instant, null, badZone));
	}

	// Valid UTC and legacy IANA aliases normalize cleanly
	assert.equal(canonicalizeTimezone('UTC'), 'UTC');
	assert.equal(canonicalizeTimezone('Etc/UTC'), 'UTC');
	assert.equal(canonicalizeTimezone('US/Arizona'), 'America/Phoenix');
	assert.equal(getTimezoneBadge(instant, 'US/Arizona', 'America/Phoenix'), '');
});

test('getTimezoneBadge returns short US/global badges only when event timezone differs from viewer', () => {
	const winterInstant = '2026-11-24T05:30:00Z';

	assert.equal(getTimezoneBadge(winterInstant, 'America/Los_Angeles', 'America/New_York'), 'PST');
	assert.equal(getTimezoneBadge(winterInstant, 'America/Phoenix', 'America/New_York'), 'MST');
	assert.equal(getTimezoneBadge(winterInstant, 'America/Chicago', 'America/Los_Angeles'), 'CST');
	assert.equal(getTimezoneBadge(winterInstant, 'America/New_York', 'America/Los_Angeles'), 'EST');
	assert.equal(getTimezoneBadge(winterInstant, 'America/Phoenix', 'America/Phoenix'), '');
	assert.equal(getTimezoneShortName(winterInstant, 'UTC'), 'UTC');
});

test('Intl.DateTimeFormat cache reuses formatter instances across 200+ rides', () => {
	const fmtA = getCachedDateTimeFormat('America/Phoenix', {
		hour: 'numeric',
		minute: '2-digit'
	});
	const fmtB = getCachedDateTimeFormat('America/Phoenix', {
		minute: '2-digit',
		hour: 'numeric'
	});
	assert.equal(fmtA, fmtB);

	const zones = ['America/Phoenix', 'America/Los_Angeles', 'America/Chicago', 'America/New_York'];
	// Warm the 4 timezones once
	for (const zone of zones) {
		toEventDateKey('2026-11-24T01:00:00Z', zone);
		formatRideSchedule('2026-11-24T01:00:00Z', '2026-11-24T03:00:00Z', zone);
		getTimezoneBadge('2026-11-24T01:00:00Z', zone, 'UTC');
	}
	const warmedCacheSize = getFormatterCacheSize();

	// Bucket and format 200 rides across those 4 timezones — zero new formatters allocated
	const rides = Array.from({ length: 200 }, (_, index) => ({
		id: `ride-${index}`,
		startsAt: new Date(Date.UTC(2026, 10, 1 + (index % 28), 1, 0, 0)).toISOString(),
		endsAt: new Date(Date.UTC(2026, 10, 1 + (index % 28), 3, 0, 0)).toISOString(),
		timezone: zones[index % zones.length]
	}));

	bucketEventsByTimezone(
		rides,
		(ride) => ride.startsAt,
		(ride) => ride.timezone
	);
	for (const ride of rides) {
		formatRideSchedule(ride.startsAt, ride.endsAt, ride.timezone);
		getTimezoneBadge(ride.startsAt, ride.timezone, 'UTC');
	}

	assert.equal(getFormatterCacheSize(), warmedCacheSize);
});

test('matchesCivilDateRange and helpers evaluate Today, Tomorrow, week, and custom filters consistently', () => {
	const todayKey = '2026-11-23'; // Monday

	assert.equal(addDaysToDateKey(todayKey, 1), '2026-11-24');
	assert.equal(addDaysToDateKey('2026-11-30', 1), '2026-12-01');

	const novStart = startOfMonthFromDateKey('2026-11-30');
	assert.equal(novStart.getFullYear(), 2026);
	assert.equal(novStart.getMonth(), 10);
	assert.equal(novStart.getDate(), 1);

	assert.equal(matchesCivilDateRange('2026-11-23', 'today', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-11-24', 'today', { todayKey }), false);

	assert.equal(matchesCivilDateRange('2026-11-24', 'tomorrow', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-11-23', 'tomorrow', { todayKey }), false);

	// Week of Mon Nov 23, 2026 (Sunday-first: Sun Nov 22 .. Sat Nov 28)
	assert.equal(matchesCivilDateRange('2026-11-22', 'this_week', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-11-28', 'this_week', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-11-29', 'this_week', { todayKey }), false);

	// Next week: Sun Nov 29 .. Sat Dec 5
	assert.equal(matchesCivilDateRange('2026-11-29', 'next_week', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-12-05', 'next_week', { todayKey }), true);
	assert.equal(matchesCivilDateRange('2026-12-06', 'next_week', { todayKey }), false);

	// Custom range
	assert.equal(
		matchesCivilDateRange('2026-11-23', 'custom', {
			todayKey,
			customStartDate: '2026-11-23',
			customEndDate: '2026-11-25'
		}),
		true
	);
	assert.equal(
		matchesCivilDateRange('2026-11-22', 'custom', {
			todayKey,
			customStartDate: '2026-11-23',
			customEndDate: '2026-11-25'
		}),
		false
	);
});

test('formatVolunteerSchedule formats same-day and multi-day shifts in venue timezone', () => {
	// Mon Nov 23, 2026 6:00 PM - 9:00 PM MST (crosses 00:00Z into Nov 24 UTC)
	assert.equal(
		formatVolunteerSchedule(
			'2026-11-24T01:00:00+00:00',
			'2026-11-24T04:00:00+00:00',
			'America/Phoenix'
		),
		'Monday, November 23, 2026 · 6:00 PM – 9:00 PM'
	);

	// Overnight shift in America/Phoenix (Mon Nov 23 10:00 PM -> Tue Nov 24 1:00 AM MST)
	assert.equal(
		formatVolunteerSchedule(
			'2026-11-24T05:00:00+00:00',
			'2026-11-24T08:00:00+00:00',
			'America/Phoenix'
		),
		'Monday, November 23, 2026 10:00 PM → Tuesday, November 24, 2026 1:00 AM'
	);
});
