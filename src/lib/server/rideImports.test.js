import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { fetchExistingRideEventsBySourceId, importRideSeedData } from './ride-imports.js';

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
