import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
	buildAccountingBucketOptions,
	computeBoundedImageFrame,
	getImageOutputDimensions,
	IMAGE_FRAME_PRESETS,
	reassignAndOrderLearnArticles,
	reorderListItem
} from '#lib/ui/formControlHelpers.js';

function collectFiles(dir, suffix = '') {
	const results = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			results.push(...collectFiles(full, suffix));
		} else if (!suffix || full.endsWith(suffix)) {
			results.push(full);
		}
	}
	return results;
}

test('reorderListItem moves items deterministically and clamps target positions', () => {
	const items = ['a', 'b', 'c', 'd'];
	assert.deepEqual(reorderListItem(items, 2, 0), ['c', 'a', 'b', 'd']);
	assert.deepEqual(reorderListItem(items, 0, 99), ['b', 'c', 'd', 'a']);
	assert.deepEqual(reorderListItem(items, 3, -5), ['d', 'a', 'b', 'c']);
	assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('reassignAndOrderLearnArticles updates within-section and cross-section positions cleanly', () => {
	const subcategories = [
		{ slug: 'basics', name: 'Basics', sort_order: 0 },
		{ slug: 'laws', name: 'Laws', sort_order: 1 }
	];
	const articles = [
		{ id: 'art-1', title: 'Intro', subcategory_slug: null, sort_order: 0 },
		{ id: 'art-2', title: 'Helmets', subcategory_slug: 'basics', sort_order: 0 },
		{ id: 'art-3', title: 'Lights', subcategory_slug: 'basics', sort_order: 1 },
		{ id: 'art-4', title: 'Signals', subcategory_slug: 'laws', sort_order: 0 }
	];

	// Move 'Lights' to position 1 (index 0) within 'basics'
	const withinMove = reassignAndOrderLearnArticles(articles, subcategories, {
		articleId: 'art-3',
		targetIndex: 0
	});
	assert.equal(withinMove.position, 1);
	assert.equal(withinMove.sectionCount, 2);
	assert.deepEqual(
		withinMove.payload.filter((item) => item.subcategory_slug === 'basics'),
		[
			{ id: 'art-3', sort_order: 0, subcategory_slug: 'basics' },
			{ id: 'art-2', sort_order: 1, subcategory_slug: 'basics' }
		]
	);

	// Move 'Intro' from uncategorized to 'laws' at position 1 (index 0)
	const crossMove = reassignAndOrderLearnArticles(withinMove.articles, subcategories, {
		articleId: 'art-1',
		targetSubcategorySlug: 'laws',
		targetIndex: 0
	});
	assert.equal(crossMove.position, 1);
	assert.equal(crossMove.sectionCount, 2);
	assert.equal(crossMove.sectionSlug, 'laws');
	assert.deepEqual(
		crossMove.payload.filter((item) => item.subcategory_slug === 'laws'),
		[
			{ id: 'art-1', sort_order: 0, subcategory_slug: 'laws' },
			{ id: 'art-4', sort_order: 1, subcategory_slug: 'laws' }
		]
	);
	assert.equal(crossMove.payload.filter((item) => item.subcategory_slug === null).length, 0);
});

test('buildAccountingBucketOptions preserves existing buckets and includes canonical fallbacks', () => {
	const options = buildAccountingBucketOptions(
		'expense',
		[{ displayGroup: 'Money out' }, { displayGroup: 'Event Operations' }],
		'Money out'
	);
	assert.deepEqual(options, ['Money out', 'Event Operations', 'Other']);
});

test('getImageOutputDimensions and computeBoundedImageFrame preserve 800x800 logo and 1600x900 cover geometry', () => {
	const logoDims = getImageOutputDimensions('logo');
	const coverDims = getImageOutputDimensions('cover');
	assert.equal(logoDims.width, 800);
	assert.equal(logoDims.height, 800);
	assert.equal(coverDims.width, 1600);
	assert.equal(coverDims.height, 900);
	assert.equal(IMAGE_FRAME_PRESETS.length, 9);

	// 1600x1200 image in a 1600x900 cover frame at 100% zoom:
	// Top preset (panY = -100) aligns top edge (drawY = 0)
	const topCover = computeBoundedImageFrame({
		naturalWidth: 1600,
		naturalHeight: 1200,
		frameWidth: coverDims.width,
		frameHeight: coverDims.height,
		zoom: 1,
		panX: 0,
		panY: -100
	});
	assert.equal(topCover.drawWidth, 1600);
	assert.equal(topCover.drawHeight, 1200);
	assert.equal(topCover.drawX, 0);
	assert.equal(topCover.drawY, 0);

	// Bottom preset (panY = 100) aligns bottom edge (drawY + drawHeight = 900)
	const bottomCover = computeBoundedImageFrame({
		naturalWidth: 1600,
		naturalHeight: 1200,
		frameWidth: coverDims.width,
		frameHeight: coverDims.height,
		zoom: 1,
		panX: 0,
		panY: 100
	});
	assert.equal(bottomCover.drawY + bottomCover.drawHeight, 900);

	// Out-of-bounds zoom and pan clamp safely without exposing gaps
	const clampedLogo = computeBoundedImageFrame({
		naturalWidth: 1200,
		naturalHeight: 800,
		frameWidth: logoDims.width,
		frameHeight: logoDims.height,
		zoom: 99,
		panX: 500,
		panY: -500,
		minZoom: 1,
		maxZoom: 3
	});
	assert.equal(clampedLogo.zoom, 3);
	assert.equal(clampedLogo.panX, 100);
	assert.equal(clampedLogo.panY, -100);
	assert.ok(clampedLogo.drawX <= 0);
	assert.ok(clampedLogo.drawX + clampedLogo.drawWidth >= logoDims.width);
	assert.ok(clampedLogo.drawY <= 0);
	assert.ok(clampedLogo.drawY + clampedLogo.drawHeight >= logoDims.height);
});

test('repository removes svelte-dnd-action, setPointerCapture drag handlers, and rounded/blur classes in shared controls', () => {
	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
	assert.equal(pkg.dependencies?.['svelte-dnd-action'], undefined);
	assert.equal(pkg.devDependencies?.['svelte-dnd-action'], undefined);

	for (const file of collectFiles('src')) {
		if (file.endsWith('formNativeControls.test.js')) continue;
		const content = readFileSync(file, 'utf8');
		assert.ok(
			!content.includes('svelte-dnd-action'),
			`Expected ${file} not to reference svelte-dnd-action`
		);
		assert.ok(
			!/\b(dndzone|dragHandleZone|dragHandle)\b/.test(content),
			`Expected ${file} not to import or use dndzone/dragHandleZone/dragHandle`
		);
		assert.ok(
			!content.includes('setPointerCapture'),
			`Expected ${file} not to use setPointerCapture`
		);
	}

	for (const sharedControl of [
		'src/lib/components/ui/PositionAssignmentBar.svelte',
		'src/lib/components/ui/SliderImageFramer.svelte'
	]) {
		const markup = readFileSync(sharedControl, 'utf8');
		assert.ok(
			!/\brounded-/.test(markup),
			`Expected ${sharedControl} to have zero rounded-* classes`
		);
		assert.ok(
			!/\bbackdrop-blur\b/.test(markup),
			`Expected ${sharedControl} to have zero backdrop-blur classes`
		);
	}
});
