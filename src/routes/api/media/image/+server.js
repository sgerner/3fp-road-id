import sharp from 'sharp';
import { isOptimizableImageHost } from '$lib/media/optimized';
import { enforceRateLimit, fetchPublicHttp, readResponseBuffer } from '$lib/server/security';
import { sniffRasterImageMimeType } from '$lib/server/storageImages';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

function numericParameter(url, name, fallback, min, max) {
	const value = Number(url.searchParams.get(name));
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

export const GET = async (event) => {
	const { url } = event;
	const limited = enforceRateLimit(event, {
		name: 'image-proxy',
		limit: 120,
		windowMs: 60 * 1000
	});
	if (limited) return limited;

	const source = String(url.searchParams.get('src') || '').trim();
	if (!/^https?:\/\//i.test(source) || !isOptimizableImageHost(source)) {
		return new Response('Unsupported image source', { status: 400 });
	}

	const width = numericParameter(url, 'width', 768, 32, 1600);
	const height = numericParameter(url, 'height', 0, 0, 1600);
	const quality = numericParameter(url, 'quality', 68, 40, 90);

	try {
		const upstream = await fetchPublicHttp(
			source,
			{ headers: { accept: 'image/avif,image/webp,image/*;q=0.8,*/*;q=0.5' } },
			{ timeoutMs: 8_000, maxRedirects: 2 }
		);
		if (!upstream) return new Response('Unable to load image', { status: 502 });
		if (!upstream.ok) return new Response('Unable to load image', { status: 502 });

		const contentType = (upstream.headers.get('content-type') || '')
			.split(';', 1)[0]
			.trim()
			.toLowerCase();
		const contentLength = Number(upstream.headers.get('content-length'));
		if (
			!contentType.startsWith('image/') ||
			contentLength > MAX_SOURCE_BYTES ||
			contentType === 'image/svg+xml'
		) {
			return new Response('Unsupported image response', { status: 415 });
		}

		const sourceBuffer = await readResponseBuffer(upstream, MAX_SOURCE_BYTES);
		if (!sourceBuffer) {
			return new Response('Image is too large', { status: 413 });
		}
		if (!sniffRasterImageMimeType(sourceBuffer)) {
			return new Response('Unsupported image response', { status: 415 });
		}

		const output = await sharp(sourceBuffer, {
			failOn: 'warning',
			limitInputPixels: MAX_IMAGE_PIXELS
		})
			.rotate()
			.resize({
				width,
				height: height || undefined,
				fit: height ? 'cover' : 'inside',
				withoutEnlargement: true
			})
			.webp({ quality, effort: 4 })
			.toBuffer();

		return new Response(output, {
			headers: {
				'cache-control': 'public, max-age=31536000, immutable',
				'content-type': 'image/webp',
				'content-length': String(output.byteLength),
				vary: 'Accept'
			}
		});
	} catch (error) {
		console.error('Failed to optimize remote image', error);
		return new Response('Unable to process image', { status: 502 });
	}
};
