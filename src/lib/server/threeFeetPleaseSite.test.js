import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThreeFeetPleaseSite } from '../microsites/threeFeetPlease.js';

test('3 Feet Please website preserves the core legacy routes and clear next steps', () => {
	const config = buildThreeFeetPleaseSite({ group: { name: '3 Feet Please' } });
	assert.deepEqual(
		config.site_pages.map((page) => page.slug),
		['', 'laws', 'safety-tips', 'advocacy', 'get-involved', 'about', 'news']
	);
	assert.ok(config.site_pages.every((page) => page.blocks[0].type === 'hero'));
	assert.ok(config.page_blocks.some((block) => block.button_url === '/laws'));
	assert.ok(
		config.site_pages.some((page) => page.blocks.some((block) => block.type === 'email_signup'))
	);
	assert.equal(config.published, true);
});
