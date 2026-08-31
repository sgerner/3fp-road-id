import assert from 'node:assert/strict';
import test from 'node:test';
import {
	extractSourcePageMedia,
	mergeSourcePhotos,
	parsePost,
	SOURCE_FILES,
	SOURCE_LINKS,
	SOURCE_PHOTOS
} from '../../../scripts/seed-tbag-site.mjs';
import {
	buildTempeBicycleActionGroupSite,
	mapTbagLegacyUrl,
	tbagSourceMediaKey,
	TBAG_SOURCE_CONTENT_REVISION
} from '../microsites/tempeBicycleActionGroup.js';

test('TBAG importer drops unsafe protocols from archived post markup', () => {
	const post = parsePost(
		'https://www.biketempe.org/archived-update/',
		`<article class="type-post status-publish">
			<h1 class="entry-title">Archived update</h1>
			<span class="posts-date">January 1, 2026</span>
			<div class="entry-content">
				<p>This is a meaningful archived update with enough content to become a summary.</p>
				<p><a href="javascript:alert(1)">Unsafe link</a> <a href="/safe">Safe link</a></p>
			</div>
		</article>`
	);

	assert.ok(post);
	assert.doesNotMatch(post.body_markdown, /javascript:/i);
	assert.doesNotMatch(post.body_markdown, /biketempe\.org/i);
	assert.match(post.body_markdown, /\[Safe link\]\(\/assets\)/);
});

test('TBAG legacy public links resolve to routes on the replacement site', () => {
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/calendar'), '/calendar');
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/current-board'), '/board');
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/by-laws'), '/bylaws');
	assert.equal(
		mapTbagLegacyUrl('https://www.biketempe.org/advocacy-resources'),
		'/advocacy-resources'
	);
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/count'), '/bike-count-2025');
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/racks'), '/bike-racks');
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/bike-valet'), '/bike-valet');
	assert.equal(
		mapTbagLegacyUrl('https://www.biketempe.org/cyclists-feat-farmer-artwork'),
		'/cyclists-feat'
	);
	assert.equal(
		mapTbagLegacyUrl('https://www.biketempe.org/bicycle-friendly-restaurants'),
		'/bike-friendly-businesses'
	);
	assert.equal(mapTbagLegacyUrl('https://biketempe.org/donate'), '/join#donate');
	assert.equal(mapTbagLegacyUrl('https://biketempe.org/join-us'), '/join');
	assert.equal(mapTbagLegacyUrl('https://biketempe.org/general'), '/general');
	assert.equal(
		mapTbagLegacyUrl('https://biketempe.org/social-contract-to-volunteers'),
		'/social-contract-to-volunteers'
	);
	assert.equal(mapTbagLegacyUrl('https://www.biketempe.org/2025/safer-streets'), '/updates');
	assert.equal(
		mapTbagLegacyUrl('https://www.biketempe.org/wp-content/uploads/guide.pdf'),
		'/assets'
	);
	assert.equal(mapTbagLegacyUrl('https://3fp.org'), 'https://3fp.org');
	assert.equal(
		mapTbagLegacyUrl('https://biketempe.org.evil.example/guide'),
		'https://biketempe.org.evil.example/guide'
	);
});

test('TBAG source-audited pages preserve the legacy resource set and source details', () => {
	const config = buildTempeBicycleActionGroupSite({
		name: 'Tempe Bicycle Action Group',
		city: 'Tempe',
		state_region: 'AZ'
	});
	const pages = new Map(config.site_pages.map((page) => [page.slug || 'home', page]));

	assert.equal(config.site_pages.length, 16);
	for (const slug of [
		'about',
		'board',
		'bylaws',
		'advocacy-resources',
		'bike-count-data',
		'bike-count-2025',
		'bike-racks',
		'bike-valet',
		'cyclists-feat',
		'bike-friendly-businesses',
		'general',
		'social-contract-to-volunteers'
	]) {
		assert.equal(pages.get(slug)?.source_revision, TBAG_SOURCE_CONTENT_REVISION, slug);
	}

	assert.match(JSON.stringify(pages.get('board')), /Katie Boligitz/);
	assert.match(JSON.stringify(pages.get('board')), /Chris Crosby/);
	assert.match(JSON.stringify(pages.get('bylaws')), /ARTICLE I/);
	assert.match(JSON.stringify(pages.get('advocacy-resources')), /480-350-4311/);
	assert.match(JSON.stringify(pages.get('bike-count-data')), /Tempe Bike Count archive/);
	assert.match(JSON.stringify(pages.get('general')), /P\.O\. Box 1884/);
	assert.match(JSON.stringify(pages.get('social-contract-to-volunteers')), /Basecamp/);
	assert.ok(
		config.site_pages.every((page) => page.blocks.every((block) => block.body.length <= 1200))
	);
});

