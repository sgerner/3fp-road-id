import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import {
	extractRideCity,
	extractRideState,
	formatRideCardLocation
} from '../rides/widgetConfig.js';
import { parseBtwPhxCalendarData } from './btwphx-imports.js';
import { mapGroupEventToSeedEvent } from './meetup-topic-imports.js';
import { fetchExistingRideEventsBySourceId, importRideSeedData } from './ride-imports.js';
import { normalizeRideListRow, queryPublishedUpcomingRides } from './rideDirectory.js';
import {
	insertRideDetailsCompat,
	isMissingExternalRideColumnsError,
	isValidExternalEventUrlInput,
	normalizeRidePayload,
	resolveExternalRideMetadata,
	updateRideDetailsCompat
} from './ridePayload.js';
import { parseWeeklyRidesRssFeed } from './weeklyrides-imports.js';

function createSourceLookupSupabase(rows) {
	const queries = [];
	return {
		queries,
		supabase: {
			from(table) {
				assert.equal(table, 'activity_events');
				return {
					select(columns) {
						assert.equal(
							columns,
							'id,slug,title,source_event_id,start_latitude,start_longitude,ride_details(image_urls)'
						);
						return {
							in: async (column, values) => {
								queries.push({ column, values });
								return {
									data: rows.filter((row) => values.includes(row.source_event_id)),
									error: null
								};
							}
						};
					}
				};
			}
		}
	};
}

test('fetchExistingRideEventsBySourceId matches exact source IDs by default', async () => {
	const sourceId = 'https://meetup.example/index.php/rides-events/example';
	const aliasId = 'https://meetup.example/index.php/rides/rides-events-card-view/example';
	const { queries, supabase } = createSourceLookupSupabase([
		{
			id: 'activity-1',
			slug: 'sample-ride',
			title: 'Sample Ride',
			source_event_id: sourceId,
			start_latitude: 33.4,
			start_longitude: -112.1,
			ride_details: [{ image_urls: ['existing.jpg'] }]
		},
		{
			id: 'activity-alias',
			slug: 'sample-ride-alias',
			title: 'Sample Ride Alias',
			source_event_id: aliasId,
			ride_details: { image_urls: [] }
		}
	]);

	const existing = await fetchExistingRideEventsBySourceId(supabase, [sourceId, sourceId]);

	assert.deepEqual(queries, [{ column: 'source_event_id', values: [sourceId] }]);
	assert.equal(existing.size, 1);
	assert.deepEqual(existing.get(sourceId), {
		sourceEventId: sourceId,
		activityId: 'activity-1',
		slug: 'sample-ride',
		title: 'Sample Ride',
		start_latitude: 33.4,
		start_longitude: -112.1,
		hasImage: true
	});
});

test('fetchExistingRideEventsBySourceId maps WeeklyRides URL aliases to feed IDs', async () => {
	const feedSourceId = 'https://calendar.example.test/index.php/rides-events/example';
	const storedSourceId =
		'https://calendar.example.test/index.php/rides/rides-events-card-view/example';
	const { queries, supabase } = createSourceLookupSupabase([
		{
			id: 'activity-weeklyrides',
			slug: 'weekly-ride',
			title: 'Weekly Ride',
			source_event_id: storedSourceId,
			start_latitude: null,
			start_longitude: null,
			ride_details: { image_urls: [] }
		}
	]);

	const existing = await fetchExistingRideEventsBySourceId(supabase, [feedSourceId], {
		includeWeeklyRidesAliases: true
	});

	assert.deepEqual(queries, [
		{ column: 'source_event_id', values: [feedSourceId, storedSourceId] }
	]);
	assert.equal(existing.get(feedSourceId)?.activityId, 'activity-weeklyrides');
	assert.equal(existing.get(feedSourceId)?.sourceEventId, storedSourceId);
});

test('fetchExistingRideEventsBySourceId prefers an exact WeeklyRides source ID over an alias', async () => {
	const feedSourceId = 'https://calendar.example.test/index.php/rides-events/example';
	const aliasSourceId =
		'https://calendar.example.test/index.php/rides/rides-events-card-view/example';
	const { supabase } = createSourceLookupSupabase([
		{
			id: 'activity-alias',
			slug: 'weekly-ride-alias',
			title: 'Weekly Ride Alias',
			source_event_id: aliasSourceId
		},
		{
			id: 'activity-exact',
			slug: 'weekly-ride-exact',
			title: 'Weekly Ride Exact',
			source_event_id: feedSourceId
		}
	]);

	const existing = await fetchExistingRideEventsBySourceId(supabase, [feedSourceId], {
		includeWeeklyRidesAliases: true
	});

	assert.equal(existing.get(feedSourceId)?.activityId, 'activity-exact');
});

function createSupabase(existingImageUrls = [], hasExistingRide = true) {
	const imageUpdates = [];
	const coordinateUpdates = [];
	const storedMedia = [];
	const uploadedObjects = [];
	const existingRide = {
		id: 'activity-1',
		slug: 'sample-ride',
		title: 'Sample Ride',
		source_event_id: 'source-1',
		ride_details: { image_urls: existingImageUrls }
	};

	return {
		imageUpdates,
		coordinateUpdates,
		storedMedia,
		uploadedObjects,
		supabase: {
			from(table) {
				if (table === 'activity_events') {
					return {
						select() {
							return {
								eq() {
									return {
										maybeSingle: async () => ({
											data: hasExistingRide ? existingRide : null,
											error: null
										})
									};
								}
							};
						},
						update(payload) {
							return {
								eq(column, value) {
									coordinateUpdates.push({ payload, column, value });
									return Promise.resolve({ error: null });
								}
							};
						}
					};
				}

				if (table === 'ride_details') {
					return {
						upsert(payload) {
							imageUpdates.push({
								payload,
								column: 'activity_event_id',
								value: payload.activity_event_id
							});
							return Promise.resolve({ error: null });
						}
					};
				}

				if (table === 'media_assets') {
					return {
						select() {
							return {
								eq() {
									return {
										eq() {
											return {
												maybeSingle: async () => ({ data: null, error: null })
											};
										}
									};
								}
							};
						},
						upsert(payload) {
							storedMedia.push(payload);
							return {
								select() {
									return {
										single: async () => ({
											data: { id: 'media-1', ...payload },
											error: null
										})
									};
								}
							};
						}
					};
				}

				throw new Error(`Unexpected table: ${table}`);
			},
			storage: {
				from(bucketId) {
					return {
						upload: async (objectPath, buffer, options) => {
							uploadedObjects.push({ bucketId, objectPath, buffer, options });
							return { error: null };
						},
						getPublicUrl(objectPath) {
							return {
								data: {
									publicUrl: `https://storage.example/${bucketId}/${objectPath}`
								}
							};
						}
					};
				}
			}
		}
	};
}

function sourceEvent(overrides = {}) {
	return {
		id: 'source-1',
		title: 'Sample Ride',
		description: 'A ride with a source image.',
		location: 'Phoenix, AZ',
		timezone: 'America/Phoenix',
		startDate: '2026-07-12',
		endDate: '2026-07-12',
		startHour: 8,
		startMinutes: 0,
		endHour: 10,
		endMinutes: 0,
		categories: {},
		image: { url: 'https://images.example/source-1.jpg' },
		...overrides
	};
}

async function importExistingRide(supabase, fetchHttp) {
	return importRideSeedData(
		supabase,
		{ events: [sourceEvent({ startLatitude: 33.4484, startLongitude: -112.074 })] },
		{
			requireGeocoding: false,
			skipGeocoding: true,
			reconcileMissingImages: true,
			fetchHttp
		}
	);
}

