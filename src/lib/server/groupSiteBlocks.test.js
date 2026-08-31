import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildDefaultGroupSiteBlocks,
	createGroupSiteBlock,
	deriveLegacySiteVisibility,
	GROUP_SITE_BLOCK_LIMIT,
	groupSiteBlockOrder,
	getGroupSiteBlockTone,
	hasGroupSiteBlock,
	normalizeGroupSiteBlocks
} from '../microsites/blocks.js';
import {
	normalizeGroupSiteConfig,
	parseGroupSiteFormData,
	serializeGroupSiteConfig
} from '../microsites/config.js';

test('action blocks receive a varied, deterministic visual rhythm', () => {
	const actionTypes = [
		'call_to_action',
		'updates',
		'volunteer',
		'email_signup',
		'resources',
		'membership'
	];
	const tones = actionTypes.map((type, index) => getGroupSiteBlockTone(type, index));
	assert.deepEqual(tones, ['surface', 'secondary', 'tertiary', 'surface', 'secondary', 'tertiary']);
	assert.equal(new Set(tones).size, 3);
	assert.equal(getGroupSiteBlockTone('story', 1), 'surface');
});

test('legacy section visibility becomes a stable default block order', () => {
	const blocks = buildDefaultGroupSiteBlocks({
		sections: {
			story: false,
			rides: true,
			volunteer: false,
			news: false,
			gallery: true,
			contact: false
		},
		rideWidgetEnabled: true
	});
	assert.deepEqual(
		blocks.map((block) => block.type),
		['hero', 'events', 'gallery', 'ride_calendar', 'sponsors', 'donation']
	);
	assert.deepEqual(normalizeGroupSiteBlocks(blocks), blocks);
});

test('normalization pins one hero first and rejects unknown or duplicate singleton blocks', () => {
	const blocks = normalizeGroupSiteBlocks([
		{ id: 'gallery', type: 'gallery', title: 'Photos' },
		{ id: 'bad', type: 'script', body: '<script>alert(1)</script>' },
		{ id: 'gallery-copy', type: 'gallery', title: 'Duplicate' },
		{ id: 'hero-custom', type: 'hero', title: 'Ignored hero title' },
		{ id: 'story', type: 'story' }
	]);
	assert.deepEqual(
		blocks.map((block) => block.type),
		['hero', 'gallery', 'story']
	);
	assert.equal(blocks[0].id, 'hero-custom');
	assert.equal(blocks[1].title, 'Photos');
});

test('source-specific gallery collections survive normalization and serialization', () => {
	const blocks = normalizeGroupSiteBlocks([
		{ type: 'hero', title: 'A page' },
		{ type: 'gallery', gallery_source_page: 'bike-racks', title: 'Rack archive' }
	]);
	assert.equal(blocks.find((block) => block.type === 'gallery').gallery_source_page, 'bike-racks');
});

test('repeatable block IDs remain unique, deterministic, and capped', () => {
	const input = Array.from({ length: GROUP_SITE_BLOCK_LIMIT + 8 }, (_, index) => ({
		id: index < 2 ? 'duplicate' : '',
		type: 'text',
		title: `Text ${index}`
	}));
	const first = normalizeGroupSiteBlocks(input);
	const second = normalizeGroupSiteBlocks(input);
	assert.equal(first.length, GROUP_SITE_BLOCK_LIMIT);
	assert.equal(new Set(first.map((block) => block.id)).size, GROUP_SITE_BLOCK_LIMIT);
	assert.deepEqual(first, second);
	assert.equal(first[0].type, 'hero');
});

test('custom links are normalized without allowing arbitrary protocols', () => {
	assert.equal(
		createGroupSiteBlock('call_to_action', { overrides: { button_url: 'example.org/join' } })
			.button_url,
		'https://example.org/join'
	);
	assert.equal(
		createGroupSiteBlock('call_to_action', { overrides: { button_url: 'javascript:alert(1)' } })
			.button_url,
		''
	);
});

test('common owner task blocks have useful safe defaults and remain singletons', () => {
	const taskTypes = ['email_signup', 'membership', 'volunteer', 'updates', 'resources'];
	const blocks = normalizeGroupSiteBlocks([
		{ type: 'hero' },
		...taskTypes.map((type) => ({ type })),
		{ type: 'email_signup', title: 'Duplicate signup' }
	]);
	assert.deepEqual(
		blocks.map((block) => block.type),
		['hero', ...taskTypes]
	);
	for (const type of taskTypes) {
		const block = blocks.find((candidate) => candidate.type === type);
		assert.ok(block.title);
		assert.ok(block.button_label);
		assert.doesNotMatch(block.button_url, /^javascript:/i);
	}
	assert.equal(blocks.find((block) => block.type === 'email_signup').button_url, '');
	assert.equal(blocks.find((block) => block.type === 'updates').button_url, '/updates');
	assert.equal(blocks.find((block) => block.type === 'resources').button_url, '/assets');
});

test('block order derives public visibility and legacy compatibility flags', () => {
	const blocks = normalizeGroupSiteBlocks([
		{ type: 'hero' },
		{ type: 'contact' },
		{ type: 'text', id: 'welcome' },
		{ type: 'ride_calendar' }
	]);
	const visibility = deriveLegacySiteVisibility(blocks, { join: true });
	assert.equal(hasGroupSiteBlock(blocks, 'contact'), true);
	assert.equal(hasGroupSiteBlock(blocks, 'gallery'), false);
	assert.equal(groupSiteBlockOrder(blocks, 'text'), 2);
	assert.deepEqual(visibility, {
		sections: {
			join: true,
			story: false,
			rides: false,
			volunteer: false,
			news: false,
			gallery: false,
			contact: true
		},
		ride_widget_enabled: true
	});
});

test('config serialization and form parsing preserve block copy and order', () => {
	const config = normalizeGroupSiteConfig({
		page_blocks: [
			{ type: 'hero' },
			{ type: 'call_to_action', id: 'join-us', title: 'Join us' },
			{ type: 'story', title: 'Our story' }
		],
		site_pages: [
			{
				title: 'Home',
				is_home: true,
				blocks: [
					{ type: 'hero' },
					{ type: 'call_to_action', id: 'join-us', title: 'Join us' },
					{ type: 'story', title: 'Our story' }
				]
			},
			{ title: 'Safety', slug: 'safety', blocks: [{ type: 'hero' }, { type: 'text' }] }
		]
	});
	const serialized = serializeGroupSiteConfig(config);
	assert.deepEqual(
		serialized.site_pages.map((page) => page.slug),
		['', 'safety']
	);
	assert.deepEqual(
		serialized.page_blocks.map((block) => [block.type, block.title]),
		[
			['hero', ''],
			['call_to_action', 'Join us'],
			['story', 'Our story']
		]
	);

	const formData = new FormData();
	formData.set('site_title', 'Block test');
	formData.set('page_blocks_json', JSON.stringify(serialized.page_blocks));
	const parsed = parseGroupSiteFormData(formData);
	assert.deepEqual(parsed.page_blocks, serialized.page_blocks);
});