test('TBAG archive seed includes the source documents and resource routes', () => {
	assert.equal(SOURCE_FILES.length, 11);
	assert.ok(
		SOURCE_FILES.some(
			([title, url]) => title.startsWith('Bylaws') && url.endsWith('Bylaws_amended_7-21.pdf')
		)
	);
	assert.ok(
		SOURCE_FILES.filter(([, url]) => /Tempe[_-]Bike[_-]Count|Tempe-Bike-Count/.test(url)).length >=
			9
	);
	assert.ok(
		SOURCE_LINKS.some(([title, url]) => title === 'General contact' && /\/general$/.test(url))
	);
	assert.ok(
		SOURCE_LINKS.some(
			([title, url]) =>
				title === 'Social Contract to Volunteers' && url.endsWith('/social-contract-to-volunteers')
		)
	);
});

test('TBAG photo seed keeps page-specific source collections instead of a shared gallery fallback', () => {
	const counts = Object.groupBy(SOURCE_PHOTOS, ([, , , sourcePage]) => sourcePage);
	assert.equal(counts['bike-racks']?.length, 9);
	assert.equal(counts['bike-valet']?.length, 2);
	assert.equal(counts['cyclists-feat']?.length, 10);
	assert.equal(counts['bike-friendly-businesses']?.length, 8);
	assert.equal(counts['bike-count-2025']?.length, 1);
	assert.ok(counts.board?.length >= 1);
	assert.ok(
		SOURCE_PHOTOS.every(
			([, sourceUrl, , sourcePage]) => sourceUrl.includes('biketempe.org') && sourcePage
		)
	);

	const additional = [
		[
			'New source image',
			'https://www.biketempe.org/wp-content/uploads/2026/01/new.jpg',
			'Imported',
			'bike-racks'
		]
	];
	const merged = mergeSourcePhotos(additional);
	assert.equal(merged.length, SOURCE_PHOTOS.length + 1);
	assert.equal(merged.find((photo) => photo[1].endsWith('/new.jpg'))?.[3], 'bike-racks');
	assert.equal(
		tbagSourceMediaKey('https://www.biketempe.org/wp-content/uploads/2023/01/image-1024x577.jpg'),
		tbagSourceMediaKey('https://www.biketempe.org/wp-content/uploads/2023/01/image-scaled.jpg')
	);
});

test('TBAG source media extraction ignores shared chrome and preserves source-page ownership', () => {
	const sourceMedia = extractSourcePageMedia(
		'bike-racks',
		`<article class="page page-id-1">
			<div class="entry-content">
				<p>Original page copy.</p>
				<a href="/wp-content/uploads/2022/11/Rag-O-Rama.jpg"><img src="/wp-content/uploads/2022/11/Rag-O-Rama-300x200.jpg" alt="Rag-O-Rama" /></a>
				<a href="/rag-o-rama-bike-rack/"><img src="/wp-content/uploads/2022/11/New.jpg" alt="New preview" /></a>
				<img src="/wp-content/uploads/2022/11/Dance-Studio-1.jpg" alt="" />
			</div>
			<div class="shared-footer"><img src="/wp-content/uploads/2022/11/unrelated.jpg" /></div>
		</article>`
	);
	assert.deepEqual(
		sourceMedia.map(([, url, , page]) => [url, page]),
		[
			['https://www.biketempe.org/wp-content/uploads/2022/11/Rag-O-Rama.jpg', 'bike-racks'],
			['https://www.biketempe.org/wp-content/uploads/2022/11/New.jpg', 'bike-racks'],
			['https://www.biketempe.org/wp-content/uploads/2022/11/Dance-Studio-1.jpg', 'bike-racks']
		]
	);
});
