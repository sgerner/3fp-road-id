import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGroupSiteBlocks } from '../microsites/blocks.js';
import {
	buildGroupSiteTemplate,
	GROUP_SITE_TEMPLATES,
	recommendGroupSiteTemplate
} from '../microsites/templates.js';

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
