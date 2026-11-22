import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildHostGroupOptions,
	buildOccurrenceDraft,
	filterHostGroupOptions,
	toLocalDateTimeValue
} from '#lib/rides/editorHelpers.js';

test('buildOccurrenceDraft returns null when occurrence is empty or undefined', () => {
	assert.equal(buildOccurrenceDraft(undefined), null);
	assert.equal(buildOccurrenceDraft(null), null);
});

test('buildOccurrenceDraft maps occurrence fields into an editable draft', () => {
	const occurrence = {
		id: 'occ-42',
		title_override: 'Holiday pace edition',
		starts_at: '2026-11-25T15:30:00.000Z',
		ends_at: '2026-11-25T17:00:00.000Z',
		status: 'scheduled',
		start_location_name: 'Civic Space Park',
		start_location_address: '424 N Central Ave, Phoenix, AZ',
		end_location_name: '',
		end_location_address: null
	};

	assert.deepEqual(buildOccurrenceDraft(occurrence), {
		id: 'occ-42',
		titleOverride: 'Holiday pace edition',
		startsAt: toLocalDateTimeValue(occurrence.starts_at),
		endsAt: toLocalDateTimeValue(occurrence.ends_at),
		status: 'scheduled',
		startLocationName: 'Civic Space Park',
		startLocationAddress: '424 N Central Ave, Phoenix, AZ',
		endLocationName: '',
		endLocationAddress: ''
	});
});

test('filterHostGroupOptions keeps empty array on unmatched search instead of restoring all groups', () => {
	const groups = Array.from({ length: 400 }, (_, index) => ({
		id: `group-${index + 1}`,
		name: index === 12 ? 'Phoenix Spokes People' : `Cycling Club ${index + 1}`,
		slug: index === 12 ? 'phoenix-spokes-people' : `cycling-club-${index + 1}`
	}));
	const options = buildHostGroupOptions(groups);

	assert.equal(filterHostGroupOptions(options, '').length, 400);
	assert.equal(filterHostGroupOptions(options, '   ').length, 400);

	const byName = filterHostGroupOptions(options, 'spokes');
	assert.deepEqual(
		byName.map((item) => item.value),
		['group-13']
	);

	const bySlug = filterHostGroupOptions(options, 'PHOENIX-SPOKES');
	assert.deepEqual(
		bySlug.map((item) => item.value),
		['group-13']
	);

	const unmatched = filterHostGroupOptions(options, 'zzzz-nonexistent-org');
	assert.deepEqual(unmatched, []);
});
