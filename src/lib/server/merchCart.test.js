import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { get } from 'svelte/store';
import { merchCart } from '../merch/cart.js';

const STORAGE_KEY = '3fp_merch_cart_main';

function createMemoryStorage() {
	const store = new Map();
	return {
		getItem(key) {
			return store.has(key) ? store.get(key) : null;
		},
		setItem(key, value) {
			store.set(key, String(value));
		},
		removeItem(key) {
			store.delete(key);
		},
		clear() {
			store.clear();
		}
	};
}

let originalWindow;
let localStorageMock;

beforeEach(() => {
	originalWindow = /** @type {any} */ (globalThis).window;
	localStorageMock = createMemoryStorage();
	/** @type {any} */ (globalThis).window = { localStorage: localStorageMock };
	merchCart.clear();
});

afterEach(() => {
	merchCart.clear();
	if (originalWindow === undefined) {
		delete (/** @type {any} */ (globalThis).window);
	} else {
		/** @type {any} */ (globalThis).window = originalWindow;
	}
});

test('merchCart.add normalizes new items, merges duplicate variants, clamps to 20, and persists', () => {
	merchCart.add({
		variantId: 'var-tee-m',
		productName: 'Neon Ride Tee',
		variantName: 'Medium',
		priceCents: 2800,
		quantity: 2
	});

	let items = get(merchCart);
	assert.equal(items.length, 1);
	assert.deepEqual(items[0], {
		variantId: 'var-tee-m',
		productName: 'Neon Ride Tee',
		productImageUrl: '',
		variantName: 'Medium',
		optionValues: {},
		partnerProvider: 'manual',
		priceCents: 2800,
		quantity: 2
	});

	merchCart.add({
		variantId: 'var-tee-m',
		productName: 'Neon Ride Tee',
		variantName: 'Medium',
		priceCents: 2800,
		quantity: 25
	});

	items = get(merchCart);
	assert.equal(items.length, 1);
	assert.equal(items[0].quantity, 20);
	assert.deepEqual(JSON.parse(localStorageMock.getItem(STORAGE_KEY)), items);
});

test('merchCart.setQuantity clamps quantities from 1 to 20 and preserves other lines', () => {
	merchCart.add({
		variantId: 'var-sticker',
		productName: '3FP Bumper Sticker',
		variantName: 'Standard',
		partnerProvider: 'manual',
		priceCents: 500,
		quantity: 3
	});
	merchCart.add({
		variantId: 'var-mug',
		productName: 'Camp Mug',
		variantName: '12oz',
		partnerProvider: 'printful',
		priceCents: 1850,
		quantity: 2
	});

	merchCart.setQuantity('var-sticker', 7);
	assert.equal(get(merchCart)[0].quantity, 7);
	assert.equal(get(merchCart)[1].quantity, 2);

	merchCart.setQuantity('var-sticker', -4);
	assert.equal(get(merchCart)[0].quantity, 1);

	merchCart.setQuantity('var-sticker', 0);
	// Number(0 || 1) evaluates to 1, clamping minimum quantity at 1
	assert.equal(get(merchCart)[0].quantity, 1);

	merchCart.setQuantity('var-sticker', 99);
	assert.equal(get(merchCart)[0].quantity, 20);
	assert.equal(get(merchCart)[1].quantity, 2);

	const persisted = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
	assert.equal(persisted.length, 2);
	assert.equal(persisted[0].quantity, 20);
	assert.equal(persisted[1].quantity, 2);
});

test('merchCart.remove deletes only the target variant and updates localStorage', () => {
	merchCart.add({
		variantId: 'var-1',
		productName: 'Reflective Vest',
		variantName: 'L/XL',
		priceCents: 2200,
		quantity: 1
	});
	merchCart.add({
		variantId: 'var-2',
		productName: 'Water Bottle',
		variantName: '24oz',
		priceCents: 1550,
		quantity: 4
	});

	merchCart.remove('var-1');
	assert.deepEqual(
		get(merchCart).map((item) => item.variantId),
		['var-2']
	);
	assert.deepEqual(
		JSON.parse(localStorageMock.getItem(STORAGE_KEY)).map((item) => item.variantId),
		['var-2']
	);

	merchCart.remove('var-2');
	assert.deepEqual(get(merchCart), []);
	assert.deepEqual(JSON.parse(localStorageMock.getItem(STORAGE_KEY)), []);
});

test('merchCart.load hydrates persisted items and ignores malformed storage', () => {
	const savedItems = [
		{
			variantId: 'var-cap',
			productName: 'Cycling Cap',
			productImageUrl: 'https://3fp.org/cap.png',
			variantName: 'One Size',
			optionValues: { Size: 'One Size' },
			partnerProvider: 'printful',
			priceCents: 2400,
			quantity: 5
		}
	];
	localStorageMock.setItem(STORAGE_KEY, JSON.stringify(savedItems));

	merchCart.load();
	assert.deepEqual(get(merchCart), savedItems);

	localStorageMock.setItem(STORAGE_KEY, '{not-valid-json');
	merchCart.load();
	assert.deepEqual(get(merchCart), savedItems);

	delete (/** @type {any} */ (globalThis).window);
	assert.doesNotThrow(() => {
		merchCart.load();
		merchCart.setQuantity('var-cap', 6);
	});
	assert.equal(get(merchCart)[0].quantity, 6);
});
