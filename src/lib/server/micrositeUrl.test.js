import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGroupSiteConfig } from '../microsites/config.js';

test('microsite link settings reject active and protocol-relative URLs', () => {
	const config = normalizeGroupSiteConfig({
		microsite_notice_href: 'javascript:alert(1)',
		sponsor_items: [
			{ name: 'Active scheme', url: 'javascript:alert(1)' },
			{ name: 'Protocol relative', url: '//attacker.example' },
			{ name: 'Safe link', url: 'https://example.org/sponsors' },
			{ name: 'Safe local', url: '/groups/example' }
		]
	});

	assert.equal(config.microsite_notice_href, '');
	assert.deepEqual(
		config.sponsor_items.map((item) => item.url),
		['', '', 'https://example.org/sponsors', '/groups/example']
	);
});
