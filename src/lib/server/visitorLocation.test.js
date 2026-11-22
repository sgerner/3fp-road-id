import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildGroupsDirectoryHref,
	expandRegionCandidates,
	normalizeCountryCode,
	normalizeRegionCode,
	parseProfileLocation,
	readNetworkLocation,
	resolveVisitorLocation,
	shouldSkipVisitorLocation
} from './visitorLocation.js';
import { resolveGroupsDirectoryScope } from './proximity.js';

test('readNetworkLocation parses edge coordinates and region headers and excludes country-only headers from local scope', () => {
	const withCoords = readNetworkLocation(
		new Headers({
			'cf-ipcity': 'Council%20Bluffs',
			'cf-region-code': 'IA',
			'cf-ipcountry': 'US',
			'cf-iplatitude': '41.2619',
			'cf-iplongitude': '-95.8608'
		})
	);
	assert.equal(withCoords.city, 'Council Bluffs');
	assert.equal(withCoords.stateRegion, 'IA');
	assert.equal(withCoords.country, 'US');
	assert.equal(withCoords.latitude, 41.2619);
	assert.equal(withCoords.longitude, -95.8608);
	assert.equal(withCoords.hasCoordinates, true);
	assert.equal(withCoords.hasLocalScope, true);
	assert.equal(withCoords.source, 'approximate');
	assert.equal(withCoords.label, 'Council Bluffs, IA');

	const countryOnly = readNetworkLocation(
		new Headers({
			'cf-ipcountry': 'US'
		})
	);
	assert.equal(countryOnly.country, 'US');
	assert.equal(countryOnly.hasCoordinates, false);
	assert.equal(countryOnly.hasLocalScope, false);
	assert.equal(countryOnly.source, null);
	assert.equal(countryOnly.label, '');

	const invalidCountryAndCoords = readNetworkLocation(
		new Headers({
			'cf-ipcountry': 'XX',
			'cf-iplatitude': '195',
			'cf-iplongitude': '-95.8'
		})
	);
	assert.equal(invalidCountryAndCoords.country, '');
	assert.equal(invalidCountryAndCoords.latitude, null);
	assert.equal(invalidCountryAndCoords.longitude, null);
	assert.equal(invalidCountryAndCoords.hasLocalScope, false);
});

test('resolveVisitorLocation prioritizes saved profile preferences over edge headers and parses geocoded labels', async () => {
	const event = {
		request: new Request('https://3fp.org/groups', {
			headers: {
				'x-vercel-ip-city': 'Omaha',
				'x-vercel-ip-country-region': 'NE',
				'x-vercel-ip-country': 'US',
				'x-vercel-ip-latitude': '41.2565',
				'x-vercel-ip-longitude': '-95.9345'
			}
		}),
		cookies: { get: () => 'mock' }
	};

	const resolvedProfile = await resolveVisitorLocation(event, {
		loadUserProfile: async () => ({
			recommendation_context: {
				location: 'Phoenix, AZ',
				home_location: {
					label: 'Phoenix, Maricopa County, Arizona, United States',
					latitude: 33.4484,
					longitude: -112.074
				}
			}
		})
	});
	assert.equal(resolvedProfile.source, 'profile');
	assert.equal(resolvedProfile.city, 'Phoenix');
	assert.equal(resolvedProfile.stateRegion, 'AZ');
	assert.equal(resolvedProfile.country, 'US');
	assert.equal(resolvedProfile.latitude, 33.4484);
	assert.equal(resolvedProfile.longitude, -112.074);
	assert.equal(buildGroupsDirectoryHref(resolvedProfile), '/groups?country=US&state_region=AZ');

	const resolvedFallback = await resolveVisitorLocation(event, {
		loadUserProfile: async () => ({ recommendation_context: { location: '' } })
	});
	assert.equal(resolvedFallback.source, 'approximate');
	assert.equal(resolvedFallback.city, 'Omaha');
	assert.equal(resolvedFallback.stateRegion, 'NE');
	assert.equal(resolvedFallback.country, 'US');
});

