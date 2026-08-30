import { optimizedImageUrl } from '$lib/media/optimized';

export const DEFAULT_RIDE_IMAGE_URL = '/images/default-ride.webp';

function cleanImageUrls(values) {
	return (Array.isArray(values) ? values : [])
		.map((value) => String(value || '').trim())
		.filter(Boolean);
}

export function getRideImages(ride, options) {
	const uploaded = cleanImageUrls(
		ride?.imageUrls ?? ride?.image_urls ?? ride?.rideDetails?.image_urls
	);
	const images = uploaded.length ? uploaded : [DEFAULT_RIDE_IMAGE_URL];
	return options ? images.map((image) => optimizedImageUrl(image, options)) : images;
}

export function getRideImage(ride, options) {
	return getRideImages(ride, options)[0];
}
