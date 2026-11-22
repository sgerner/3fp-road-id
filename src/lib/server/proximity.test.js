import assert from 'node:assert/strict';
import test from 'node:test';
import { US_STATE_OPTIONS } from '#lib/geo/usStates.js';
import {
	containsWholeWord,
	distanceMiles,
	fetchNearbyGroups,
	fetchNearbyRides,
	matchNearbyGroupsInMemory,
	matchNearbyRidesInMemory
} from './proximity.js';

test('distanceMiles enforces strict 250-mile radius and does not fall back to region text when visitor coordinates exist', () => {
	const visitor = {
		city: 'Council Bluffs',
		region: 'IA',
		stateRegion: 'IA',
		country: 'US',
		latitude: 41.2619,
		longitude: -95.8608,
		hasCoordinates: true,
		hasLocalScope: true
	};

	const groups = [
		{
			id: 'g-omaha',
			name: 'Omaha Velo',
			city: 'Omaha',
			state_region: 'NE',
			country: 'US',
			latitude: 41.2565,
			longitude: -95.9345
		},
		{
			id: 'g-dsm',
			name: 'Des Moines Cycle',
			city: 'Des Moines',
			state_region: 'Iowa',
			country: 'US',
			latitude: 41.5868,
			longitude: -93.625
		},
		{
			id: 'g-dubuque',
			name: 'Dubuque Outside 250',
			city: 'Dubuque',
			state_region: 'IA',
			country: 'US',
			latitude: 42.5006,
			longitude: -90.6646
		},
		{
			id: 'g-no-coords',
			name: 'Ungeocoded Iowa Club',
			city: 'Council Bluffs',
			state_region: 'IA',
			country: 'US',
			latitude: null,
			longitude: null
		}
	];

	assert.ok(distanceMiles(visitor, groups[0]) < 10);
	assert.ok(distanceMiles(visitor, groups[2]) > 250);

	const matched = matchNearbyGroupsInMemory(groups, visitor, { maxMiles: 250, limit: 10 });
	assert.deepEqual(
		matched.map((g) => g.id),
		['g-omaha', 'g-dsm']
	);
});

test('fallback matching excludes overseas Andalusia, Spain rides, country-only ties, West Virginia vs Virginia, and Washington, DC vs WA', () => {
	const rides = [
		{
			id: 'r-andalusia',
			title: 'Andalusia Cycling Tour',
			slug: 'andalusia-tour',
			startLocationName: 'Andalusia, Spain',
			startLocationAddress: 'Seville, Andalusia, Spain',
			startLatitude: 37.3891,
			startLongitude: -5.9845,
			nextOccurrenceStart: '2026-12-01T09:00:00Z'
		},
		{
			id: 'r-toledo-es',
			title: 'Toledo Climb',
			slug: 'toledo-climb',
			startLocationName: 'Toledo, Spain',
			startLocationAddress: 'Toledo, Spain',
			startLatitude: 39.8628,
			startLongitude: -4.0273,
			nextOccurrenceStart: '2026-12-01T10:00:00Z'
		},
		{
			id: 'r-iowa',
			title: 'Wabash Trace Ride',
			slug: 'wabash-trace',
			startLocationName: 'Trailhead',
			startLocationAddress: 'Council Bluffs, IA 51503',
			startLatitude: 41.23,
			startLongitude: -95.85,
			nextOccurrenceStart: '2026-12-02T09:00:00Z'
		},
		{
			id: 'r-dc',
			title: 'Capitol Hill Spin',
			slug: 'capitol-hill',
			startLocationName: 'National Mall',
			startLocationAddress: '1600 Pennsylvania Ave, Washington, DC 20500',
			startLatitude: 38.8977,
			startLongitude: -77.0365,
			nextOccurrenceStart: '2026-12-02T10:00:00Z'
		},
		{
			id: 'r-wv',
			title: 'Charleston River Ride',
			slug: 'charleston-wv',
			startLocationName: 'Capitol Market',
			startLocationAddress: 'Charleston, West Virginia',
			startLatitude: 38.3498,
			startLongitude: -81.6326,
			nextOccurrenceStart: '2026-12-02T11:00:00Z'
		}
	];

	assert.equal(containsWholeWord('Andalusia, Spain', 'IA'), false);
	assert.equal(containsWholeWord('Council Bluffs, IA', 'IA'), true);
	assert.equal(containsWholeWord('Charleston, West Virginia', 'Virginia'), false);
	assert.equal(containsWholeWord('Richmond, Virginia', 'Virginia'), true);

	// Council Bluffs, IA header without coordinates matches ONLY Iowa ride, never Andalusia, Spain
	const iowaMatches = matchNearbyRidesInMemory(rides, {
		city: 'Council Bluffs',
		region: 'IA',
		stateRegion: 'IA',
		country: 'US',
		latitude: null,
		longitude: null
	});
	assert.deepEqual(
		iowaMatches.map((r) => r.id),
		['r-iowa']
	);

	// Toledo, OH without coordinates excludes Toledo, Spain
	assert.deepEqual(
		matchNearbyRidesInMemory(rides, {
			city: 'Toledo',
			region: 'OH',
			stateRegion: 'OH',
			country: 'US',
			latitude: null,
			longitude: null
		}),
		[]
	);

	// WA state without coordinates excludes Washington, DC
	assert.deepEqual(
		matchNearbyRidesInMemory(rides, {
			city: 'Seattle',
			region: 'WA',
			stateRegion: 'WA',
			country: 'US',
			latitude: null,
			longitude: null
		}),
		[]
	);

	// VA without coordinates excludes West Virginia
	assert.deepEqual(
		matchNearbyRidesInMemory(rides, {
			city: 'Richmond',
			region: 'VA',
			stateRegion: 'VA',
			country: 'US',
			latitude: null,
			longitude: null
		}),
		[]
	);

	// Country-only header returns 0 local matches
	assert.deepEqual(
		matchNearbyRidesInMemory(rides, {
			city: '',
			region: '',
			stateRegion: '',
			country: 'US',
			latitude: null,
			longitude: null
		}),
		[]
	);
});