test('parseProfileLocation handles Canadian and Australian subdivisions', () => {
	const ca = parseProfileLocation({
		recommendation_context: {
			location: 'Toronto, Ontario, Canada',
			home_location: { label: 'Toronto, Ontario, Canada', latitude: null, longitude: null }
		}
	});
	assert.equal(ca?.country, 'CA');
	assert.equal(ca?.stateRegion, 'ON');
	assert.equal(buildGroupsDirectoryHref(ca), '/groups?country=CA&state_region=ON');

	assert.equal(normalizeCountryCode('United Kingdom'), 'GB');
	assert.equal(normalizeRegionCode('US', 'US-IA'), 'IA');
	assert.deepEqual(expandRegionCandidates('US', 'ia'), ['IA', 'Iowa']);
});

test('shouldSkipVisitorLocation skips partner microsites, static assets, and API routes while keeping page and data loads', () => {
	assert.equal(
		shouldSkipVisitorLocation(
			{
				url: new URL('https://biketempe.3fp.bike/'),
				route: { id: '/' },
				request: new Request('https://biketempe.3fp.bike/')
			},
			{ micrositeSlug: 'biketempe' }
		),
		true
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/biketempe'),
			route: { id: '/[siteSlug]' },
			request: new Request('https://3fp.org/biketempe')
		}),
		true
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/_app/immutable/entry.js'),
			route: { id: null },
			request: new Request('https://3fp.org/_app/immutable/entry.js')
		}),
		true
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/images/default-ride.webp'),
			route: { id: null },
			request: new Request('https://3fp.org/images/default-ride.webp')
		}),
		true
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/api/rides'),
			route: { id: '/api/rides' },
			request: new Request('https://3fp.org/api/rides')
		}),
		true
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/groups'),
			route: { id: '/groups' },
			request: new Request('https://3fp.org/groups')
		}),
		false
	);
	assert.equal(
		shouldSkipVisitorLocation({
			url: new URL('https://3fp.org/groups/__data.json'),
			route: { id: '/groups' },
			request: new Request('https://3fp.org/groups/__data.json')
		}),
		false
	);
});

test('resolveGroupsDirectoryScope enforces private, no-store cache headers on implicit visitor proximity and yields to explicit URL params and Clear', () => {
	const visitorLocation = {
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

	// Direct visit to /groups applies visitorLocation and sets private, no-store
	const directScope = resolveGroupsDirectoryScope({
		url: new URL('https://3fp.org/groups'),
		visitorLocation
	});
	assert.equal(directScope.proximityActive, true);
	assert.equal(directScope.sort, 'proximity');
	assert.equal(directScope.shouldSetPrivateNoStore, true);
	assert.equal(directScope.proximityLabel, 'Council Bluffs, IA');

	// Homepage CTA with explicit country & state_region overrides middleware default cleanly
	const filteredScope = resolveGroupsDirectoryScope({
		url: new URL('https://3fp.org/groups?country=US&state_region=IA'),
		visitorLocation
	});
	assert.equal(filteredScope.proximityActive, false);
	assert.equal(filteredScope.sort, 'name');
	assert.equal(filteredScope.shouldSetPrivateNoStore, false);
	assert.equal(filteredScope.country, 'US');
	assert.equal(filteredScope.state_region, 'IA');

	// Clear action (?sort=name) overrides middleware default cleanly
	const clearedScope = resolveGroupsDirectoryScope({
		url: new URL('https://3fp.org/groups?sort=name'),
		visitorLocation
	});
	assert.equal(clearedScope.proximityActive, false);
	assert.equal(clearedScope.sort, 'name');
	assert.equal(clearedScope.shouldSetPrivateNoStore, false);

	// Country-only visitor does not trigger local proximity sort or private cache header
	const countryOnlyScope = resolveGroupsDirectoryScope({
		url: new URL('https://3fp.org/groups'),
		visitorLocation: {
			city: '',
			region: '',
			stateRegion: '',
			country: 'US',
			label: '',
			latitude: null,
			longitude: null,
			source: null,
			hasCoordinates: false,
			hasLocalScope: false
		}
	});
	assert.equal(countryOnlyScope.proximityActive, false);
	assert.equal(countryOnlyScope.shouldSetPrivateNoStore, false);
});
