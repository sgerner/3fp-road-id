import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyLearnUrlState,
	applyRideUrlState,
	applyVolunteerUrlState,
	buildRideApiSearchParams,
	formatMonthParam,
	hasServerRideFilterParams,
	parseLearnUrlState,
	parseMonthParam,
	parseRideUrlState,
	parseVolunteerUrlState
} from '#lib/url/directoryUrlState.js';

test('parseRideUrlState and applyRideUrlState round-trip state and omit defaults', () => {
	const defaultMonth = parseMonthParam('2026-11');
	const customMonth = parseMonthParam('2027-02');

	const cleanUrl = applyRideUrlState('https://3fp.org/ride?q=gravel&view=calendar&page=2', {
		q: '',
		difficulty: 'all',
		needsHost: false,
		view: 'list',
		page: 1,
		monthDate: defaultMonth,
		defaultMonthDate: defaultMonth,
		monthTouched: false
	});
	assert.equal(cleanUrl.toString(), 'https://3fp.org/ride');

	const activeUrl = applyRideUrlState('https://3fp.org/ride?auth=required', {
		q: '  century  ',
		difficulty: 'Challenging',
		needsHost: true,
		view: 'calendar',
		page: 3,
		monthDate: customMonth,
		defaultMonthDate: defaultMonth,
		monthTouched: true
	});
	assert.equal(
		activeUrl.toString(),
		'https://3fp.org/ride?auth=required&q=century&difficulty=Challenging&needsHost=1&view=calendar&page=3&month=2027-02'
	);

	const parsed = parseRideUrlState(activeUrl.searchParams, {
		difficultyOptions: ['Beginner', 'Casual', 'Challenging']
	});
	assert.equal(parsed.q, 'century');
	assert.equal(parsed.difficulty, 'Challenging');
	assert.equal(parsed.needsHost, true);
	assert.equal(parsed.view, 'calendar');
	assert.equal(parsed.page, 3);
	assert.equal(parsed.month, '2027-02');
	assert.equal(formatMonthParam(parsed.monthDate), '2027-02');
});

test('buildRideApiSearchParams forwards filter params while ignoring UI-only params', () => {
	const uiOnly = new URLSearchParams('view=map&page=4&month=2027-03&auth=required');
	assert.equal(hasServerRideFilterParams(uiOnly), false);
	assert.equal(buildRideApiSearchParams(uiOnly).toString(), '');

	const withFilters = new URLSearchParams(
		'q=desert+loop&difficulty=Casual&needsHost=1&view=calendar&page=2'
	);
	assert.equal(hasServerRideFilterParams(withFilters), true);
	assert.equal(
		buildRideApiSearchParams(withFilters).toString(),
		'search=desert+loop&difficulty=Casual&needs_host=1'
	);
});

test('applyVolunteerUrlState preserves group paths and reserved params on update and clear', () => {
	const base =
		'https://3fp.org/volunteer/groups/tempe-bicycle-action-group?auth=required&returnTo=%2Fvolunteer%2Fhosted';
	const defaultMonth = parseMonthParam('2026-11');
	const nextMonth = parseMonthParam('2026-12');

	const filtered = applyVolunteerUrlState(base, {
		search: 'trail cleanup',
		location: 'Tempe, AZ',
		hostGroupId: '42',
		eventType: 'stewardship',
		view: 'calendar',
		monthDate: nextMonth,
		defaultMonthDate: defaultMonth,
		monthTouched: true
	});
	assert.equal(filtered.pathname, '/volunteer/groups/tempe-bicycle-action-group');
	assert.equal(filtered.searchParams.get('auth'), 'required');
	assert.equal(filtered.searchParams.get('returnTo'), '/volunteer/hosted');

	const restored = parseVolunteerUrlState(filtered.searchParams);
	assert.deepEqual(
		{
			search: restored.search,
			location: restored.location,
			hostGroupId: restored.hostGroupId,
			eventType: restored.eventType,
			view: restored.view,
			month: restored.month
		},
		{
			search: 'trail cleanup',
			location: 'Tempe, AZ',
			hostGroupId: '42',
			eventType: 'stewardship',
			view: 'calendar',
			month: '2026-12'
		}
	);

	const cleared = applyVolunteerUrlState(filtered, {
		search: '',
		location: '',
		hostGroupId: '',
		eventType: '',
		view: 'list',
		monthDate: defaultMonth,
		defaultMonthDate: defaultMonth,
		monthTouched: false
	});
	assert.equal(
		cleared.toString(),
		'https://3fp.org/volunteer/groups/tempe-bicycle-action-group?auth=required&returnTo=%2Fvolunteer%2Fhosted'
	);
});

test('parseLearnUrlState and applyLearnUrlState sync q, category, and visibleCount while preserving auth=required', () => {
	const base = 'https://3fp.org/learn?auth=required&returnTo=%2Flearn%2Fnew';
	const expanded = applyLearnUrlState(base, {
		search: 'commute',
		category: 'Safety',
		visibleCount: 36,
		pageSize: 12
	});
	assert.equal(
		expanded.toString(),
		'https://3fp.org/learn?auth=required&returnTo=%2Flearn%2Fnew&q=commute&category=Safety&page=3'
	);

	const restored = parseLearnUrlState(expanded.searchParams, {
		pageSize: 12,
		categoryPairs: [['Safety', 'safety']]
	});
	assert.deepEqual(restored, {
		search: 'commute',
		category: 'Safety',
		page: 3,
		visibleCount: 36
	});

	const cleared = applyLearnUrlState(expanded, {
		search: '',
		category: 'all',
		visibleCount: 12,
		pageSize: 12
	});
	assert.equal(cleared.toString(), base);
});
