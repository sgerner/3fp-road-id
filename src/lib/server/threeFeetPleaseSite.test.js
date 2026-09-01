import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildThreeFeetPleaseSite,
	THREE_FEET_PLEASE_COLORS
} from '../microsites/threeFeetPlease.js';
import { THREE_FEET_LAWS, THREE_FEET_LAWS_LAST_REVIEWED } from '../microsites/laws.js';

test('3 Feet Please website preserves the core legacy routes and clear next steps', () => {
	const config = buildThreeFeetPleaseSite({ group: { name: '3 Feet Please' } });
	assert.deepEqual(
		config.site_pages.map((page) => page.slug),
		['', 'laws', 'safety-tips', 'advocacy', 'get-involved', 'about', 'news']
	);
	assert.ok(config.site_pages.every((page) => page.blocks[0].type === 'hero'));
	assert.ok(config.page_blocks.some((block) => block.button_url === '/safety-tips'));
	assert.ok(config.page_blocks.some((block) => block.button_url === '/advocacy'));
	assert.ok(config.page_blocks.some((block) => block.button_url === 'https://3fp.org'));
	assert.match(config.seo_description, /3fp\.org/);
	assert.deepEqual(config.theme_colors, THREE_FEET_PLEASE_COLORS);
	assert.equal(config.background_style, 'cinematic');
	assert.ok(
		config.site_pages
			.find((page) => page.slug === 'safety-tips')
			.blocks.some((block) => block.eyebrow === 'For drivers · S.M.A.R.T.')
	);
	assert.ok(
		config.site_pages
			.find((page) => page.slug === 'about')
			.blocks.some((block) => block.button_url === 'https://3fp.org')
	);
	assert.ok(
		config.site_pages
			.find((page) => page.slug === 'laws')
			.blocks.some((block) => block.type === 'law_directory')
	);
	assert.ok(
		config.site_pages.some((page) => page.blocks.some((block) => block.type === 'email_signup'))
	);
	assert.equal(config.published, true);
});

test('3 Feet Please law directory contains the complete workbook snapshot', () => {
	assert.equal(THREE_FEET_LAWS_LAST_REVIEWED, '2022');
	assert.equal(THREE_FEET_LAWS.length, 51);
	assert.equal(new Set(THREE_FEET_LAWS.map((law) => law.state)).size, 51);
	assert.ok(
		THREE_FEET_LAWS.some((law) => law.state === 'Arizona' && law.statute.includes('28-735'))
	);
	assert.ok(
		THREE_FEET_LAWS.some((law) => law.state === 'Pennsylvania' && law.distance.includes('4 feet'))
	);
	assert.equal(THREE_FEET_LAWS.filter((law) => law.status === 'no-specific-law').length, 9);
	assert.ok(THREE_FEET_LAWS.every((law) => law.sourceUrl.startsWith('https://')));
});
