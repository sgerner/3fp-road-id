import assert from 'node:assert/strict';
import test from 'node:test';
import { US_STATE_OPTIONS } from '#lib/geo/usStates.js';
import {
	containsWholeWord,
	distanceMiles,
	fetchNearbyGroups,
	fetchNearbyRides,
	loadHomepageDiscoveryData,
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

function createQueryChain(resolveRows) {
	const state = {
		filters: [],
		range: null
	};
	const chain = {
		select(columns) {
			state.columns = columns;
			return chain;
		},
		eq(col, val) {
			state.filters.push({ op: 'eq', col, val });
			return chain;
		},
		not(col, op, val) {
			state.filters.push({ op: 'not', col, subOp: op, val });
			return chain;
		},
		gte(col, val) {
			state.filters.push({ op: 'gte', col, val });
			return chain;
		},
		lte(col, val) {
			state.filters.push({ op: 'lte', col, val });
			return chain;
		},
		order() {
			return chain;
		},
		limit(count) {
			state.limit = count;
			return Promise.resolve(resolveRows(state));
		},
		range(from, to) {
			state.range = [from, to];
			return Promise.resolve(resolveRows(state));
		}
	};
	return chain;
}

test('loadHomepageDiscoveryData and fetchNearby* fall back to PostgREST queries before supabase db push (PGRST202)', async () => {
	const groupCatalog = [
		{
			id: 'g-omaha',
			slug: 'omaha-velo',
			name: 'Omaha Velo',
			city: 'Omaha',
			state_region: 'NE',
			country: 'US',
			cover_photo_url: 'https://example.com/omaha.jpg',
			latitude: 41.2565,
			longitude: -95.9345,
			is_published: true
		},
		{
			id: 'g-dsm',
			slug: 'des-moines-cycle',
			name: 'Des Moines Cycle',
			city: 'Des Moines',
			state_region: 'IA',
			country: 'US',
			cover_photo_url: 'https://example.com/dsm.jpg',
			latitude: 41.5868,
			longitude: -93.625,
			is_published: true
		},
		{
			id: 'g-far',
			slug: 'seattle-club',
			name: 'Seattle Club',
			city: 'Seattle',
			state_region: 'WA',
			country: 'US',
			cover_photo_url: 'https://example.com/sea.jpg',
			latitude: 47.6062,
			longitude: -122.3321,
			is_published: true
		}
	];

	const rideCatalog = [
		{
			id: 'r-andalusia',
			title: 'Andalusia Cycling Tour',
			slug: 'andalusia-tour',
			start_location_name: 'Andalusia, Spain',
			start_location_address: 'Seville, Andalusia, Spain',
			start_latitude: 37.3891,
			start_longitude: -5.9845,
			next_occurrence_start: '2026-12-01T09:00:00Z',
			next_occurrence_end: '2026-12-01T12:00:00Z',
			ride_details: { image_urls: [] },
			group: null
		},
		{
			id: 'r-local-host-coords',
			title: 'Wabash Trace Sunset Ride',
			slug: 'wabash-trace',
			start_location_name: 'Trailhead',
			start_location_address: 'Council Bluffs, IA',
			start_latitude: null,
			start_longitude: null,
			next_occurrence_start: '2026-12-02T09:00:00Z',
			next_occurrence_end: '2026-12-02T11:00:00Z',
			ride_details: [{ image_urls: ['https://example.com/wabash.jpg'] }],
			group: {
				id: 'g-omaha',
				slug: 'omaha-velo',
				name: 'Omaha Velo',
				city: 'Omaha',
				state_region: 'NE',
				country: 'US',
				latitude: 41.2565,
				longitude: -95.9345,
				is_published: true
			}
		},
		{
			id: 'r-unpublished-group',
			title: 'Draft Host Group Spin',
			slug: 'draft-host',
			start_location_name: 'Unknown',
			start_location_address: null,
			start_latitude: null,
			start_longitude: null,
			next_occurrence_start: '2026-12-02T08:00:00Z',
			next_occurrence_end: '2026-12-02T10:00:00Z',
			ride_details: [],
			group: {
				id: 'g-hidden',
				slug: 'hidden-club',
				name: 'Hidden Club',
				city: 'Council Bluffs',
				state_region: 'IA',
				country: 'US',
				latitude: 41.2619,
				longitude: -95.8608,
				is_published: false
			}
		}
	];

	const preMigrationSupabase = {
		rpc: async (fnName) => ({
			data: null,
			error: {
				code: 'PGRST202',
				message: `Could not find the function public.${fnName} in the schema cache`
			}
		}),
		from: (table) =>
			createQueryChain((state) => {
				if (table === 'groups') {
					let rows = groupCatalog.filter((row) => row.is_published);
					for (const f of state.filters) {
						if (f.op === 'gte' && f.col === 'latitude') {
							rows = rows.filter((r) => r.latitude !== null && r.latitude >= f.val);
						}
						if (f.op === 'lte' && f.col === 'latitude') {
							rows = rows.filter((r) => r.latitude !== null && r.latitude <= f.val);
						}
					}
					if (state.range) {
						rows = rows.slice(state.range[0], state.range[1] + 1);
					} else if (state.limit) {
						rows = rows.slice(0, state.limit);
					}
					return { data: rows, error: null };
				}
				if (table === 'activity_events') {
					const rows = state.range
						? rideCatalog.slice(state.range[0], state.range[1] + 1)
						: rideCatalog.slice(0, state.limit || rideCatalog.length);
					return { data: rows, error: null };
				}
				return { data: [], error: null };
			})
	};

	const visitor = {
		city: 'Council Bluffs',
		region: 'IA',
		stateRegion: 'IA',
		country: 'US',
		label: 'Council Bluffs, IA',
		latitude: 41.2619,
		longitude: -95.8608,
		source: 'approximate',
		hasCoordinates: true,
		hasLocalScope: true
	};

	const result = await loadHomepageDiscoveryData({
		supabase: preMigrationSupabase,
		visitorLocation: visitor,
		siteOrigin: 'https://3fp.org',
		nowIso: '2026-11-25T00:00:00Z'
	});

	assert.equal(result.locationSource, 'approximate');
	assert.equal(result.area, 'Council Bluffs, IA');
	assert.equal(result.groupsHref, '/groups?country=US&state_region=IA');
	assert.deepEqual(
		result.localGroups.map((g) => g.id),
		['g-omaha', 'g-dsm']
	);
	assert.equal(result.rideSource, 'local');
	assert.deepEqual(
		result.localRides.map((r) => r.id),
		['r-local-host-coords']
	);
});

test('fetchNearbyGroups pre-migration fallback pages across >1,000 published groups without truncation', async () => {
	const largeCatalog = [];
	for (let i = 0; i < 1050; i += 1) {
		largeCatalog.push({
			id: `ie-${i}`,
			slug: `ie-${i}`,
			name: `Ireland Club ${i}`,
			city: 'Dublin',
			state_region: 'Leinster',
			country: 'IE',
			is_published: true
		});
	}
	largeCatalog.push({
		id: 'ia-1051',
		slug: 'loess-hills',
		name: 'Loess Hills Riders',
		city: 'Council Bluffs',
		state_region: 'Iowa',
		country: 'US',
		is_published: true
	});

	let rangeCalls = 0;
	const mockSupabase = {
		rpc: async () => ({
			data: null,
			error: { code: 'PGRST202', message: 'function match_nearby_groups does not exist' }
		}),
		from: () =>
			createQueryChain((state) => {
				rangeCalls += 1;
				const [from, to] = state.range;
				return { data: largeCatalog.slice(from, to + 1), error: null };
			})
	};

	const res = await fetchNearbyGroups(
		mockSupabase,
		{
			city: 'Council Bluffs',
			region: 'IA',
			stateRegion: 'IA',
			country: 'US',
			latitude: null,
			longitude: null,
			source: 'approximate',
			hasCoordinates: false,
			hasLocalScope: true
		},
		{ limit: 3 }
	);

	assert.equal(rangeCalls, 2);
	assert.equal(res.error, null);
	assert.deepEqual(
		res.data.map((g) => g.id),
		['ia-1051']
	);
});

test('loadHomepageDiscoveryData degrades to featuredGroups instead of 0 local groups when proximity lookup errors', async () => {
	const featured = [
		{
			id: 'feat-1',
			slug: 'featured-velo',
			name: 'Featured Velo',
			city: 'Tempe',
			state_region: 'AZ',
			country: 'US',
			cover_photo_url: 'https://example.com/feat.jpg'
		}
	];

	const failingNearbySupabase = {
		rpc: async () => ({
			data: null,
			error: { code: 'XX000', message: 'RPC unavailable' }
		}),
		from: (table) =>
			createQueryChain((state) => {
				if (table === 'groups' && state.range) {
					return { data: null, error: { code: 'XX000', message: 'Fallback failed' } };
				}
				if (table === 'groups') {
					return { data: featured, error: null };
				}
				return { data: [], error: null };
			})
	};

	const visitor = {
		city: 'Council Bluffs',
		region: 'IA',
		stateRegion: 'IA',
		country: 'US',
		label: 'Council Bluffs, IA',
		latitude: 41.2619,
		longitude: -95.8608,
		source: 'profile',
		hasCoordinates: true,
		hasLocalScope: true
	};

	const degraded = await loadHomepageDiscoveryData({
		supabase: failingNearbySupabase,
		visitorLocation: visitor,
		siteOrigin: 'https://3fp.org'
	});

	// Because nearby lookup errored, locationSource must clear to null so +page.svelte
	// renders featuredGroups instead of an empty "No group has claimed this area yet" state.
	assert.equal(degraded.locationSource, null);
	assert.equal(degraded.area, '');
	assert.deepEqual(degraded.featuredGroups, featured);
	assert.equal(degraded.groupsHref, '/groups?country=US&state_region=IA');
});
