import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGroupSiteBlocks } from '../microsites/blocks.js';
import {
	buildGroupSiteTemplate,
	GROUP_SITE_TEMPLATES,
	recommendGroupSiteTemplate
} from '../microsites/templates.js';
import { buildDefaultGroupSiteConfig, normalizeGroupSiteConfig } from '../microsites/config.js';
import {
	buildTempeBicycleActionGroupSite,
	isTempeBicycleActionGroup,
	TBAG_INTERNAL_ROUTES,
	TBAG_COLORS,
	TBAG_SOURCE_CONTENT_REVISION
} from '../microsites/tempeBicycleActionGroup.js';

test('every bicycle group template produces a valid, useful page system', () => {
	assert.equal(GROUP_SITE_TEMPLATES.length, 5);
	for (const template of GROUP_SITE_TEMPLATES) {
		const config = buildGroupSiteTemplate(template.id, {
			group: { name: 'Example Riders', city: 'Mesa', state_region: 'AZ' }
		});
		assert.equal(config.theme_mode, 'custom');
		assert.match(config.site_tagline, /Mesa|ride|street|trail|team/i);
		assert.equal(config.page_blocks[0].type, 'hero');
		assert.deepEqual(normalizeGroupSiteBlocks(config.page_blocks), config.page_blocks);
		assert.ok(config.page_blocks.length >= 7);
		assert.ok(config.page_blocks.some((block) => block.button_label));
		assert.ok(/^#[0-9A-F]{6}$/i.test(config.theme_colors.primary));
	}
});

test('template recommendations recognize common bicycle organization types', () => {
	assert.equal(
		recommendGroupSiteTemplate({ groupTypeNames: ['Advocacy Organization'] }),
		'advocacy'
	);
	assert.equal(
		recommendGroupSiteTemplate({ group: { description: 'Competitive road racing team' } }),
		'racing'
	);
	assert.equal(
		recommendGroupSiteTemplate({ group: { name: 'Desert MTB Trail Alliance' } }),
		'trail-stewardship'
	);
	assert.equal(
		recommendGroupSiteTemplate({ groupTypeNames: ['Social Cycling Club'] }),
		'community'
	);
});

test('TBAG receives a focused advocacy site with a compact navigation', () => {
	const config = buildTempeBicycleActionGroupSite({
		name: 'Tempe Bicycle Action Group',
		city: 'Tempe',
		state_region: 'AZ'
	});

	assert.equal(config.site_variant, 'tbag');
	assert.equal(config.hero_style, 'bold');
	assert.deepEqual(config.theme_colors, TBAG_COLORS);
	assert.equal(config.ride_widget_enabled, false);
	assert.deepEqual(
		config.site_pages.map((page) => page.slug),
		[
			'',
			'take-action',
			'projects',
			'calendar',
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
		]
	);
	assert.deepEqual(
		config.site_pages[0].navigation.items
			.filter((item) => item.placement === 'primary')
			.map((item) => item.id),
		['page:home', 'page:take-action', 'page:projects', 'page:about']
	);
	assert.ok(config.page_blocks.some((block) => block.type === 'email_signup'));
	assert.ok(config.page_blocks.some((block) => block.type === 'resources'));
	assert.equal(
		config.site_pages.find((page) => page.slug === 'calendar').blocks[0].button_label,
		'Open the calendar'
	);
	assert.equal(
		config.site_pages
			.find((page) => page.slug === 'bike-racks')
			.blocks.find((block) => block.type === 'gallery').gallery_source_page,
		'bike-racks'
	);
	assert.equal(
		config.site_pages
			.find((page) => page.slug === 'cyclists-feat')
			.blocks.find((block) => block.type === 'gallery').gallery_source_page,
		'cyclists-feat'
	);
	assert.equal(
		config.site_pages
			.find((page) => page.slug === 'take-action')
			.blocks.find((block) => block.type === 'volunteer').button_url,
		TBAG_INTERNAL_ROUTES.join
	);
	assert.equal(config.site_pages.find((page) => page.slug === 'board').show_in_nav, false);
	assert.equal(
		config.site_pages.find((page) => page.slug === 'general').blocks[0].button_url,
		'mailto:info@biketempe.org'
	);
	assert.equal(
		config.site_pages.find((page) => page.slug === 'social-contract-to-volunteers').source_revision,
		TBAG_SOURCE_CONTENT_REVISION
	);
	assert.equal(
		config.site_pages.find((page) => page.slug === 'bylaws').blocks.at(-1).button_url,
		TBAG_INTERNAL_ROUTES.action
	);
	assert.doesNotMatch(JSON.stringify(config), /https?:\/\/(?:www\.)?biketempe\.org/i);
});

test('known TBAG groups are upgraded to the advocacy variant by default', () => {
	const config = buildDefaultGroupSiteConfig({
		name: 'Tempe Bicycle Action Group',
		website_url: 'https://www.biketempe.org'
	});
	assert.equal(config.site_variant, 'tbag');
	assert.equal(config.site_title, 'Tempe Bicycle Action Group');
});

test('saved TBAG configs keep the imported resource pages available to the editor', () => {
	const config = normalizeGroupSiteConfig(
		{
			site_variant: 'tbag',
			site_pages: [
				{
					id: 'home',
					title: 'Home',
					is_home: true,
					blocks: [{ type: 'hero' }]
				},
				{
					id: 'about',
					title: 'About',
					slug: 'about',
					blocks: [{ type: 'hero' }]
				}
			]
		},
		{ group: { name: 'Tempe Bicycle Action Group', slug: 'tempe-bicycle-action-group' } }
	);

	assert.ok(config.site_pages.some((page) => page.slug === 'board'));
	assert.ok(config.site_pages.some((page) => page.slug === 'bylaws'));
	assert.ok(config.site_pages.some((page) => page.slug === 'bike-valet'));
	assert.equal(
		config.site_pages.find((page) => page.slug === 'about').source_revision,
		TBAG_SOURCE_CONTENT_REVISION
	);
	assert.match(
		JSON.stringify(config.site_pages.find((page) => page.slug === 'about')),
		/unified voice/i
	);
	assert.ok(config.site_pages.some((page) => page.slug === 'general'));
	assert.ok(config.site_pages.some((page) => page.slug === 'social-contract-to-volunteers'));
	assert.ok(config.site_pages.every((page) => page.blocks[0].type === 'hero'));
});

test('TBAG detection only accepts the real biketempe.org domain', () => {
	assert.equal(isTempeBicycleActionGroup({ website_url: 'https://www.biketempe.org/about' }), true);
	assert.equal(
		isTempeBicycleActionGroup({ website_url: 'https://biketempe.org.evil.example' }),
		false
	);
	assert.equal(isTempeBicycleActionGroup({ website_url: 'https://notbiketempe.org' }), false);
});
