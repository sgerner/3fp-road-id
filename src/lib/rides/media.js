export const DEFAULT_RIDE_IMAGE_URL = '/images/default-ride.webp';

function cleanImageUrls(values) {
	return (Array.isArray(values) ? values : [])
		.map((value) => String(value || '').trim())
		.filter(Boolean);
}

export function getRideImages(ride) {
	const uploaded = cleanImageUrls(
		ride?.imageUrls ?? ride?.image_urls ?? ride?.rideDetails?.image_urls
	);
	return uploaded.length ? uploaded : [DEFAULT_RIDE_IMAGE_URL];
}

export function getRideImage(ride) {
	return getRideImages(ride)[0];
}
