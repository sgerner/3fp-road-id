import assert from 'node:assert/strict';
import test from 'node:test';
import { isOptimizableImageHost, optimizedImageUrl, watchImageError } from '../media/optimized.js';

function createMockImage({
	src = 'https://club.example.org/logo.png',
	complete = false,
	naturalWidth = 0
} = {}) {
	const listeners = new Map();
	return {
		src,
		currentSrc: src,
		complete,
		naturalWidth,
		dataset: {},
		getAttribute(name) {
			return name === 'src' ? this.src : null;
		},
		addEventListener(type, handler) {
			const set = listeners.get(type) ?? new Set();
			set.add(handler);
			listeners.set(type, set);
		},
		removeEventListener(type, handler) {
			listeners.get(type)?.delete(handler);
		},
		dispatchError() {
			for (const handler of listeners.get('error') ?? []) {
				handler({ type: 'error', currentTarget: this });
			}
		},
		listenerCount(type) {
			return listeners.get(type)?.size ?? 0;
		}
	};
}

test('optimizedImageUrl upgrades unproxied http:// URLs to https:// while leaving https:// and relative URLs intact', () => {
	assert.equal(isOptimizableImageHost('http://club.example.org/favicon.ico'), false);
	assert.equal(
		optimizedImageUrl('http://club.example.org/favicon.ico'),
		'https://club.example.org/favicon.ico'
	);
	assert.equal(
		optimizedImageUrl('HTTP://club.example.org/banner.jpg?size=lg'),
		'https://club.example.org/banner.jpg?size=lg'
	);
	assert.equal(
		optimizedImageUrl('https://club.example.org/banner.jpg'),
		'https://club.example.org/banner.jpg'
	);
	assert.equal(optimizedImageUrl('/images/default-ride.webp'), '/images/default-ride.webp');
	assert.equal(optimizedImageUrl(''), '');
});

test('optimizedImageUrl routes allowlisted hosts through /api/media/image', () => {
	assert.equal(
		isOptimizableImageHost('https://files.cdn.printful.com/files/abc/preview.png'),
		true
	);
	assert.equal(isOptimizableImageHost('http://pmbcaz.org/uploads/cover.jpg'), true);

	const printfulProxy = optimizedImageUrl('https://files.cdn.printful.com/files/abc/preview.png', {
		width: 768,
		quality: 64
	});
	assert.equal(
		printfulProxy,
		'/api/media/image?src=https%3A%2F%2Ffiles.cdn.printful.com%2Ffiles%2Fabc%2Fpreview.png&width=768&quality=64'
	);

	const httpAllowlistedProxy = optimizedImageUrl('http://pmbcaz.org/uploads/cover.jpg', {
		width: 96,
		height: 96,
		quality: 64
	});
	assert.equal(
		httpAllowlistedProxy,
		'/api/media/image?src=http%3A%2F%2Fpmbcaz.org%2Fuploads%2Fcover.jpg&width=96&quality=64&height=96'
	);
});

test('watchImageError triggers immediately during hydration when image already failed before mount', () => {
	const brokenBeforeHydration = createMockImage({
		src: '/api/media/image?src=https%3A%2F%2Ffiles.cdn.printful.com%2Fexpired.png',
		complete: true,
		naturalWidth: 0
	});
	let calls = 0;
	const action = watchImageError(brokenBeforeHydration, () => {
		calls += 1;
	});
	assert.equal(calls, 1);

	// Re-running update with the same broken src does not double-fire
	action.update(() => {
		calls += 1;
	});
	assert.equal(calls, 1);
	action.destroy();
	assert.equal(brokenBeforeHydration.listenerCount('error'), 0);
});

test('watchImageError ignores pending or loaded images until an error event occurs', () => {
	const pendingImage = createMockImage({
		src: 'https://club.example.org/logo.ico',
		complete: false,
		naturalWidth: 0
	});
	const loadedImage = createMockImage({
		src: 'https://club.example.org/cover.webp',
		complete: true,
		naturalWidth: 768
	});

	let failedUrls = [];
	const pendingAction = watchImageError(pendingImage, (node) => {
		failedUrls.push(node.src);
	});
	const loadedAction = watchImageError(loadedImage, (node) => {
		failedUrls.push(node.src);
	});

	assert.deepEqual(failedUrls, []);

	pendingImage.complete = true;
	pendingImage.naturalWidth = 0;
	pendingImage.dispatchError();
	assert.deepEqual(failedUrls, ['https://club.example.org/logo.ico']);

	pendingAction.destroy();
	loadedAction.destroy();
	pendingImage.dispatchError();
	assert.deepEqual(failedUrls, ['https://club.example.org/logo.ico']);
});