test('all 50 US states return eligible local groups across a 1,055-group catalog without 200 or 500 row truncation', () => {
	const fiftyStates = US_STATE_OPTIONS.filter((s) => s.code !== 'DC' && s.code !== 'PR');
	assert.equal(fiftyStates.length, 50);

	const catalog = [];
	for (let i = 0; i < 1005; i += 1) {
		catalog.push({
			id: `filler-${i}`,
			slug: `filler-${i}`,
			name: `Filler ${i}`,
			city: 'Dublin',
			state_region: 'Leinster',
			country: 'IE',
			is_published: true
		});
	}
	fiftyStates.forEach((state, idx) => {
		catalog.push({
			id: `state-${state.code}`,
			slug: `club-${state.code.toLowerCase()}`,
			name: `${state.name} Cycling Club`,
			city: 'Metro',
			state_region: idx % 2 === 0 ? state.code : state.name,
			country: 'US',
			is_published: true
		});
	});
	assert.equal(catalog.length, 1055);

	for (const state of fiftyStates) {
		const res = matchNearbyGroupsInMemory(
			catalog,
			{
				city: '',
				region: state.code,
				stateRegion: state.code,
				country: 'US',
				latitude: null,
				longitude: null
			},
			{ limit: 3 }
		);
		assert.equal(res.length, 1, `Expected 1 group for ${state.code}`);
		assert.equal(res[0].id, `state-${state.code}`);
	}
});

test('fetchNearbyGroups and fetchNearbyRides pass normalized RPC arguments and format ride rows', async () => {
	const calls = [];
	const mockSupabase = {
		rpc: async (fnName, params) => {
			calls.push({ fnName, params });
			if (fnName === 'match_nearby_groups') {
				return {
					data: [{ id: 'g1', slug: 'omaha-velo', name: 'Omaha Velo', distance_miles: 5.2 }],
					error: null
				};
			}
			return {
				data: [
					{
						id: 'r1',
						title: 'Morning Spin',
						slug: 'morning-spin',
						start_location_name: 'Trailhead',
						start_location_address: 'Council Bluffs, IA',
						start_latitude: 41.26,
						start_longitude: -95.86,
						next_occurrence_start: '2026-12-01T14:00:00Z',
						next_occurrence_end: '2026-12-01T16:00:00Z',
						image_urls: ['https://example.com/ride.jpg'],
						group_id: 'g1',
						group_slug: 'omaha-velo',
						group_name: 'Omaha Velo',
						group_city: 'Omaha',
						group_state_region: 'NE',
						group_country: 'US',
						distance_miles: 1.4,
						match_score: 29.86
					}
				],
				error: null
			};
		}
	};

	const visitor = {
		city: 'Council Bluffs',
		region: 'IA',
		stateRegion: 'IA',
		country: 'US',
		latitude: 41.2619,
		longitude: -95.8608,
		hasCoordinates: true,
		hasLocalScope: true
	};

	const groupsRes = await fetchNearbyGroups(mockSupabase, visitor, { maxMiles: 250, limit: 3 });
	const ridesRes = await fetchNearbyRides(mockSupabase, visitor, { maxMiles: 250, limit: 2 });

	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0], {
		fnName: 'match_nearby_groups',
		params: {
			p_lat: 41.2619,
			p_lon: -95.8608,
			p_city: 'Council Bluffs',
			p_region: 'IA',
			p_country: 'US',
			p_max_miles: 250,
			p_limit: 3
		}
	});
	assert.equal(groupsRes.data.length, 1);
	assert.equal(ridesRes.data.length, 1);
	assert.equal(ridesRes.data[0].startLocationName, 'Trailhead');
	assert.equal(ridesRes.data[0].group?.slug, 'omaha-velo');
	assert.equal(ridesRes.data[0].distanceMiles, 1.4);
});
