export function geocodeAddress(geocoder, query, countryCode, okStatus = 'OK') {
	const address = String(query ?? '').trim();
	if (!geocoder?.geocode || !address) return Promise.resolve(null);

	const request = { address };
	if (countryCode) request.componentRestrictions = { country: countryCode };

	return new Promise((resolve) => {
		geocoder.geocode(request, (results, status) => {
			if (status !== 'OK' && status !== okStatus) {
				resolve(null);
				return;
			}

			const location = results?.[0]?.geometry?.location;
			if (!location) {
				resolve(null);
				return;
			}

			const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
			const lng = typeof location.lng === 'function' ? location.lng() : location.lng;
			resolve(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
		});
	});
}
