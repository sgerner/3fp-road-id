import sharp from 'sharp';

const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_MIME_TYPES = Object.freeze({
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heif: 'image/avif',
	gif: 'image/gif'
});
const ICO_MIME_TYPES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);

function normalizeMimeType(value) {
	return String(value || '')
		.trim()
		.split(';', 1)[0]
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

export function sniffRasterImageMimeType(value) {
	const source = normalizeBuffer(value);
	if (
		source.byteLength >= 8 &&
		source.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return IMAGE_MIME_TYPES.png;
	}
	if (source.byteLength >= 3 && source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff) {
		return IMAGE_MIME_TYPES.jpeg;
	}
	if (
		source.byteLength >= 12 &&
		source.toString('ascii', 0, 4) === 'RIFF' &&
		source.toString('ascii', 8, 12) === 'WEBP'
	) {
		return IMAGE_MIME_TYPES.webp;
	}
	if (
		source.byteLength >= 16 &&
		source.toString('ascii', 4, 8) === 'ftyp' &&
		/avif|avis/.test(source.toString('ascii', 8, Math.min(source.byteLength, 64)))
	) {
		return IMAGE_MIME_TYPES.heif;
	}
	if (source.byteLength >= 6 && /^GIF8[79]a$/.test(source.toString('ascii', 0, 6))) {
		return IMAGE_MIME_TYPES.gif;
	}
	return null;
}

export function sniffIcoImageMimeType(value) {
	const source = normalizeBuffer(value);
	if (source.byteLength < 6) return null;
	const reserved = source.readUInt16LE(0);
	const type = source.readUInt16LE(2);
	const imageCount = source.readUInt16LE(4);
	if (reserved !== 0 || type !== 1 || imageCount === 0 || imageCount > 256) return null;
	const directoryEnd = 6 + imageCount * 16;
	if (source.byteLength < directoryEnd) return null;
	for (let index = 0; index < imageCount; index += 1) {
		const entryOffset = 6 + index * 16;
		const bytesInResource = source.readUInt32LE(entryOffset + 8);
		const imageOffset = source.readUInt32LE(entryOffset + 12);
		if (
			bytesInResource === 0 ||
			imageOffset < directoryEnd ||
			imageOffset > source.byteLength - bytesInResource
		) {
			return null;
		}
	}
	return 'image/x-icon';
}

function extensionForMimeType(mimeType) {
	if (mimeType === 'image/x-icon' || mimeType === 'image/vnd.microsoft.icon') return 'ico';
	return mimeType === IMAGE_MIME_TYPES.jpeg ? 'jpg' : mimeType.split('/')[1];
}

/**
 * Normalize stored raster images once, before they enter Storage. Only formats
 * with a verified raster signature are accepted; SVG is rejected because
 * public SVG files can carry active content. GIFs are preserved to retain
 * animation, while all other supported formats are converted when useful.
 */
export async function optimizeImageForStorage(
	input,
	{ contentType = '', maxWidth = 2400, maxHeight = 1800, quality = 82 } = {}
) {
	const source = normalizeBuffer(input);
	const mimeType = normalizeMimeType(contentType);
	if (!mimeType.startsWith('image/')) {
		return {
			buffer: source,
			contentType: mimeType || contentType || 'application/octet-stream',
			extension: 'bin',
			originalBytes: source.byteLength,
			optimizedBytes: source.byteLength,
			optimized: false
		};
	}

	const icoMimeType = sniffIcoImageMimeType(source);
	if (icoMimeType && (ICO_MIME_TYPES.has(mimeType) || mimeType === 'image/octet-stream')) {
		return {
			buffer: source,
			contentType: icoMimeType,
			extension: 'ico',
			originalBytes: source.byteLength,
			optimizedBytes: source.byteLength,
			optimized: false
		};
	}

	const rasterMimeType = sniffRasterImageMimeType(source);
	if (!rasterMimeType) {
		throw new Error(
			'Unsupported or unsafe image format. Use a JPEG, PNG, WebP, AVIF, or GIF image.'
		);
	}
	const image = sharp(source, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS });
	const metadata = await image.metadata();
	const expectedFormat = Object.entries(IMAGE_MIME_TYPES).find(
		([, expectedMimeType]) => expectedMimeType === rasterMimeType
	)?.[0];
	if (metadata.format !== expectedFormat) {
		throw new Error('Image format could not be safely verified.');
	}
	const width = Number(metadata.width || 0);
	const height = Number(metadata.height || 0);
	if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
		throw new Error('Image dimensions exceed the supported limit.');
	}
	if (rasterMimeType === IMAGE_MIME_TYPES.gif) {
		if (Number(metadata.pages || 1) > 100) {
			throw new Error('Animated GIF contains too many frames.');
		}
		return {
			buffer: source,
			contentType: rasterMimeType,
			extension: extensionForMimeType(rasterMimeType),
			originalBytes: source.byteLength,
			optimizedBytes: source.byteLength,
			optimized: false
		};
	}

	const needsResize = width > maxWidth || height > maxHeight;
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
	const needsReencode = mimeType !== rasterMimeType;

	if (!needsResize && !needsReencode && transformed.byteLength >= source.byteLength) {
		return {
			buffer: source,
			contentType: rasterMimeType,
			extension: extensionForMimeType(rasterMimeType),
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
}

export function replaceFileExtension(fileName, extension) {
	const value = String(fileName || 'asset');
	const dot = value.lastIndexOf('.');
	const base = dot > 0 ? value.slice(0, dot) : value;
	return `${base}.${String(extension || 'bin').replace(/^\./, '')}`;
}
