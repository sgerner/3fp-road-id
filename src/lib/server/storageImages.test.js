import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeImageForStorage, sniffRasterImageMimeType } from './storageImages.js';

test('unsafe vector and mislabeled active image content are not stored as-is', async () => {
	const svg = Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'
	);
	assert.equal(sniffRasterImageMimeType(svg), null);
	await assert.rejects(
		optimizeImageForStorage(svg, { contentType: 'image/svg+xml' }),
		/Unsupported or unsafe image format/
	);
});

test('image bytes determine the stored MIME type when the client header is wrong', async () => {
	const png = await sharp({
		create: { width: 8, height: 8, channels: 4, background: '#ff0000' }
	})
		.png()
		.toBuffer();
	const optimized = await optimizeImageForStorage(png, { contentType: 'image/svg+xml' });
	assert.equal(optimized.contentType, 'image/webp');
	assert.equal(optimized.extension, 'webp');
	assert.equal((await sharp(optimized.buffer).metadata()).format, 'webp');
});

test('malformed image data fails closed instead of being copied into public storage', async () => {
	await assert.rejects(
		optimizeImageForStorage(Buffer.from('<script>alert(1)</script>'), {
			contentType: 'image/png'
		}),
		/Unsupported or unsafe image format/
	);
});
