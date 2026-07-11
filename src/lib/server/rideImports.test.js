import assert from 'node:assert/strict';
import test from 'node:test';
import { importRideSeedData } from './ride-imports.js';

function createSupabase(existingImageUrls = [], hasExistingRide = true) {
	const imageUpdates = [];
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
						}
					};
				}

				if (table === 'ride_details') {
					return {
						update(payload) {
							return {
								eq(column, value) {
									imageUpdates.push({ payload, column, value });
									return Promise.resolve({ error: null });
								}
							};
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

function sourceEvent() {
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
		image: { url: 'https://images.example/source-1.jpg' }
	};
}

async function importExistingRide(supabase) {
	return importRideSeedData(
		supabase,
		{ events: [sourceEvent()] },
		{
			requireGeocoding: false,
			skipGeocoding: true,
			reconcileMissingImages: true
		}
	);
}

test('importRideSeedData fills a missing image on an existing ride', async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async (url) => {
		assert.equal(url, 'https://images.example/source-1.jpg');
		return new Response(new Uint8Array([1, 2, 3]), {
			status: 200,
			headers: { 'content-type': 'image/jpeg' }
		});
	};

	const { supabase, imageUpdates, storedMedia, uploadedObjects } = createSupabase();
	const result = await importExistingRide(supabase);

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
