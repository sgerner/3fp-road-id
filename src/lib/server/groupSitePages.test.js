import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroupSiteBlock } from '../microsites/blocks.js';
import {
	GROUP_SITE_PAGE_LIMIT,
	GROUP_SITE_PRIMARY_NAV_LIMIT,
	groupSitePageBySlug,
	normalizeGroupSiteNavigation,
	normalizeGroupSitePages,
	normalizeGroupSitePageSlug
} from '../microsites/pages.js';

test('site pages keep one home page and unique route-safe slugs', () => {
	const pages = normalizeGroupSitePages([
		{ id: 'start', title: 'Welcome', is_home: true, blocks: [createGroupSiteBlock('hero')] },
		{ title: 'Safety Tips', slug: 'Safety Tips', blocks: [createGroupSiteBlock('text')] },
		{ title: 'Safety Tips', slug: 'safety-tips', blocks: [createGroupSiteBlock('text')] },
		{ title: 'Updates conflict', slug: 'updates', blocks: [createGroupSiteBlock('updates')] }
	]);

	assert.equal(pages[0].id, 'home');
	assert.equal(pages[0].slug, '');
	assert.equal(pages.filter((page) => page.is_home).length, 1);
	assert.deepEqual(
		pages.slice(1).map((page) => page.slug),
		['safety-tips', 'safety-tips-2', 'updates-2']
	);
	assert.equal(groupSitePageBySlug(pages, 'Safety Tips')?.title, 'Safety Tips');
});

test('navigation keeps the homepage first and moves excess primary links into More', () => {
	const pages = normalizeGroupSitePages(
		Array.from({ length: 8 }, (_, index) => ({
			id: index === 0 ? 'home' : `page-${index}`,
			title: index === 0 ? 'Home' : `Page ${index}`,
			is_home: index === 0,
			blocks: [createGroupSiteBlock('hero')]
		}))
	);
	const navigation = normalizeGroupSiteNavigation(
		{
			items: pages.map((page) => ({ id: `page:${page.id}`, placement: 'primary' })).reverse()
		},
		{ pages }
	);

	assert.equal(navigation.items[0].id, 'page:home');
	assert.equal(
		navigation.items.filter((item) => item.placement === 'primary').length,
		GROUP_SITE_PRIMARY_NAV_LIMIT
	);
	assert.ok(navigation.items.some((item) => item.placement === 'more'));
});

test('navigation hides redundant automatic destinations by default', () => {
	const pages = normalizeGroupSitePages([
		{
			id: 'home',
			title: 'Home',
			is_home: true,
			blocks: [createGroupSiteBlock('hero'), createGroupSiteBlock('email_signup')]
		},
		{
			id: 'news',
			title: 'News',
			slug: 'news',
			blocks: [createGroupSiteBlock('hero'), createGroupSiteBlock('updates')]
		}
	]);

	assert.equal(
		pages[0].navigation.items.find((item) => item.id === 'special:join').placement,
		'hidden'
	);
	assert.equal(
		pages[0].navigation.items.find((item) => item.id === 'special:updates').placement,
		'hidden'
	);
});

test('site pages are bounded and every page has normalized blocks', () => {
	const pages = normalizeGroupSitePages(
		Array.from({ length: GROUP_SITE_PAGE_LIMIT + 5 }, (_, index) => ({
			title: index === 0 ? 'Home' : `Page ${index}`,
			is_home: index === 0,
			blocks: [{ type: 'text', title: `Content ${index}` }]
		}))
	);
	assert.equal(pages.length, GROUP_SITE_PAGE_LIMIT);
	for (const page of pages) assert.equal(page.blocks[0].type, 'hero');
	assert.equal(normalizeGroupSitePageSlug('  Road Safety & Laws!  '), 'road-safety-laws');
});

test('duplicate home declarations become regular pages without exceeding the page limit', () => {
	const pages = normalizeGroupSitePages(
		Array.from({ length: 20 }, (_, index) => ({
			id: `page-${index}`,
			title: index === 0 ? 'Home' : `Page ${index}`,
			is_home: index < 2,
			blocks: []
		}))
	);

	assert.equal(pages.length, GROUP_SITE_PAGE_LIMIT);
	assert.equal(pages.filter((page) => page.is_home).length, 1);
	assert.equal(pages[1].slug, 'page-1');
});
