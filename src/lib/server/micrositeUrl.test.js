import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeGroupSiteConfig } from '../microsites/config.js';
import { resolveRootLayoutWrapperMode } from '../microsites/host.js';

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

test('resolveRootLayoutWrapperMode renders a single <main> landmark across microsite error, microsite, embed, and app-shell routes', () => {
	const countRenderedMainLandmarks = ({ isMicrosite, pathname, hasError }) => {
		const wrapperMode = resolveRootLayoutWrapperMode({ isMicrosite, pathname, hasError });
		const rootMainCount = wrapperMode === 'standalone-main' || wrapperMode === 'app-shell' ? 1 : 0;
		const childMicrositeLayoutMainCount = isMicrosite && !hasError ? 1 : 0;
		return {
			wrapperMode,
			totalMainCount: rootMainCount + childMicrositeLayoutMainCount
		};
	};

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: true,
			pathname: '/404-not-found',
			hasError: true
		}),
		{ wrapperMode: 'standalone-main', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: true,
			pathname: '/tempe-bicycle-action-group/missing-page',
			hasError: true
		}),
		{ wrapperMode: 'standalone-main', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: true,
			pathname: '/tempe-bicycle-action-group',
			hasError: false
		}),
		{ wrapperMode: 'microsite', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: false,
			pathname: '/ride/widget/frame',
			hasError: false
		}),
		{ wrapperMode: 'standalone-main', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: false,
			pathname: '/ride/widget/frame/sub',
			hasError: true
		}),
		{ wrapperMode: 'standalone-main', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: false,
			pathname: '/',
			hasError: false
		}),
		{ wrapperMode: 'app-shell', totalMainCount: 1 }
	);

	assert.deepEqual(
		countRenderedMainLandmarks({
			isMicrosite: false,
			pathname: '/unknown/three/segments',
			hasError: true
		}),
		{ wrapperMode: 'app-shell', totalMainCount: 1 }
	);

	const rootErrorSource = readFileSync(
		new URL('../../routes/+error.svelte', import.meta.url),
		'utf8'
	);
	assert.equal(/<main\b/i.test(rootErrorSource), false);
});
