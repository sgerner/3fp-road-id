import assert from 'node:assert/strict';
import test from 'node:test';
import { geocodeAddress } from '../groups/geocoding.js';

test('geocodeAddress returns null when Google reports a non-OK status', async () => {
	const geocoder = {
		geocode(_request, callback) {
			callback([{ geometry: { location: { lat: 33.4, lng: -111.9 } } }], 'ZERO_RESULTS');
		}
	};

	assert.equal(await geocodeAddress(geocoder, 'Tempe, AZ'), null);
});

test('geocodeAddress extracts coordinates and applies country restriction', async () => {
	let receivedRequest;
	const geocoder = {
		geocode(request, callback) {
			receivedRequest = request;
			callback(
				[
					{
						geometry: {
							location: {
								lat: () => 33.4255,
								lng: () => -111.94
							}
						}
					}
				],
				'OK'
			);
		}
	};

	assert.deepEqual(await geocodeAddress(geocoder, '  Tempe, AZ  ', 'US'), {
		lat: 33.4255,
		lng: -111.94
	});
	assert.deepEqual(receivedRequest, {
		address: 'Tempe, AZ',
		componentRestrictions: { country: 'US' }
	});
});
