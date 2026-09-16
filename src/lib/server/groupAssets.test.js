import assert from 'node:assert/strict';
import test from 'node:test';
import { groupGroupAssetsByBucket, sortGroupAssets } from '../groups/assets.js';

test('group assets honor an explicit display order before recency', () => {
	const sorted = sortGroupAssets([
		{ title: 'Second', sort_order: 1, updated_at: '2026-08-30T12:00:00Z' },
		{ title: 'First', sort_order: 0, updated_at: '2026-08-30T11:00:00Z' }
	]);

	assert.deepEqual(
		sorted.map((asset) => asset.title),
		['First', 'Second']
	);
});

test('public asset buckets exclude unsafe legacy URLs', () => {
	const buckets = groupGroupAssetsByBucket([
		{ id: 'unsafe', asset_kind: 'link', external_url: 'javascript:alert(1)' },
		{ id: 'safe', asset_kind: 'link', external_url: 'https://example.org/resource' }
	]);

	assert.deepEqual(
		buckets.find((bucket) => bucket.slug === 'links').assets.map((asset) => asset.href),
		['https://example.org/resource']
	);
});
