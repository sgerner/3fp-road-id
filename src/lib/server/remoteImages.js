import { fetchPublicHttp, readResponseBuffer } from './security.js';
import { optimizeImageForStorage } from './storageImages.js';

export const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
export const REMOTE_IMAGE_HEADERS = Object.freeze({
	accept: 'image/avif,image/webp,image/*;q=0.8,*/*;q=0.5',
	'accept-language': 'en-US,en;q=0.9',
	'user-agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
});

async function cancelResponseBody(response) {
	try {
		await response?.body?.cancel();
	} catch {
		// The body may already have been closed by the transport.
	}
}

/**
 * Fetch and normalize a remote image using the same validation rules as local
 * uploads. SVG is intentionally rejected because public SVGs can contain
 * active content; ICO favicons are preserved because browsers can render them.
 */
export async function prepareRemoteImage(
	remoteUrl,
	{
		maxBytes = MAX_REMOTE_IMAGE_BYTES,
		timeoutMs = 8_000,
		maxRedirects = 3,
		maxWidth = 2400,
		maxHeight = 1800,
		quality = 82
	} = {}
) {
	if (!/^https?:\/\//i.test(String(remoteUrl || '').trim())) {
		throw new Error('Remote image URL must use HTTP or HTTPS.');
	}

	const response = await fetchPublicHttp(
		remoteUrl,
		{ headers: REMOTE_IMAGE_HEADERS },
		{ timeoutMs, maxRedirects, maxResponseBytes: maxBytes }
	);
	if (!response) throw new Error('Unable to reach remote image.');
	if (!response.ok) {
		await cancelResponseBody(response);
		throw new Error(`Remote image returned HTTP ${response.status}.`);
	}

	const contentType = (response.headers.get('content-type') || '')
		.split(';', 1)[0]
		.trim()
		.toLowerCase();
	const contentLength = Number(response.headers.get('content-length'));
	if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
		await cancelResponseBody(response);
		throw new Error(`Remote response is not a supported image (${contentType || 'unknown'}).`);
	}
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		await cancelResponseBody(response);
		throw new Error('Remote image exceeds the supported size limit.');
	}

	const sourceBuffer = await readResponseBuffer(response, maxBytes);
	if (!sourceBuffer) throw new Error('Remote image could not be read within the size limit.');
	return optimizeImageForStorage(sourceBuffer, { contentType, maxWidth, maxHeight, quality });
}

export async function mirrorRemoteImageToStorage(storageClient, remoteUrl, destBasePath, options) {
	const optimized = await prepareRemoteImage(remoteUrl, options);
	const objectPath = `${destBasePath}.${optimized.extension}`;
	const { error } = await storageClient.storage
		.from('storage')
		.upload(objectPath, optimized.buffer, {
			cacheControl: '31536000',
			contentType: optimized.contentType,
			upsert: true
		});
	if (error) throw error;
	const { data } = storageClient.storage.from('storage').getPublicUrl(objectPath);
	if (!data?.publicUrl) throw new Error('Storage did not return a public URL.');
	return data.publicUrl;
}
