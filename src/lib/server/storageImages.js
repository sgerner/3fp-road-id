import sharp from 'sharp';

const SKIP_MIME_TYPES = new Set(['image/gif', 'image/svg+xml']);

function normalizeMimeType(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function normalizeBuffer(value) {
	if (Buffer.isBuffer(value)) return value;
	if (value instanceof ArrayBuffer) return Buffer.from(value);
	if (ArrayBuffer.isView(value)) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	return Buffer.from(value);
}

/**
 * Normalize stored raster images once, before they enter Storage.
 * GIF and SVG are intentionally preserved because WebP conversion can change
 * animation or vector behavior. If conversion would make a small image larger,
 * keep the original bytes while still allowing oversized images to be bounded.
 */
export async function optimizeImageForStorage(
	input,
	{ contentType = '', maxWidth = 2400, maxHeight = 1800, quality = 82 } = {}
) {
	const source = normalizeBuffer(input);
	const mimeType = normalizeMimeType(contentType);
	if (!mimeType.startsWith('image/') || SKIP_MIME_TYPES.has(mimeType)) {
		return {
			buffer: source,
			contentType: mimeType || contentType || 'application/octet-stream',
			extension: mimeType === 'image/gif' ? 'gif' : mimeType === 'image/svg+xml' ? 'svg' : 'bin',
			originalBytes: source.byteLength,
			optimizedBytes: source.byteLength,
			optimized: false
		};
	}

	try {
		const image = sharp(source, { failOn: 'none' });
		const metadata = await image.metadata();
		const needsResize =
			Number(metadata.width || 0) > maxWidth || Number(metadata.height || 0) > maxHeight;
		const transformed = await image
			.rotate()
			.resize({
				width: maxWidth,
				height: maxHeight,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality, effort: 4, alphaQuality: Math.min(100, quality + 8) })
			.toBuffer();

		if (!needsResize && transformed.byteLength >= source.byteLength) {
			return {
				buffer: source,
				contentType: mimeType,
				extension: mimeType.split('/')[1] || 'img',
				originalBytes: source.byteLength,
				optimizedBytes: source.byteLength,
				optimized: false
			};
		}

		return {
			buffer: transformed,
			contentType: 'image/webp',
			extension: 'webp',
			originalBytes: source.byteLength,
			optimizedBytes: transformed.byteLength,
			optimized: true
		};
	} catch {
		return {
			buffer: source,
			contentType: mimeType || contentType || 'application/octet-stream',
			extension: mimeType.split('/')[1] || 'img',
			originalBytes: source.byteLength,
			optimizedBytes: source.byteLength,
			optimized: false
		};
	}
}

export function replaceFileExtension(fileName, extension) {
	const value = String(fileName || 'asset');
	const dot = value.lastIndexOf('.');
	const base = dot > 0 ? value.slice(0, dot) : value;
	return `${base}.${String(extension || 'bin').replace(/^\./, '')}`;
}