test('importRideSeedData fills a missing image on an existing ride', async (t) => {
	const originalFetch = globalThis.fetch;
	const jpeg = await sharp({
		create: { width: 8, height: 8, channels: 3, background: '#ff0000' }
	})
		.jpeg()
		.toBuffer();
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async (url) => {
		assert.equal(url, 'https://images.example/source-1.jpg');
		return new Response(jpeg, {
			status: 200,
			headers: { 'content-type': 'image/jpeg' }
		});
	};

	const { supabase, imageUpdates, storedMedia, uploadedObjects } = createSupabase();
	const result = await importExistingRide(supabase, (url) => globalThis.fetch(url));

	assert.equal(uploadedObjects.length, 1);
	assert.equal(storedMedia.length, 1);
	assert.equal(imageUpdates.length, 1);
	assert.equal(imageUpdates[0].column, 'activity_event_id');
	assert.equal(imageUpdates[0].value, 'activity-1');
	assert.equal(imageUpdates[0].payload.image_urls.length, 1);
	assert.equal(result.reconciledImages.length, 1);
	assert.equal(result.imageFailures.length, 0);
});

test('importRideSeedData keeps an existing ride image unchanged', async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async () => {
		throw new Error('The source image should not be requested.');
	};

	const { supabase, imageUpdates, storedMedia, uploadedObjects } = createSupabase([
		'https://storage.example/ride-media/existing.jpg'
	]);
	const result = await importExistingRide(supabase);

	assert.equal(uploadedObjects.length, 0);
	assert.equal(storedMedia.length, 0);
	assert.equal(imageUpdates.length, 0);
	assert.equal(result.reconciledImages.length, 0);
	assert.equal(result.imageFailures.length, 0);
});

test('importRideSeedData existingOnly mode does not insert source rides', async () => {
	const { supabase, imageUpdates, storedMedia, uploadedObjects } = createSupabase([], false);
	const result = await importRideSeedData(
		supabase,
		{ events: [sourceEvent()] },
		{
			requireGeocoding: false,
			skipGeocoding: true,
			reconcileMissingImages: true,
			existingOnly: true
		}
	);

	assert.equal(uploadedObjects.length, 0);
	assert.equal(storedMedia.length, 0);
	assert.equal(imageUpdates.length, 0);
	assert.deepEqual(result.skippedNotExisting, [
		{ sourceEventId: 'source-1', title: 'Sample Ride' }
	]);
});

test('importRideSeedData updates missing existing coordinates when requested', async () => {
	const { supabase, coordinateUpdates } = createSupabase([], true);
	const result = await importRideSeedData(
		supabase,
		{ events: [sourceEvent({ startLatitude: 33.4484, startLongitude: -112.074 })] },
		{
			requireGeocoding: false,
			skipGeocoding: true,
			skipImageUpload: true,
			existingOnly: true,
			updateExistingCoordinates: true
		}
	);

	assert.equal(coordinateUpdates.length, 1);
	assert.equal(coordinateUpdates[0].column, 'id');
	assert.equal(coordinateUpdates[0].value, 'activity-1');
	assert.deepEqual(result.coordinatesUpdated, [
		{ sourceEventId: 'source-1', activityId: 'activity-1', title: 'Sample Ride' }
	]);
});

test('Meetup import maps real venue, external URL, organizer name, clean description, and null pace_notes', async () => {
	const seedEvent = mapGroupEventToSeedEvent(
		{
			name: 'One Love Cycling',
			urlname: 'one-love-cycling',
			city: 'Sunrise',
			state: 'FL',
			country: 'us',
			timezone: 'America/New_York'
		},
		{
			id: 'vxkztryjcpbcc',
			title: 'One Love Cycling Club Ride',
			description:
				'We meet behind the 7Eleven/Exxon at the Westgate Square Shopping Centre.\n\nRoll out at 7:00am sharp.',
			eventUrl: 'https://www.meetup.com/one-love-cycling/events/vxkztryjcpbcc/',
			dateTime: '2026-11-21T07:00:00-05:00',
			endTime: '2026-11-21T10:00:00-05:00',
			venue: {
				name: 'Westgate Square',
				address: '15810 W State Road 84',
				city: 'Sunrise',
				state: 'FL',
				country: 'us',
				lat: 26.118,
				lon: -80.36
			}
		}
	);

	const result = await importRideSeedData(
		{},
		{ events: [seedEvent] },
		{
			slugPrefix: 'meetup-',
			dryRun: true,
			requireGeocoding: false,
			skipGeocoding: true
		}
	);

	assert.ok(Array.isArray(result.mapped));
	assert.equal(result.mapped.length, 1);
	const [mapped] = result.mapped;
	assert.equal(mapped.activity.start_location_name, 'Westgate Square');
	assert.equal(
		mapped.activity.start_location_address,
		'Westgate Square, 15810 W State Road 84, Sunrise, FL, US'
	);
	assert.equal(
		mapped.activity.description,
		'We meet behind the 7Eleven/Exxon at the Westgate Square Shopping Centre.\n\nRoll out at 7:00am sharp.'
	);
	assert.doesNotMatch(
		mapped.activity.description,
		/Meetup group:|Meetup event:|More information:/i
	);
	assert.equal(
		mapped.ride.external_event_url,
		'https://www.meetup.com/one-love-cycling/events/vxkztryjcpbcc/'
	);
	assert.equal(mapped.ride.external_group_url, 'https://www.meetup.com/one-love-cycling/');
	assert.equal(mapped.ride.external_organizer_name, 'One Love Cycling');
	assert.equal(mapped.ride.pace_notes, null);
});

