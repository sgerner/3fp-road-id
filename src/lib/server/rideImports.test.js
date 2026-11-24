import assert from 'node:assert/strict';
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
import { isValidExternalEventUrlInput, normalizeRidePayload } from './ridePayload.js';
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