test('WeeklyRides import populates venue, external registration URL, organizer, and clean description', async () => {
	const rssXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <lastBuildDate>Sat, 21 Nov 2026 10:00:00 GMT</lastBuildDate>
    <item>
      <title>NCCX 2026 Cyclo-Cross Series NCGP</title>
      <link>https://www.weeklyrides.com/index.php/rides-events/9343-nccx-2026-cyclo-cross-series-ncgp-46348</link>
      <guid>https://www.weeklyrides.com/index.php/rides-events/9343-nccx-2026-cyclo-cross-series-ncgp-46348</guid>
      <pubDate>Sat, 21 Nov 2026 13:00:00 GMT</pubDate>
      <description><![CDATA[
        <div><strong>NOV</strong><br/><strong>21</strong></div>
        <p><strong>Location:</strong> Hendersonville, NC</p>
        <p><strong>Category:</strong> Gravel/Mtb</p>
        <p><a href="https://www.nccyclocross.com/">NC Cyclocross</a></p>
      ]]></description>
    </item>
  </channel>
</rss>`;

	const parsed = parseWeeklyRidesRssFeed(rssXml);
	const result = await importRideSeedData(
		{},
		{ events: parsed.events },
		{
			slugPrefix: 'weeklyrides-',
			dryRun: true,
			requireGeocoding: false,
			skipGeocoding: true
		}
	);

	assert.ok(Array.isArray(result.mapped));
	assert.equal(result.mapped.length, 1);
	const [mapped] = result.mapped;
	assert.equal(mapped.activity.start_location_name, 'Hendersonville');
	assert.equal(mapped.activity.start_location_address, 'Hendersonville, NC');
	assert.equal(mapped.activity.description, 'Location: Hendersonville, NC\nCategory: Gravel/Mtb');
	assert.doesNotMatch(
		mapped.activity.description,
		/Event link:|WeeklyRides listing:|More information:/i
	);
	assert.equal(mapped.ride.external_event_url, 'https://www.nccyclocross.com/');
	assert.equal(
		mapped.ride.external_group_url,
		'https://www.weeklyrides.com/index.php/rides-events/9343-nccx-2026-cyclo-cross-series-ncgp-46348'
	);
	assert.equal(mapped.ride.external_organizer_name, 'NC Cyclocross');
	assert.equal(mapped.ride.pace_notes, null);
});

test('BTWPHX and seed imports store external organizer/url without overwriting venue or appending link footers', async () => {
	const parsed = parseBtwPhxCalendarData({
		result: true,
		value: [
			{
				id: 'btw-rar-1',
				title: 'RAR Bikepacking Trip',
				description: 'Come join us for our annual fall beginner bikepacking trip!',
				location: '11570 N Oracle Rd, Tucson, AZ 85737, United States',
				timezone: 'America/Phoenix',
				startDate: '2026-11-21',
				endDate: '2026-11-22',
				startHour: 7,
				startMinutes: 0,
				endHour: 15,
				endMinutes: 0,
				links: [
					{
						text: 'RAR Tucson',
						url: 'https://www.instagram.com/p/example-rar/'
					}
				]
			}
		]
	});

	const result = await importRideSeedData(
		{},
		{ events: parsed.events },
		{
			dryRun: true,
			requireGeocoding: false,
			skipGeocoding: true
		}
	);

	assert.ok(Array.isArray(result.mapped));
	assert.equal(result.mapped.length, 1);
	const [mapped] = result.mapped;
	assert.equal(mapped.activity.start_location_name, '11570 N Oracle Rd');
	assert.equal(
		mapped.activity.description,
		'Come join us for our annual fall beginner bikepacking trip!'
	);
	assert.doesNotMatch(mapped.activity.description, /More information:/i);
	assert.equal(mapped.ride.external_event_url, 'https://www.instagram.com/p/example-rar/');
	assert.equal(mapped.ride.external_organizer_name, 'RAR Tucson');
	assert.equal(mapped.ride.pace_notes, null);
});

test('normalizeRidePayload restricts external_event_url to null or http/https URLs and trims external_organizer_name', () => {
	const validHttps = normalizeRidePayload({
		title: 'Club Ride',
		externalEventUrl: '  https://www.meetup.com/one-love-cycling/events/123/  ',
		externalOrganizerName: '  One Love Cycling  '
	});
	assert.equal(
		validHttps.ride.external_event_url,
		'https://www.meetup.com/one-love-cycling/events/123/'
	);
	assert.equal(validHttps.ride.external_organizer_name, 'One Love Cycling');

	const validHttp = normalizeRidePayload({
		title: 'Local Ride',
		external_event_url: 'http://nccyclocross.com/register',
		external_organizer_name: '   '
	});
	assert.equal(validHttp.ride.external_event_url, 'http://nccyclocross.com/register');
	assert.equal(validHttp.ride.external_organizer_name, null);

	for (const unsafeUrl of [
		'',
		'   ',
		'javascript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'ftp://files.example.com/ride.gpx',
		'//evil.example/ride',
		'/ride/local-path',
		'https://example.com/with spaces'
	]) {
		const normalized = normalizeRidePayload({
			title: 'Unsafe Link Test',
			externalEventUrl: unsafeUrl
		});
		assert.equal(
			normalized.ride.external_event_url,
			null,
			`Expected ${JSON.stringify(unsafeUrl)} to normalize to null`
		);
	}

	assert.equal(isValidExternalEventUrlInput(''), true);
	assert.equal(isValidExternalEventUrlInput('https://www.bikereg.com/event'), true);
	assert.equal(isValidExternalEventUrlInput('javascript:alert(1)'), false);
	assert.equal(isValidExternalEventUrlInput('ftp://example.com'), false);
});

test('formatRideCardLocation formats venue plus city and state across US and international addresses', () => {
	const usMeetup = {
		startLocationName: 'Long Beach Windsurf Center',
		startLocationAddress: 'Long Beach Windsurf Center, 3850 E Ocean Blvd, Long Beach, CA, US'
	};
	assert.equal(extractRideCity(usMeetup), 'Long Beach');
	assert.equal(extractRideState(usMeetup), 'CA');
	assert.equal(formatRideCardLocation(usMeetup), 'Long Beach Windsurf Center · Long Beach, CA');

	const usZip = {
		startLocationName: '8626 N Central Ave',
		startLocationAddress: '8626 N Central Ave, Phoenix, AZ 85021, USA'
	};
	assert.equal(formatRideCardLocation(usZip), '8626 N Central Ave · Phoenix, AZ');

	const cityOnly = {
		startLocationName: 'Hendersonville',
		startLocationAddress: 'Hendersonville, NC'
	};
	assert.equal(formatRideCardLocation(cityOnly), 'Hendersonville, NC');

	const spainMeetup = {
		startLocationName: 'Casa de Campo',
		startLocationAddress: 'Casa de Campo, Pabellón Multiusos I, Madrid, ES'
	};
	assert.equal(extractRideCity(spainMeetup), 'Madrid');
	assert.equal(extractRideState(spainMeetup), 'ES');
	assert.equal(formatRideCardLocation(spainMeetup), 'Casa de Campo · Madrid, ES');

	const ukMeetup = {
		startLocationName: 'Tennis Court next to Maindy Velodrome',
		startLocationAddress:
			'Tennis Court next to Maindy Velodrome, Gelligaer Street Park 25, Gelligaer St, Cardiff, X5, GB'
	};
	assert.equal(
		formatRideCardLocation(ukMeetup),
		'Tennis Court next to Maindy Velodrome · Cardiff, GB'
	);

	const indiaMeetup = {
		startLocationName: 'Town Hall',
		startLocationAddress: 'Town Hall, Near by Palace Road, Thrissur, Kerala, IN'
	};
	assert.equal(formatRideCardLocation(indiaMeetup), 'Town Hall · Thrissur, Kerala');

	const legacyPlaceholder = {
		startLocationName: 'Meetup event',
		startLocationAddress: 'Westgate Square, 15810 W State Road 84, Sunrise, FL, US'
	};
	assert.equal(formatRideCardLocation(legacyPlaceholder), 'Westgate Square · Sunrise, FL');
});

test('rideDirectory exposes structured external fields and searches external_organizer_name', async () => {
	const normalizedRow = normalizeRideListRow(
		{
			id: 'ride-ext-1',
			source_event_id: 'meetup:12345',
			title: 'Sunrise Social Roll',
			slug: 'sunrise-social-roll',
			summary: 'Morning loop',
			description: 'Meet at Westgate Square',
			timezone: 'America/New_York',
			host_user_id: null,
			host_group_id: null,
			start_location_name: 'Westgate Square',
			start_location_address: 'Westgate Square, Sunrise, FL, US',
			start_latitude: 26.13,
			start_longitude: -80.36,
			next_occurrence_start: '2026-12-01T13:00:00.000Z',
			next_occurrence_end: '2026-12-01T15:00:00.000Z',
			ride_details: [
				{
					external_event_url: 'https://www.meetup.com/freewheelers/events/12345/',
					external_organizer_name: 'South Florida Freewheelers',
					image_urls: []
				}
			],
			group: null,
			difficulty_links: [],
			discipline_links: []
		},
		new Set(['ride-ext-1'])
	);

	assert.equal(normalizedRow.source_event_id, 'meetup:12345');
	assert.equal(normalizedRow.sourceEventId, 'meetup:12345');
	assert.equal(
		normalizedRow.external_event_url,
		'https://www.meetup.com/freewheelers/events/12345/'
	);
	assert.equal(normalizedRow.externalEventUrl, 'https://www.meetup.com/freewheelers/events/12345/');
	assert.equal(normalizedRow.external_organizer_name, 'South Florida Freewheelers');
	assert.equal(normalizedRow.externalOrganizerName, 'South Florida Freewheelers');
	assert.equal(normalizedRow.recurrenceEnabled, true);

	let rideDetailsOrExpr = '';
	let activitySelectCols = '';
	let activityOrExpr = '';
	const mockSupabase = {
		from(table) {
			/** @type {{ ors: string[]; countExact?: boolean }} */
			const state = { ors: [] };
			const builder = {
				select(cols, opts) {
					if (table === 'activity_events') activitySelectCols = cols;
					state.countExact = opts?.count === 'exact';
					return this;
				},
				eq() {
					return this;
				},
				is() {
					return this;
				},
				in() {
					return this;
				},
				ilike() {
					return this;
				},
				or(expr) {
					state.ors.push(expr);
					if (table === 'ride_details') rideDetailsOrExpr = expr;
					if (table === 'activity_events') activityOrExpr = expr;
					return this;
				},
				gte() {
					return this;
				},
				order() {
					return this;
				},
				limit() {
					return this;
				},
				range() {
					return this;
				},
				then(resolve, reject) {
					if (table === 'ride_details') {
						return Promise.resolve({
							data: [{ activity_event_id: 'ride-ext-1' }],
							error: null
						}).then(resolve, reject);
					}
					if (table === 'activity_events') {
						return Promise.resolve({
							data: [
								{
									id: 'ride-ext-1',
									source_event_id: 'meetup:12345',
									title: 'Sunrise Social Roll',
									slug: 'sunrise-social-roll',
									summary: null,
									description: null,
									timezone: 'America/New_York',
									host_user_id: null,
									host_group_id: null,
									start_location_name: 'Westgate Square',
									start_location_address: 'Westgate Square, Sunrise, FL, US',
									start_latitude: 26.13,
									start_longitude: -80.36,
									next_occurrence_start: '2026-12-01T13:00:00.000Z',
									next_occurrence_end: '2026-12-01T15:00:00.000Z',
									ride_details: [
										{
											external_event_url: 'https://www.meetup.com/freewheelers/events/12345/',
											external_organizer_name: 'South Florida Freewheelers',
											image_urls: []
										}
									],
									group: null,
									difficulty_links: [],
									discipline_links: []
								}
							],
							count: state.countExact ? 1 : null,
							error: null
						}).then(resolve, reject);
					}
					return Promise.resolve({ data: [], error: null }).then(resolve, reject);
				}
			};
			return builder;
		}
	};

	const result = await queryPublishedUpcomingRides(
		mockSupabase,
		new URLSearchParams('q=Freewheelers'),
		{ nowIso: '2026-11-22T00:00:00.000Z' }
	);

	assert.match(activitySelectCols, /\bsource_event_id\b/);
	assert.match(rideDetailsOrExpr, /external_organizer_name\.ilike\."%Freewheelers%"/);
	assert.match(activityOrExpr, /id\.in\.\(ride-ext-1\)/);
	assert.equal(result.data.length, 1);
	assert.equal(result.data[0].externalOrganizerName, 'South Florida Freewheelers');
});

test('rideDirectory search and row normalization degrade gracefully before external columns migration is applied', async () => {
	/** @type {Array<{ ors: string[]; ilikes: Array<[string, string]> }>} */
	const rideDetailsCalls = [];
	let activityOrExpr = '';

	const preMigrationSupabase = {
		/** @param {string} table */
		from(table) {
			/** @type {{ ors: string[]; ilikes: Array<[string, string]>; countExact?: boolean }} */
			const state = { ors: [], ilikes: [] };
			const builder = {
				/**
				 * @param {string} _cols
				 * @param {{ count?: string }} [opts]
				 */
				select(_cols, opts) {
					state.countExact = opts?.count === 'exact';
					return this;
				},
				eq() {
					return this;
				},
				is() {
					return this;
				},
				in() {
					return this;
				},
				/**
				 * @param {string} col
				 * @param {string} pattern
				 */
				ilike(col, pattern) {
					state.ilikes.push([col, pattern]);
					return this;
				},
				/** @param {string} expr */
				or(expr) {
					state.ors.push(expr);
					if (table === 'activity_events') activityOrExpr = expr;
					return this;
				},
				gte() {
					return this;
				},
				order() {
					return this;
				},
				limit() {
					return this;
				},
				range() {
					return this;
				},
				/**
				 * @param {(value: any) => any} resolve
				 * @param {(reason?: any) => any} [reject]
				 */
				then(resolve, reject) {
					if (table === 'ride_details') {
						rideDetailsCalls.push({ ors: [...state.ors], ilikes: [...state.ilikes] });
						if (state.ors.some((expr) => expr.includes('external_organizer_name'))) {
							return Promise.resolve({
								data: null,
								error: {
									code: '42703',
									message: 'column ride_details.external_organizer_name does not exist'
								}
							}).then(resolve, reject);
						}
						return Promise.resolve({
							data: [{ activity_event_id: 'ride-legacy-1' }],
							error: null
						}).then(resolve, reject);
					}
					if (table === 'activity_events') {
						return Promise.resolve({
							data: [
								{
									id: 'ride-legacy-1',
									source_event_id: 'meetup:one-love:99',
									title: 'Morning Tempo Ride',
									slug: 'meetup-morning-tempo-ride',
									summary: 'Tempo pace ride',
									description:
										'Tempo pace ride\n\nMeetup group: One Love Cycling\nMeetup event: https://www.meetup.com/one-love-cycling/events/99/',
									timezone: 'America/New_York',
									host_user_id: null,
									host_group_id: null,
									start_location_name: 'Meetup event',
									start_location_address: 'Westgate Square, Sunrise, FL, US',
									start_latitude: 26.13,
									start_longitude: -80.36,
									next_occurrence_start: '2026-12-01T13:00:00.000Z',
									next_occurrence_end: '2026-12-01T15:00:00.000Z',
									ride_details: [{ pace_notes: '18-20 mph tempo', image_urls: [] }],
									group: null,
									difficulty_links: [],
									discipline_links: []
								}
							],
							count: state.countExact ? 1 : null,
							error: null
						}).then(resolve, reject);
					}
					return Promise.resolve({ data: [], error: null }).then(resolve, reject);
				}
			};
			return builder;
		}
	};

	const result = await queryPublishedUpcomingRides(
		preMigrationSupabase,
		new URLSearchParams('q=tempo'),
		{ nowIso: '2026-11-22T00:00:00.000Z' }
	);

	assert.equal(rideDetailsCalls.length, 2);
	assert.deepEqual(rideDetailsCalls[1].ilikes, [['pace_notes', '%tempo%']]);
	assert.match(activityOrExpr, /id\.in\.\(ride-legacy-1\)/);
	assert.equal(result.data.length, 1);
	assert.equal(
		result.data[0].externalEventUrl,
		'https://www.meetup.com/one-love-cycling/events/99/'
	);
	assert.equal(result.data[0].externalOrganizerName, 'One Love Cycling');

	// Once migrated, explicit nulls on ride_details must NOT resurrect legacy source_event_id links.
	const clearedMigrated = resolveExternalRideMetadata(
		{
			source_event_id: 'https://www.meetup.com/one-love-cycling/events/99/',
			slug: 'meetup-morning-tempo-ride',
			description: 'Tempo pace ride'
		},
		{
			external_event_url: null,
			external_organizer_name: null
		}
	);
	assert.deepEqual(clearedMigrated, {
		external_event_url: null,
		external_organizer_name: null
	});

	// Native rides (no source_event_id) and venue names not in address must not synthesize external metadata.
	assert.deepEqual(
		resolveExternalRideMetadata(
			{
				source_event_id: null,
				slug: 'meetup-coffee-spin-native',
				description: 'Bring lights.\n\nMore information:\n\nHost Club: https://hostclub.example.org'
			},
			{}
		),
		{
			external_event_url: null,
			external_organizer_name: null
		}
	);
	assert.deepEqual(
		resolveExternalRideMetadata(
			{
				source_event_id: 'https://calendar.example.org/rides/tempe-lake-loop',
				slug: 'tempe-lake-loop',
				title: 'Tempe Lake Loop',
				description: 'Loop around Tempe Town Lake.',
				start_location_name: 'Tempe Beach Park',
				start_location_address: '80 W Rio Salado Pkwy, Tempe, AZ'
			},
			{}
		),
		{
			external_event_url: 'https://calendar.example.org/rides/tempe-lake-loop',
			external_organizer_name: null
		}
	);
});

test('insertRideDetailsCompat, updateRideDetailsCompat, and importRideSeedData retry cleanly when external columns do not exist yet', async () => {
	assert.equal(
		isMissingExternalRideColumnsError({
			code: 'PGRST204',
			message:
				"Could not find the 'external_event_url' column of 'ride_details' in the schema cache"
		}),
		true
	);
	assert.equal(
		isMissingExternalRideColumnsError({
			code: '23514',
			message: 'new row violates check constraint "ride_details_external_event_url_check"'
		}),
		false
	);

	/** @type {Array<Record<string, any>>} */
	const insertPayloads = [];
	/** @type {Array<{ id: string; patch: Record<string, any> }>} */
	const updatePayloads = [];

	const unmigratedWriteClient = {
		/** @param {string} table */
		from(table) {
			assert.equal(table, 'ride_details');
			return {
				/** @param {Record<string, any>} payload */
				async insert(payload) {
					insertPayloads.push(payload);
					if ('external_event_url' in payload || 'external_organizer_name' in payload) {
						return {
							data: null,
							error: {
								code: 'PGRST204',
								message:
									"Could not find the 'external_event_url' column of 'ride_details' in the schema cache"
							}
						};
					}
					return { data: payload, error: null };
				},
				/** @param {Record<string, any>} patch */
				update(patch) {
					return {
						/**
						 * @param {string} col
						 * @param {string} id
						 */
						async eq(col, id) {
							assert.equal(col, 'activity_event_id');
							updatePayloads.push({ id, patch });
							if ('external_event_url' in patch || 'external_organizer_name' in patch) {
								return {
									data: null,
									error: {
										code: '42703',
										message:
											'column "external_organizer_name" of relation "ride_details" does not exist'
									}
								};
							}
							return { data: patch, error: null };
						}
					};
				}
			};
		}
	};

	const normalized = normalizeRidePayload({
		title: 'Evening Loop',
		externalEventUrl: 'https://www.bikereg.com/evening-loop',
		externalOrganizerName: 'Desert Velo'
	});

	const insertRes = await insertRideDetailsCompat(unmigratedWriteClient, {
		activity_event_id: 'ride-1',
		...normalized.ride
	});
	assert.equal(insertRes.error, null);
	assert.equal(insertRes.fellBackWithoutExternalColumns, true);
	assert.equal(insertPayloads.length, 2);
	assert.equal('external_event_url' in insertPayloads[1], false);
	assert.equal('external_organizer_name' in insertPayloads[1], false);

	const updateRes = await updateRideDetailsCompat(unmigratedWriteClient, 'ride-1', {
		...normalized.ride,
		updated_at: '2026-11-24T00:00:00.000Z'
	});
	assert.equal(updateRes.error, null);
	assert.equal(updateRes.fellBackWithoutExternalColumns, true);
	assert.equal(updatePayloads.length, 2);
	assert.equal('external_event_url' in updatePayloads[1].patch, false);
	assert.equal('external_organizer_name' in updatePayloads[1].patch, false);

	// Verify importer fallback against an unmigrated DB preserves More information footer on activity_events.
	/** @type {Array<Record<string, any>>} */
	const activityUpdates = [];
	/** @type {Array<Record<string, any>>} */
	const importedDetailsInserts = [];
	const unmigratedImportClient = {
		/** @param {string} table */
		from(table) {
			if (table === 'activity_events') {
				return {
					/**
					 * @param {string} _cols
					 * @param {{ head?: boolean }} [opts]
					 */
					select(_cols, opts) {
						if (opts?.head) {
							return {
								async eq() {
									return { count: 0, error: null };
								}
							};
						}
						const chain = {
							eq() {
								return chain;
							},
							limit() {
								return chain;
							},
							async maybeSingle() {
								return { data: null, error: null };
							},
							/**
							 * @param {(value: any) => any} resolve
							 * @param {(reason?: any) => any} [reject]
							 */
							then(resolve, reject) {
								return Promise.resolve({ data: [], error: null }).then(resolve, reject);
							}
						};
						return chain;
					},
					/** @param {Record<string, any>} row */
					insert(row) {
						return {
							select() {
								return {
									async single() {
										return { data: { id: 'imported-act-1', ...row }, error: null };
									}
								};
							}
						};
					},
					/** @param {Record<string, any>} patch */
					update(patch) {
						activityUpdates.push(patch);
						return {
							async eq() {
								return { error: null };
							}
						};
					}
				};
			}
			if (table === 'ride_details') {
				return {
					/** @param {Record<string, any>} payload */
					async insert(payload) {
						importedDetailsInserts.push(payload);
						if ('external_event_url' in payload || 'external_organizer_name' in payload) {
							return {
								error: {
									code: 'PGRST204',
									message:
										"Could not find the 'external_event_url' column of 'ride_details' in the schema cache"
								}
							};
						}
						return { error: null };
					}
				};
			}
			if (
				table === 'activity_x_ride_difficulty_levels' ||
				table === 'activity_x_riding_disciplines' ||
				table === 'activity_occurrences' ||
				table === 'activity_recurrence_rules'
			) {
				return {
					async insert() {
						return { error: null };
					}
				};
			}
			throw new Error(`Unexpected table ${table}`);
		}
	};

	const importRes = await importRideSeedData(
		unmigratedImportClient,
		{
			events: [
				sourceEvent({
					id: 'btw-pre-mig-1',
					title: 'Pre-Migration Ride',
					description: 'Meet at coffee shop.',
					startLatitude: 33.45,
					startLongitude: -112.07,
					externalEventUrl: 'https://www.eventbrite.com/e/pre-migration-ride-123',
					externalOrganizerName: 'PHX Social Spin'
				})
			]
		},
		{
			requireGeocoding: false,
			skipGeocoding: true,
			skipImageUpload: true
		}
	);

	assert.ok(Array.isArray(importRes.inserted));
	assert.equal(importRes.inserted.length, 1);
	assert.equal(importedDetailsInserts.length, 2);
	assert.equal('external_event_url' in importedDetailsInserts[1], false);
	const descriptionPatch = activityUpdates.find((patch) => 'description' in patch);
	assert.ok(descriptionPatch);
	assert.match(
		descriptionPatch.description,
		/More information:\n\nPHX Social Spin: https:\/\/www\.eventbrite\.com\/e\/pre-migration-ride-123/
	);
});

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;
test(
	'structured external ride fields migration backs up modified rows, preserves real venues and unextractable URLs, saves group URLs, and supports rollback',
	{ skip: !databaseUrl },
	() => {
		if (!databaseUrl) return;
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const dbName = `ride_external_fields_test_${process.pid}`;
		/**
		 * @param {string} connection
		 * @param {string} sql
		 */
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			}).trim();

		const migrationSql = fs.readFileSync(
			'supabase/migrations/20261126231500_add_structured_external_ride_fields.sql',
			'utf8'
		);

		run(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		run(databaseUrl, `create database ${dbName}`);
		url.pathname = `/${dbName}`;
		const testDbUrl = url.toString();

		try {
			run(
				testDbUrl,
				`
				create table public.activity_events (
					id uuid primary key,
					activity_type text not null default 'ride',
					source_event_id text null,
					host_user_id uuid null,
					host_group_id uuid null,
					slug text not null unique,
					title text not null,
					summary text null,
					description text null,
					start_location_name text null,
					start_location_address text null,
					updated_at timestamptz not null default '2026-01-01T00:00:00Z'
				);

				create table public.ride_details (
					activity_event_id uuid primary key references public.activity_events(id) on delete cascade,
					pace_notes text null,
					updated_at timestamptz not null default '2026-01-01T00:00:00Z'
				);

				insert into public.activity_events (
					id, activity_type, source_event_id, host_user_id, host_group_id, slug, title, summary, description, start_location_name, start_location_address, updated_at
				) values
					-- 1. Meetup ride with street-numbered venue and both event + group page URLs (footer-only summary must not become NULL)
					(
						'00000000-0000-0000-0000-000000000001',
						'ride',
						'meetup:one-love:1',
						null,
						null,
						'meetup-sunrise-club-ride',
						'Sunrise Club Ride',
						'Meetup group: One Love Cycling',
						E'Roll out at 7am sharp.\n\nMeetup group: One Love Cycling\n\nMeetup event: https://www.meetup.com/one-love-cycling/events/123/\n\nMeetup group page: https://www.meetup.com/one-love-cycling/',
						'Meetup event',
						'Westgate Square, 15810 W State Road 84, Sunrise, FL, US',
						'2026-01-01T00:00:00Z'
					),
					-- 2. Clean local ride (must remain completely untouched)
					(
						'00000000-0000-0000-0000-000000000002',
						'ride',
						null,
						'00000000-0000-0000-0000-0000000000aa',
						null,
						'tempe-tuesday-spin',
						'Tempe Tuesday Spin',
						'Casual neighborhood roll.',
						'Casual neighborhood roll through Tempe.',
						'Tempe Beach Park',
						'80 W Rio Salado Pkwy, Tempe, AZ',
						'2026-01-01T00:00:00Z'
					),
					-- 3. Imported ride with a real start_location_name ("Bike Tempe") + explicit organizer label
					(
						'00000000-0000-0000-0000-000000000003',
						'ride',
						'btw-bike-tempe-1',
						null,
						null,
						'bike-tempe-community-roll',
						'Community Roll',
						'Easy social ride around Tempe.',
						E'Easy social ride around Tempe.\n\nMore information:\n\nBike Tempe: https://www.biketempe.org/events/roll',
						'Bike Tempe',
						'530 W Broadway Rd, Tempe, AZ 85282',
						'2026-01-01T00:00:00Z'
					),
					-- 4. WeeklyRides ride with real venue/event name + saved Event link in summary + both URLs in description
					(
						'00000000-0000-0000-0000-000000000004',
						'ride',
						'https://www.weeklyrides.com/index.php/rides-events/9343-nccx',
						null,
						null,
						'weeklyrides-nccx-pre-season-race',
						'NCCX Pre-Season Race',
						E'Location: Zirconia, NC\nCategory: Gravel/Mtb\nEvent link: https://www.nccyclocross.com/',
						E'Location: Zirconia, NC\nCategory: Gravel/Mtb\nEvent link: https://www.nccyclocross.com/\nWeeklyRides listing: https://www.weeklyrides.com/index.php/rides-events/9343-nccx',
						'NCCX Pre-Season Race',
						'Zirconia, NC',
						'2026-01-01T00:00:00Z'
					),
					-- 5. Meetup placeholder whose address is city/country only (no street number) — start_location_name must stay unchanged
					(
						'00000000-0000-0000-0000-000000000005',
						'ride',
						'meetup:albany-spin:5',
						null,
						null,
						'meetup-albany-weekend-spin',
						'Albany Weekend Spin',
						'Morning group ride.',
						E'Morning group ride.\n\nMeetup group: Albany Riders\n\nMeetup event: https://www.meetup.com/albany-riders/events/555/\n\nMeetup group page: https://www.meetup.com/albany-riders/',
						'Meetup event',
						'Albany, OR, US',
						'2026-01-01T00:00:00Z'
					),
					-- 6. Ride whose footer line has an unextractable URL — footer must be kept and row left unchanged
					(
						'00000000-0000-0000-0000-000000000006',
						'ride',
						'seed:unextractable-footer-6',
						null,
						null,
						'desert-twilight-crit',
						'Desert Twilight Crit',
						'Fast evening criterium.',
						E'Fast evening criterium.\n\nEvent link: www.example.com/register (opens next week)',
						'Downtown Gilbert',
						'50 E Civic Center Dr, Gilbert, AZ',
						'2026-01-01T00:00:00Z'
					),
					-- 7. Long pace note with footer (must strip saved URL line while keeping real pace text and unsaved URL)
					(
						'00000000-0000-0000-0000-000000000007',
						'ride',
						'btw-tempo-train-7',
						null,
						null,
						'east-valley-tempo-train',
						'East Valley Tempo Train',
						'Structured Tuesday morning paceline.',
						E'Structured Tuesday morning paceline.\n\nMore information:\n\nDesert Velo: https://desertvelo.example.org/events/tempo-train',
						'Papago Park Ramada',
						'625 N Galvin Pkwy, Phoenix, AZ 85008',
						'2026-01-01T00:00:00Z'
					),
					-- 8. Summary with unique URL (summary must not be overwritten from description or stripped of its unique URL)
					(
						'00000000-0000-0000-0000-000000000008',
						'ride',
						'https://www.weeklyrides.com/index.php/rides-events/9908-series',
						null,
						null,
						'weeklyrides-autumn-gravel-series',
						'Autumn Gravel Series',
						E'Custom host summary — see technical guide.\nEvent link: https://unique.example.org/tech-guide.pdf',
						E'Full gravel series description that must never overwrite the summary.\nEvent link: https://gravelseries.example.org/register\nWeeklyRides listing: https://www.weeklyrides.com/index.php/rides-events/9908-series',
						'Bent Creek Trailhead',
						'1577 Brevard Rd, Asheville, NC',
						'2026-01-01T00:00:00Z'
					),
					-- 9. Venue not contained in address ("Tempe Beach Park") with no organizer label — must NOT become external_organizer_name
					(
						'00000000-0000-0000-0000-000000000009',
						'ride',
						'https://calendar.example.org/rides/tempe-lake-loop',
						null,
						null,
						'tempe-lake-loop',
						'Tempe Lake Loop',
						'Loop around Tempe Town Lake.',
						'Loop around Tempe Town Lake.',
						'Tempe Beach Park',
						'80 W Rio Salado Pkwy, Tempe, AZ',
						'2026-01-01T00:00:00Z'
					),
					-- 10. Native host-created ride (source_event_id IS NULL) containing "More information:" — must remain completely untouched
					(
						'00000000-0000-0000-0000-000000000010',
						'ride',
						null,
						'00000000-0000-0000-0000-0000000000bb',
						null,
						'meetup-coffee-spin-native',
						'Host Coffee Spin',
						E'Host ride summary.\nMore information: https://hostclub.example.org/coffee-spin',
						E'Bring lights and cash for espresso.\n\nMore information:\n\nHost Club: https://hostclub.example.org/coffee-spin',
						'',
						'100 S Mill Ave, Tempe, AZ 85281',
						'2026-01-01T00:00:00Z'
					);

				insert into public.ride_details (activity_event_id, pace_notes, updated_at) values
					('00000000-0000-0000-0000-000000000001', 'Meetup group: One Love Cycling', '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000002', '12-14 mph social no-drop', '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000003', 'Easy social ride around Tempe.', '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000004', '16-18 mph race pace', '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000005', null, '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000006', '22+ mph crit pace', '2026-01-01T00:00:00Z'),
					(
						'00000000-0000-0000-0000-000000000007',
						E'A-group: 20-22 mph rotating paceline; B-group: 17-19 mph steady tempo with hilltop regroups; C-group: 14-16 mph no-drop.\n\nMore information:\n\nDesert Velo: https://desertvelo.example.org/events/tempo-train\nRoute GPX: https://ridewithgps.com/routes/424242',
						'2026-01-01T00:00:00Z'
					),
					('00000000-0000-0000-0000-000000000008', '15-17 mph gravel tempo', '2026-01-01T00:00:00Z'),
					('00000000-0000-0000-0000-000000000009', '14-16 mph casual spin', '2026-01-01T00:00:00Z'),
					(
						'00000000-0000-0000-0000-000000000010',
						E'15-17 mph social roll.\nEvent link: https://hostclub.example.org/coffee-spin',
						'2026-01-01T00:00:00Z'
					);

				${migrationSql}
				`
			);

			const constraintsValidated = run(
				testDbUrl,
				`select count(*)::text from pg_constraint
				 where conname in ('ride_details_external_event_url_check', 'ride_details_external_group_url_check')
				   and convalidated = true;`
			);
			assert.equal(constraintsValidated, '2');

			// Row 1: Meetup placeholder with street number -> Westgate Square; footer-only summary kept (never NULL); exact-duplicate pace_notes nulled.
			const importedMeetupRow = run(
				testDbUrl,
				`select coalesce(ae.start_location_name, '') || '|' || coalesce(ae.summary, '<null>') || '|' || coalesce(ae.description, '') || '|' || coalesce(rd.pace_notes, '<null>') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_group_url, '') || '|' || coalesce(rd.external_organizer_name, '')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000001';`
			);
			assert.equal(
				importedMeetupRow,
				'Westgate Square|Meetup group: One Love Cycling|Roll out at 7am sharp.|<null>|https://www.meetup.com/one-love-cycling/events/123/|https://www.meetup.com/one-love-cycling/|One Love Cycling'
			);

			// Row 2: Clean local ride must not be touched by the backfill at all.
			const localRideRow = run(
				testDbUrl,
				`select (ae.updated_at = '2026-01-01T00:00:00Z')::text || '|' || (rd.updated_at = '2026-01-01T00:00:00Z')::text || '|' || coalesce(rd.pace_notes, '')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000002';`
			);
			assert.equal(localRideRow, 'true|true|12-14 mph social no-drop');

			// Row 3: Real start_location_name ("Bike Tempe") is unchanged even when start_location_address starts with a street number.
			const realVenueRow = run(
				testDbUrl,
				`select coalesce(ae.start_location_name, '') || '|' || coalesce(ae.description, '') || '|' || coalesce(rd.pace_notes, '<null>') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_organizer_name, '')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000003';`
			);
			assert.equal(
				realVenueRow,
				'Bike Tempe|Easy social ride around Tempe.|<null>|https://www.biketempe.org/events/roll|Bike Tempe'
			);

			// Row 4: WeeklyRides real start_location_name ("NCCX Pre-Season Race") is unchanged, saved Event link stripped from summary, and BOTH URLs saved.
			const weeklyRidesRow = run(
				testDbUrl,
				`select coalesce(ae.start_location_name, '') || '|' || replace(coalesce(ae.summary, ''), E'\\n', ' / ') || '|' || replace(coalesce(ae.description, ''), E'\\n', ' / ') || '|' || coalesce(rd.pace_notes, '<null>') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_group_url, '')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000004';`
			);
			assert.equal(
				weeklyRidesRow,
				'NCCX Pre-Season Race|Location: Zirconia, NC / Category: Gravel/Mtb|Location: Zirconia, NC / Category: Gravel/Mtb|16-18 mph race pace|https://www.nccyclocross.com/|https://www.weeklyrides.com/index.php/rides-events/9343-nccx'
			);

			// Row 5: "Meetup event" placeholder with city/state/country-only address (no street number) stays unchanged.
			const cityOnlyPlaceholderName = run(
				testDbUrl,
				`select ae.start_location_name from public.activity_events ae where ae.id = '00000000-0000-0000-0000-000000000005';`
			);
			assert.equal(cityOnlyPlaceholderName, 'Meetup event');

			// Row 6: Footer line with an unextractable URL is kept intact, and venue is not saved as organizer.
			const unextractableFooterRow = run(
				testDbUrl,
				`select (ae.updated_at = '2026-01-01T00:00:00Z')::text || '|' || (rd.updated_at = '2026-01-01T00:00:00Z')::text || '|' || coalesce(ae.start_location_name, '') || '|' || replace(coalesce(ae.description, ''), E'\\n', '\\n') || '|' || coalesce(rd.external_event_url, '<null>') || '|' || coalesce(rd.external_organizer_name, '<null>')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000006';`
			);
			assert.equal(
				unextractableFooterRow,
				'true|true|Downtown Gilbert|Fast evening criterium.\\n\\nEvent link: www.example.com/register (opens next week)|<null>|<null>'
			);

			// Row 7: Long pace_notes with footer keeps full pace text + unsaved GPX URL while stripping saved external_event_url line.
			const longPaceNotesRow = run(
				testDbUrl,
				`select replace(coalesce(rd.pace_notes, '<null>'), E'\\n', '\\n') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_organizer_name, '')
				 from public.ride_details rd
				 where rd.activity_event_id = '00000000-0000-0000-0000-000000000007';`
			);
			assert.equal(
				longPaceNotesRow,
				'A-group: 20-22 mph rotating paceline; B-group: 17-19 mph steady tempo with hilltop regroups; C-group: 14-16 mph no-drop.\\n\\nMore information:\\n\\nRoute GPX: https://ridewithgps.com/routes/424242|https://desertvelo.example.org/events/tempo-train|Desert Velo'
			);

			// Row 8: Summary with unique URL is preserved intact (never replaced by description and never stripped of unsaved URL).
			const uniqueSummaryUrlRow = run(
				testDbUrl,
				`select replace(coalesce(ae.summary, '<null>'), E'\\n', '\\n') || '|' || coalesce(ae.description, '') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_group_url, '')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000008';`
			);
			assert.equal(
				uniqueSummaryUrlRow,
				'Custom host summary — see technical guide.\\nEvent link: https://unique.example.org/tech-guide.pdf|Full gravel series description that must never overwrite the summary.|https://gravelseries.example.org/register|https://www.weeklyrides.com/index.php/rides-events/9908-series'
			);

			// Row 9: Venue not contained in address ("Tempe Beach Park") is NOT saved as external_organizer_name.
			const venueNotInAddressRow = run(
				testDbUrl,
				`select (ae.updated_at = '2026-01-01T00:00:00Z')::text || '|' || coalesce(ae.start_location_name, '') || '|' || coalesce(rd.external_event_url, '') || '|' || coalesce(rd.external_organizer_name, '<null>')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000009';`
			);
			assert.equal(
				venueNotInAddressRow,
				'true|Tempe Beach Park|https://calendar.example.org/rides/tempe-lake-loop|<null>'
			);

			// Row 10: Native host-created ride (source_event_id IS NULL) with "More information:" / "Event link:" is completely untouched.
			const nativeFooterRideRow = run(
				testDbUrl,
				`select (ae.updated_at = '2026-01-01T00:00:00Z')::text || '|' || (rd.updated_at = '2026-01-01T00:00:00Z')::text || '|' || coalesce(ae.start_location_name, '') || '|' || replace(coalesce(ae.summary, ''), E'\\n', '\\n') || '|' || replace(coalesce(ae.description, ''), E'\\n', '\\n') || '|' || replace(coalesce(rd.pace_notes, ''), E'\\n', '\\n') || '|' || coalesce(rd.external_event_url, '<null>') || '|' || coalesce(rd.external_organizer_name, '<null>')
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000010';`
			);
			assert.equal(
				nativeFooterRideRow,
				'true|true||Host ride summary.\\nMore information: https://hostclub.example.org/coffee-spin|Bring lights and cash for espresso.\\n\\nMore information:\\n\\nHost Club: https://hostclub.example.org/coffee-spin|15-17 mph social roll.\\nEvent link: https://hostclub.example.org/coffee-spin|<null>|<null>'
			);

			// Backup table row counts equal updated row counts on initial run (6 activity_events: 1,3,4,5,7,8; 7 ride_details: 1,3,4,5,7,8,9).
			const activityCounts = run(
				testDbUrl,
				`select (select count(*) from public.activity_events_backfill_20261124)::text || '|' || (select count(*) from public.activity_events where updated_at > '2026-01-01T00:00:00Z')::text;`
			);
			assert.equal(activityCounts, '6|6');

			const rideDetailsBackupCounts = run(
				testDbUrl,
				`select (select count(*) from public.ride_details_backfill_20261124)::text || '|' || (select count(*) from public.ride_details where updated_at > '2026-01-01T00:00:00Z')::text;`
			);
			assert.equal(rideDetailsBackupCounts, '7|7');

			// Re-run after inserting a new legacy imported row (Row 11): existing rows stay untouched, and Row 11 is appended to both backup tables before update.
			const beforeRerunStamp = run(
				testDbUrl,
				`select rd.updated_at::text from public.ride_details rd where rd.activity_event_id = '00000000-0000-0000-0000-000000000001';`
			);
			run(
				testDbUrl,
				`
				insert into public.activity_events (
					id, activity_type, source_event_id, host_user_id, host_group_id, slug, title, summary, description, start_location_name, start_location_address, updated_at
				) values (
					'00000000-0000-0000-0000-000000000011',
					'ride',
					'meetup:late-sync:11',
					null,
					null,
					'meetup-late-sync-ride',
					'Late Sync Ride',
					E'Evening recovery spin.\nMeetup event: https://www.meetup.com/late-sync/events/111/',
					E'Evening recovery spin.\n\nMeetup group: Late Sync Riders\n\nMeetup event: https://www.meetup.com/late-sync/events/111/\n\nMeetup group page: https://www.meetup.com/late-sync/',
					'Meetup event',
					'Central Plaza, 420 N Central Ave, Phoenix, AZ, US',
					'2026-02-01T00:00:00Z'
				);
				insert into public.ride_details (activity_event_id, pace_notes, updated_at) values (
					'00000000-0000-0000-0000-000000000011',
					E'13-15 mph conversational pace; regroup at coffee stop.\nMeetup event: https://www.meetup.com/late-sync/events/111/',
					'2026-02-01T00:00:00Z'
				);
				`
			);
			run(testDbUrl, migrationSql);

			const afterRerunCheck = run(
				testDbUrl,
				`select rd1.updated_at::text || '|' || (select count(*) from public.activity_events_backfill_20261124)::text || '|' || (select count(*) from public.ride_details_backfill_20261124)::text || '|' || coalesce(ae11.start_location_name, '') || '|' || coalesce(ae11.summary, '') || '|' || coalesce(rd11.pace_notes, '') || '|' || coalesce(rd11.external_event_url, '') || '|' || (select b.updated_at = '2026-02-01T00:00:00Z' from public.activity_events_backfill_20261124 b where b.id = '00000000-0000-0000-0000-000000000011')::text
				 from public.ride_details rd1
				 cross join public.activity_events ae11
				 join public.ride_details rd11 on rd11.activity_event_id = ae11.id
				 where rd1.activity_event_id = '00000000-0000-0000-0000-000000000001'
				   and ae11.id = '00000000-0000-0000-0000-000000000011';`
			);
			assert.equal(
				afterRerunCheck,
				`${beforeRerunStamp}|7|8|Central Plaza|Evening recovery spin.|13-15 mph conversational pace; regroup at coffee stop.|https://www.meetup.com/late-sync/events/111/|true`
			);

			assert.throws(() =>
				run(
					testDbUrl,
					`update public.ride_details set external_event_url = 'javascript:alert(1)' where activity_event_id = '00000000-0000-0000-0000-000000000002';`
				)
			);
			assert.throws(() =>
				run(
					testDbUrl,
					`update public.ride_details set external_group_url = 'ftp://example.com/group' where activity_event_id = '00000000-0000-0000-0000-000000000002';`
				)
			);

			// Uncomment and execute the rollback block from the bottom of the migration and verify restoration across BOTH Run 1 and Run 2 rows.
			const rollbackMarker = '-- Rollback (manual):';
			const markerIndex = migrationSql.indexOf(rollbackMarker);
			assert.ok(markerIndex !== -1, 'Expected commented rollback block at bottom of migration');
			const uncommentedRollbackSql = migrationSql
				.slice(markerIndex)
				.split('\n')
				.slice(1)
				.map((line) => line.replace(/^--\s?/, ''))
				.join('\n');
			run(testDbUrl, uncommentedRollbackSql);

			const restoredMeetupRow = run(
				testDbUrl,
				`select ae.start_location_name || '|' || ae.summary || '|' || rd.pace_notes || '|' || coalesce(rd.external_event_url, '<null>') || '|' || coalesce(rd.external_group_url, '<null>') || '|' || coalesce(rd.external_organizer_name, '<null>') || '|' || (ae.updated_at = '2026-01-01T00:00:00Z')::text || '|' || (rd.updated_at = '2026-01-01T00:00:00Z')::text
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000001';`
			);
			assert.equal(
				restoredMeetupRow,
				'Meetup event|Meetup group: One Love Cycling|Meetup group: One Love Cycling|<null>|<null>|<null>|true|true'
			);

			const restoredLateSyncRow = run(
				testDbUrl,
				`select ae.start_location_name || '|' || replace(ae.summary, E'\\n', '\\n') || '|' || replace(rd.pace_notes, E'\\n', '\\n') || '|' || coalesce(rd.external_event_url, '<null>') || '|' || (ae.updated_at = '2026-02-01T00:00:00Z')::text || '|' || (rd.updated_at = '2026-02-01T00:00:00Z')::text
				 from public.activity_events ae
				 join public.ride_details rd on rd.activity_event_id = ae.id
				 where ae.id = '00000000-0000-0000-0000-000000000011';`
			);
			assert.equal(
				restoredLateSyncRow,
				'Meetup event|Evening recovery spin.\\nMeetup event: https://www.meetup.com/late-sync/events/111/|13-15 mph conversational pace; regroup at coffee stop.\\nMeetup event: https://www.meetup.com/late-sync/events/111/|<null>|true|true'
			);
		} finally {
			run(databaseUrl, `drop database ${dbName} with (force)`);
		}
	}
);
