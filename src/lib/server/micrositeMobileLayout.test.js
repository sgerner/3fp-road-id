import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { createGroupSiteBlock } from '../microsites/blocks.js';
import { buildDefaultGroupSiteConfig, mergeGroupSiteConfig } from '../microsites/config.js';
import { buildThreeFeetPleaseSite } from '../microsites/threeFeetPlease.js';

const ROOT_DIR = resolve(import.meta.dirname, '../../..');
const MICROSITE_PAGE_SOURCE_PATH = resolve(ROOT_DIR, 'src/routes/[siteSlug]/+page.svelte');
const BLOCK_EDITOR_SOURCE_PATH = resolve(
	ROOT_DIR,
	'src/lib/components/groups/GroupSiteBlockEditor.svelte'
);

const SVG_DATA_COVER =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f3d56"/><stop offset="100%" stop-color="#1d6f72"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/></svg>'
	);

const SVG_DATA_LOGO =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#d7f205"/><circle cx="64" cy="64" r="34" fill="#0b2533"/></svg>'
	);

const LONG_UNBROKEN_URL =
	'https://evansvillebicycleclub.example.org/membership/registration/2026-spring-century-and-weekly-peloton-schedule-information';
const LONG_EMAIL =
	'membership-and-new-rider-welcome-coordinator@southerntierbicycleclub-binghamton.example.org';
const LONG_PLAIN_TEXT_URL_INSTRUCTION =
	'Register online at https://southerntierbicycleclub.example.org/join/new-rider-orientation-packet-and-waiver-form before your first ride.';
const EIGHTY_CHAR_BUTTON_LABEL =
	'Register for the Saturday morning beginner no-drop group ride and waiver check';

function buildMicrositeFixture({
	slug = 'reston-bike-club',
	name = 'Reston Bike Club',
	heroStyle = 'immersive',
	withMedia = true,
	buttonLabel = '',
	buttonUrl = '',
	isSubpage = false,
	isTbag = false,
	isAdvocacy = false
} = {}) {
	const group = {
		id: `group-${slug}`,
		slug: isAdvocacy ? '3-feet-please' : slug,
		microsite_slug: slug,
		name: isAdvocacy ? '3 Feet Please' : isTbag ? 'Tempe Bicycle Action Group' : name,
		city: isTbag ? 'Tempe' : 'Reston',
		state_region: isTbag ? 'AZ' : 'VA',
		latitude: 38.9586,
		longitude: -77.357,
		cover_photo_url: withMedia ? SVG_DATA_COVER : '',
		logo_url: withMedia ? SVG_DATA_LOGO : '',
		activity_frequency: 'Weekly no-drop road and gravel rides',
		specific_meeting_point_address:
			'11900 Market Street Plaza North Pavilion, Reston Town Center, VA 20190',
		audience_focus: 'Beginners, commuters, and experienced road cyclists',
		how_to_join_instructions: LONG_PLAIN_TEXT_URL_INSTRUCTION,
		typical_activity_day_time: 'Tuesdays 6:00 PM & Saturdays 8:00 AM',
		primary_discipline: 'Road & Gravel',
		typical_skill_level: 'All paces welcome (A/B/C groups)',
		zip_code: '20190',
		website_url: LONG_UNBROKEN_URL,
		public_contact_email: LONG_EMAIL,
		public_phone_number: '703-555-0199',
		preferred_contact_method_instructions:
			'Send questions via https://restonbikeclub.example.org/contact/weekly-ride-leaders-directory or email us.'
	};

	const baseConfig = isAdvocacy
		? buildThreeFeetPleaseSite({ group })
		: mergeGroupSiteConfig(buildDefaultGroupSiteConfig(group), {
				site_title: group.name,
				site_tagline:
					'Friendly rides, safer streets, and welcoming miles for every rider in our community.',
				home_intro:
					'We host weekly rides across northern Virginia with clear route sheets and ride leaders at every pace.',
				new_rider_note: 'Bring a helmet, water bottle, and front/rear lights.',
				hero_style: heroStyle,
				site_variant: isTbag ? 'tbag' : 'standard'
			});

	const heroBlock = createGroupSiteBlock('hero', {
		overrides: {
			eyebrow: isAdvocacy ? 'Safe passing saves lives' : 'Welcome',
			title: isSubpage ? 'Routes & Weekly Schedule' : group.name,
			button_label: buttonLabel,
			button_url: buttonUrl || (buttonLabel ? '/join' : '')
		}
	});
	const storyBlock = createGroupSiteBlock('story');
	const blocks = [heroBlock, storyBlock];

	const currentPage = isSubpage
		? {
				id: 'routes',
				title: 'Routes & Weekly Schedule',
				slug: 'routes',
				description: 'Explore weekly start locations, pace expectations, and seasonal routes.',
				is_home: false,
				blocks
			}
		: {
				id: 'home',
				title: 'Home',
				slug: '',
				description: baseConfig.site_tagline,
				is_home: true,
				blocks
			};

	const siteConfig = {
		...baseConfig,
		hero_style: heroStyle,
		site_variant: isTbag ? 'tbag' : baseConfig.site_variant,
		page_blocks: blocks,
		site_pages: isSubpage ? [baseConfig.site_pages[0], currentPage] : [currentPage]
	};

	return {
		site: {
			group,
			siteConfig,
			basePath: `/${slug}`,
			announcementIsActive: false,
			taxonomy: {
				audiences: ['All riders welcome'],
				disciplines: ['Road'],
				skills: ['All levels']
			},
			rides: [],
			volunteerEvents: [],
			newsPosts: [],
			instagramPosts: [],
			photoBucket: null,
			contactLinks: [],
			storyParagraphs: [
				baseConfig.home_intro ||
					'We host weekly rides across our region with clear route sheets and welcoming ride leaders.'
			],
			actions: buttonLabel
				? []
				: [
						{ label: 'Explore the club', href: `/${slug}/join`, external: false },
						{ label: 'Visit website', href: LONG_UNBROKEN_URL, external: true }
					]
		},
		currentPage
	};
}

async function launchChromiumOrSkip(t) {
	const launchArgs = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
	try {
		return await chromium.launch({
			headless: true,
			args: launchArgs
		});
	} catch {
		const candidates = [
			'/usr/bin/google-chrome',
			'/usr/bin/google-chrome-stable',
			'/usr/bin/chromium',
			'/usr/bin/chromium-browser'
		];
		const executablePath = candidates.find((candidate) => existsSync(candidate));
		if (!executablePath) {
			t.skip('No Chromium or Chrome executable available for Playwright rendering test');
			return null;
		}
		return chromium.launch({
			headless: true,
			executablePath,
			args: launchArgs
		});
	}
}

let sharedHarness = null;

before(async () => {
	const virtualModules = {
		// The standalone Vite harness has no SvelteKit runtime, so stub the page store.
		'$app/state': `
			export const page = {
				get url() {
					return new URL(globalThis.location?.href ?? 'http://127.0.0.1/');
				}
			};
		`,
		'virtual:microsite-harness': `
			import { mount } from 'svelte';
			import '/src/app.css';
			import MicrositePage from '/src/routes/[siteSlug]/+page.svelte';
			mount(MicrositePage, {
				target: document.getElementById('app'),
				props: { data: window.__FIXTURE_DATA }
			});
			window.__TEST_READY = true;
		`,
		'virtual:subpage-harness': `
			import { mount } from 'svelte';
			import '/src/app.css';
			import Subpage from '/src/routes/[siteSlug]/[pageSlug]/+page.svelte';
			mount(Subpage, {
				target: document.getElementById('app'),
				props: { data: window.__FIXTURE_DATA }
			});
			window.__TEST_READY = true;
		`,
		'virtual:editor-harness': `
			import { mount, unmount } from 'svelte';
			import '/src/app.css';
			import EditorHarness from '/src/lib/components/groups/GroupSiteBlockEditor.svelte';
			const initial = window.__FIXTURE_DATA;
			let currentInstance = null;
			function remount(heroStyle) {
				const target = document.getElementById('app');
				if (currentInstance) {
					unmount(currentInstance);
					currentInstance = null;
				}
				target.innerHTML = '';
				currentInstance = mount(EditorHarness, {
					target,
					props: {
						blocks: initial.blocks,
						config: { ...initial.config, hero_style: heroStyle },
						group: initial.group,
						page: initial.page
					}
				});
			}
			remount(initial.config.hero_style || 'immersive');
			document.getElementById('set-style-immersive').onclick = () => remount('immersive');
			document.getElementById('set-style-bold').onclick = () => remount('bold');
			document.getElementById('set-style-orbit').onclick = () => remount('orbit');
			window.__TEST_READY = true;
		`
	};

	const vite = await createViteServer({
		root: ROOT_DIR,
		configFile: false,
		appType: 'custom',
		logLevel: 'error',
		resolve: {
			alias: {
				'#lib': resolve(ROOT_DIR, 'src/lib')
			}
		},
		optimizeDeps: {
			entries: [
				'src/routes/[siteSlug]/+page.svelte',
				'src/routes/[siteSlug]/[pageSlug]/+page.svelte',
				'src/lib/components/groups/GroupSiteBlockEditor.svelte'
			]
		},
		plugins: [
			{
				name: 'microsite-test-virtual-entries',
				resolveId(id) {
					if (id in virtualModules) return `\0${id}`;
					return null;
				},
				load(id) {
					if (id.startsWith('\0')) {
						const key = id.slice(1);
						if (key in virtualModules) return virtualModules[key];
					}
					return null;
				}
			},
			svelte({ preprocess: vitePreprocess() }),
			tailwindcss()
		],
		server: { middlewareMode: true, hmr: false }
	});

	const fixtures = new Map();
	let nextFixtureId = 1;
	const registerFixture = (payload) => {
		const id = String(nextFixtureId++);
		fixtures.set(id, payload);
		return id;
	};

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || '/', 'http://127.0.0.1');
			if (url.pathname.startsWith('/__test/')) {
				const id = url.searchParams.get('id') || '';
				const fixtureData = fixtures.get(id) || {};
				const serialized = JSON.stringify(fixtureData).replace(/</g, '\\u003c');
				let rawHtml = '';

				if (url.pathname === '/__test/microsite' || url.pathname === '/__test/subpage') {
					const entry =
						url.pathname === '/__test/subpage'
							? 'virtual:subpage-harness'
							: 'virtual:microsite-harness';
					rawHtml = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="icon" href="data:," />
	<style>
		.microsite-shell .microsite-page > section:not([data-site-block-type='hero']),
		.microsite-shell .microsite-page > footer {
			content-visibility: auto;
			contain-intrinsic-size: auto 520px;
		}
	</style>
</head>
<body style="margin:0">
	<div class="microsite-shell" id="app"></div>
	<script>window.__FIXTURE_DATA = ${serialized};</script>
	<script type="module" src="/@id/__x00__${entry}"></script>
</body>
</html>`;
				} else if (url.pathname === '/__test/editor') {
					rawHtml = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="icon" href="data:," />
</head>
<body style="margin:0">
	<div class="app-shell">
		<main style="padding:1rem">
			<div id="editor-controls" style="margin-bottom:0.5rem;display:flex;gap:0.5rem">
				<button type="button" id="set-style-immersive">Style: immersive</button>
				<button type="button" id="set-style-bold">Style: bold</button>
				<button type="button" id="set-style-orbit">Style: orbit</button>
			</div>
			<div id="app"></div>
		</main>
	</div>
	<script>window.__FIXTURE_DATA = ${serialized};</script>
	<script type="module" src="/@id/__x00__virtual:editor-harness"></script>
</body>
</html>`;
				}

				const html = await vite.transformIndexHtml(url.pathname, rawHtml);
				res.statusCode = 200;
				res.setHeader('content-type', 'text/html; charset=utf-8');
				res.end(html);
				return;
			}

			vite.middlewares(req, res);
		} catch (err) {
			res.statusCode = 500;
			res.end(String(err?.stack || err));
		}
	});

	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const address = server.address();
	sharedHarness = {
		vite,
		origin: `http://127.0.0.1:${address.port}`,
		registerFixture,
		async close() {
			await new Promise((resolveClose) => server.close(resolveClose));
			await vite.close();
		}
	};
});

after(async () => {
	if (sharedHarness) {
		await sharedHarness.close();
		sharedHarness = null;
	}
});

test('microsite page removes dead hero CSS selectors and preserves key mobile/wrap contracts', () => {
	const pageSource = readFileSync(MICROSITE_PAGE_SOURCE_PATH, 'utf8');
	const editorSource = readFileSync(BLOCK_EDITOR_SOURCE_PATH, 'utf8');

	for (const removedSelector of ['.hero-section', '.hero-bold', '.hero-orbit', '.hero-immersive']) {
		assert.equal(
			pageSource.includes(`${removedSelector} {`),
			false,
			`Expected unused selector ${removedSelector} to be deleted from +page.svelte`
		);
	}

	assert.match(pageSource, /grid[\s\S]{0,60}min-h-72[\s\S]{0,80}md:min-h-80/);
	assert.match(
		pageSource,
		/site-advocacy-hero-content relative z-10 flex h-full min-w-0 flex-col justify-end/
	);
	assert.equal(pageSource.includes('site-advocacy-hero-content absolute inset-0'), false);
	assert.match(pageSource, /max-md:whitespace-normal/);
	assert.match(
		pageSource,
		/\.about-facts-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/
	);
	assert.match(
		pageSource,
		/\.about-facts-grid--tbag\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
	);
	assert.match(pageSource, /\.about-fact\s*\{[\s\S]*?min-width:\s*0/);
	assert.match(pageSource, /\.about-fact-value\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
	assert.match(pageSource, /\.about-fact-link\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);

	// Editor preview must react to device === 'phone' and avoid .app-shell [class*='orb'] / [class*='glow'] hiding
	assert.match(editorSource, /device === 'phone'/);
	assert.equal(/class="[^"]*(?:orb|glow)[^"]*"/i.test(editorSource), false);
});

test('SSR renders hero variants, AutoLinkText plain-text URLs in facts, fallbacks, and editor preview', async () => {
	const { render } = await sharedHarness.vite.ssrLoadModule('svelte/server');
	const { default: MicrositePage } = await sharedHarness.vite.ssrLoadModule(
		'/src/routes/[siteSlug]/+page.svelte'
	);
	const { default: BlockEditor } = await sharedHarness.vite.ssrLoadModule(
		'/src/lib/components/groups/GroupSiteBlockEditor.svelte'
	);

	for (const heroStyle of ['immersive', 'bold', 'orbit']) {
		const data = buildMicrositeFixture({
			heroStyle,
			buttonLabel: EIGHTY_CHAR_BUTTON_LABEL
		});
		const rendered = render(MicrositePage, { props: { data } });
		assert.match(rendered.body, /Reston Bike Club/);
		assert.ok(rendered.body.includes(EIGHTY_CHAR_BUTTON_LABEL));
		assert.ok(
			rendered.body.includes(
				'href="https://southerntierbicycleclub.example.org/join/new-rider-orientation-packet-and-waiver-form"'
			),
			`Expected plain-text URL in How to join fact to render as AutoLinkText anchor for ${heroStyle}`
		);
		assert.ok(rendered.body.includes(`href="mailto:${LONG_EMAIL}"`));
	}

	// Gradient fallback when cover_photo_url and logo_url are absent
	const fallbackRendered = render(MicrositePage, {
		props: { data: buildMicrositeFixture({ heroStyle: 'immersive', withMedia: false }) }
	});
	assert.match(fallbackRendered.body, /from-primary-500\/30/);
	assert.match(fallbackRendered.body, /from-primary-500 to-secondary-500/);

	// TBAG keeps compact grid modifier class
	const tbagRendered = render(MicrositePage, {
		props: { data: buildMicrositeFixture({ heroStyle: 'bold', isTbag: true }) }
	});
	assert.match(tbagRendered.body, /about-facts-grid--tbag/);

	// Block editor mirrors hero_style, configured button_label, and group facts
	const fixture = buildMicrositeFixture({
		heroStyle: 'orbit',
		buttonLabel: EIGHTY_CHAR_BUTTON_LABEL
	});
	const editorRendered = render(BlockEditor, {
		props: {
			blocks: fixture.currentPage.blocks,
			config: fixture.site.siteConfig,
			group: fixture.site.group,
			page: fixture.currentPage
		}
	});
	assert.match(editorRendered.body, /data-preview-hero-style="orbit"/);
	assert.ok(editorRendered.body.includes(EIGHTY_CHAR_BUTTON_LABEL));
	assert.ok(editorRendered.body.includes(LONG_EMAIL));
});

test('Playwright 375x667 verifies mobile heroes, unclipped About facts, breakpoints, and Website Studio phone preview', async (t) => {
	const browser = await launchChromiumOrSkip(t);
	if (!browser) return;

	try {
		const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
		const page = await context.newPage();
		const pageErrors = [];
		let sawOutdatedOptimizeDep = false;
		page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
		page.on('response', (res) => {
			if (res.status() === 504) {
				sawOutdatedOptimizeDep = true;
			}
		});

		const gotoReady = async (url) => {
			for (let attempt = 0; attempt < 3; attempt++) {
				sawOutdatedOptimizeDep = false;
				await page.goto(url, { waitUntil: 'networkidle' });
				if (sawOutdatedOptimizeDep) {
					await sharedHarness.vite.waitForRequestsIdle?.();
					continue;
				}
				await page.waitForFunction(() => window.__TEST_READY === true, null, {
					timeout: 15_000
				});
				assert.deepEqual(pageErrors, [], `Unexpected browser errors: ${pageErrors.join('\n')}`);
				return;
			}
			await page.waitForFunction(() => window.__TEST_READY === true, null, {
				timeout: 15_000
			});
			assert.deepEqual(pageErrors, [], `Unexpected browser errors: ${pageErrors.join('\n')}`);
		};

		// 1. Verify immersive, bold, and orbit heroes + About facts at 375x667
		for (const heroStyle of ['immersive', 'bold', 'orbit']) {
			const id = sharedHarness.registerFixture(
				buildMicrositeFixture({
					heroStyle,
					buttonLabel: EIGHTY_CHAR_BUTTON_LABEL
				})
			);
			await page.setViewportSize({ width: 375, height: 667 });
			await gotoReady(`${sharedHarness.origin}/__test/microsite?id=${id}`);

			const metrics = await page.evaluate(() => {
				const heroSection = document.querySelector('[data-site-block-type="hero"]');
				const heroCard = heroSection?.firstElementChild;
				const h1 = heroSection?.querySelector('h1');
				const cta = heroSection?.querySelector('a');
				const aboutSection = document.querySelector('.about-section');
				aboutSection?.scrollIntoView({ block: 'start' });
				const factsGrid = document.querySelector('.about-facts-grid');
				const factItems = [...document.querySelectorAll('.about-fact')];
				const inlineAutoLink = document.querySelector('.about-fact-value a');

				const heroRect = heroCard.getBoundingClientRect();
				const h1Rect = h1.getBoundingClientRect();
				const ctaRect = cta.getBoundingClientRect();
				const aboutRect = aboutSection.getBoundingClientRect();
				const gridStyle = getComputedStyle(factsGrid);
				const columnCount = gridStyle.gridTemplateColumns.trim().split(/\s+/).length;

				const overflowingFacts = factItems
					.map((el) => {
						const rect = el.getBoundingClientRect();
						const childRects = [...el.querySelectorAll('*')].map((child) =>
							child.getBoundingClientRect()
						);
						const maxChildRight = Math.max(rect.right, ...childRects.map((r) => r.right));
						return {
							label: el.querySelector('.about-fact-label')?.textContent?.trim(),
							right: maxChildRight,
							scrollWidth: el.scrollWidth,
							clientWidth: el.clientWidth
						};
					})
					.filter(
						(item) => item.right > aboutRect.right + 0.5 || item.scrollWidth > item.clientWidth + 1
					);

				return {
					scrollWidth: document.documentElement.scrollWidth,
					viewportWidth: window.innerWidth,
					heroHeight: heroRect.height,
					h1Height: h1Rect.height,
					h1Width: h1Rect.width,
					h1InsideHero:
						h1Rect.top >= heroRect.top - 1 &&
						h1Rect.bottom <= heroRect.bottom + 1 &&
						h1Rect.right <= heroRect.right + 1,
					ctaHeight: ctaRect.height,
					ctaInsideHero:
						ctaRect.top >= heroRect.top - 1 &&
						ctaRect.bottom <= heroRect.bottom + 1 &&
						ctaRect.left >= heroRect.left - 1 &&
						ctaRect.right <= heroRect.right + 1,
					columnCount,
					factCount: factItems.length,
					overflowingFacts,
					hasInlineAutoLink: Boolean(inlineAutoLink)
				};
			});

			assert.ok(
				metrics.heroHeight >= (heroStyle === 'immersive' ? 288 : 240),
				`Expected non-collapsed ${heroStyle} hero height at 375x667, got ${metrics.heroHeight}px`
			);
			assert.ok(
				metrics.h1Height > 20 && metrics.h1Width > 100,
				`Expected visible h1 in ${heroStyle}`
			);
			assert.equal(metrics.h1InsideHero, true, `Expected h1 inside ${heroStyle} hero bounds`);
			assert.ok(metrics.ctaHeight >= 32, `Expected visible CTA button in ${heroStyle}`);
			assert.equal(
				metrics.ctaInsideHero,
				true,
				`Expected 80-char CTA inside ${heroStyle} hero bounds`
			);
			assert.equal(metrics.columnCount, 1, 'Expected single-column About facts below 640px');
			assert.ok(metrics.factCount >= 10, 'Expected full set of group quick facts');
			assert.deepEqual(metrics.overflowingFacts, [], 'Expected zero clipped or overflowing facts');
			assert.equal(
				metrics.hasInlineAutoLink,
				true,
				'Expected AutoLinkText anchor inside fact value'
			);
			assert.ok(
				metrics.scrollWidth <= metrics.viewportWidth,
				`Expected no horizontal scrollbar (${metrics.scrollWidth} <= ${metrics.viewportWidth})`
			);
		}

		// 2. Verify narrowest 320px viewport, 640px 2-column breakpoint, and 768px 4-column breakpoint
		const responsiveId = sharedHarness.registerFixture(
			buildMicrositeFixture({
				heroStyle: 'immersive',
				withMedia: false,
				buttonLabel: EIGHTY_CHAR_BUTTON_LABEL
			})
		);
		await page.setViewportSize({ width: 320, height: 667 });
		await gotoReady(`${sharedHarness.origin}/__test/microsite?id=${responsiveId}`);
		const narrow320 = await page.evaluate(() => {
			const heroRect = document
				.querySelector('[data-site-block-type="hero"]')
				.firstElementChild.getBoundingClientRect();
			const aboutSection = document.querySelector('.about-section');
			aboutSection.scrollIntoView({ block: 'start' });
			const aboutRect = aboutSection.getBoundingClientRect();
			const cols = getComputedStyle(document.querySelector('.about-facts-grid'))
				.gridTemplateColumns.trim()
				.split(/\s+/).length;
			const maxFactRight = Math.max(
				...[...document.querySelectorAll('.about-fact *')].map(
					(el) => el.getBoundingClientRect().right
				)
			);
			return {
				heroHeight: heroRect.height,
				cols,
				maxFactRight,
				aboutRight: aboutRect.right,
				scrollWidth: document.documentElement.scrollWidth
			};
		});
		assert.ok(narrow320.heroHeight >= 288);
		assert.equal(narrow320.cols, 1);
		assert.ok(narrow320.maxFactRight <= narrow320.aboutRight + 0.5);
		assert.ok(narrow320.scrollWidth <= 320);

		await page.setViewportSize({ width: 640, height: 800 });
		const colsAt640 = await page.evaluate(
			() =>
				getComputedStyle(document.querySelector('.about-facts-grid'))
					.gridTemplateColumns.trim()
					.split(/\s+/).length
		);
		assert.equal(colsAt640, 2, 'Expected 2-column About facts at 640px');

		await page.setViewportSize({ width: 768, height: 900 });
		const colsAt768 = await page.evaluate(
			() =>
				getComputedStyle(document.querySelector('.about-facts-grid'))
					.gridTemplateColumns.trim()
					.split(/\s+/).length
		);
		assert.equal(colsAt768, 4, 'Expected 4-column About facts at 768px');

		// 3. Verify custom subpage forwarding, TBAG 2-column mobile grid, and 3-feet-please hero override
		await page.setViewportSize({ width: 375, height: 667 });
		const subpageId = sharedHarness.registerFixture(
			buildMicrositeFixture({ heroStyle: 'immersive', isSubpage: true })
		);
		await gotoReady(`${sharedHarness.origin}/__test/subpage?id=${subpageId}`);
		const subpageHero = await page.evaluate(() => {
			const hero = document.querySelector('[data-site-block-type="hero"] > .card');
			const h1 = hero?.querySelector('h1');
			return {
				height: hero?.getBoundingClientRect().height || 0,
				title: h1?.textContent?.trim() || ''
			};
		});
		assert.ok(subpageHero.height >= 288);
		assert.equal(subpageHero.title, 'Routes & Weekly Schedule');

		const tbagId = sharedHarness.registerFixture(
			buildMicrositeFixture({ heroStyle: 'bold', isTbag: true })
		);
		await gotoReady(`${sharedHarness.origin}/__test/microsite?id=${tbagId}`);
		const tbagCols = await page.evaluate(
			() =>
				getComputedStyle(document.querySelector('.about-facts-grid--tbag'))
					.gridTemplateColumns.trim()
					.split(/\s+/).length
		);
		assert.equal(tbagCols, 2, 'Expected TBAG mobile facts grid to keep 2 compact columns');

		const advocacyId = sharedHarness.registerFixture(
			buildMicrositeFixture({ heroStyle: 'immersive', isAdvocacy: true })
		);
		await gotoReady(`${sharedHarness.origin}/__test/microsite?id=${advocacyId}`);
		const advocacyHeroHeight = await page.evaluate(
			() =>
				document
					.querySelector('.site-advocacy-home [data-site-block-type="hero"] > .card')
					.getBoundingClientRect().height
		);
		assert.ok(
			advocacyHeroHeight >= 550,
			`Expected 3 Feet Please advocacy hero min-height override to remain intact, got ${advocacyHeroHeight}px`
		);

		// 4. Verify Website Studio phone preview inside a 1280x900 desktop browser window
		await page.setViewportSize({ width: 1280, height: 900 });
		const editorFixture = buildMicrositeFixture({
			heroStyle: 'immersive',
			buttonLabel: EIGHTY_CHAR_BUTTON_LABEL
		});
		const editorId = sharedHarness.registerFixture({
			blocks: editorFixture.currentPage.blocks,
			config: editorFixture.site.siteConfig,
			group: editorFixture.site.group,
			page: editorFixture.currentPage
		});
		await gotoReady(`${sharedHarness.origin}/__test/editor?id=${editorId}`);

		for (const style of ['immersive', 'bold', 'orbit']) {
			await page.click(`#set-style-${style}`);
			await page.click('button[aria-label="Phone preview"]');
			await page.waitForFunction(
				() => {
					const root = document.querySelector('.site-preview-root');
					return (
						root &&
						root.getAttribute('aria-label') === 'phone page preview' &&
						root.getBoundingClientRect().width <= 385
					);
				},
				null,
				{ timeout: 5_000 }
			);

			const previewMetrics = await page.evaluate(() => {
				const root = document.querySelector('.site-preview-root');
				const hero = root.querySelector('[data-preview-hero-style]');
				const heroHeading = hero.querySelector('h2');
				const heroButton = hero.querySelector('.btn');
				const factsGrid = root.querySelector('[data-preview-facts-grid]');
				const rootRect = root.getBoundingClientRect();
				const heroRect = hero.getBoundingClientRect();
				const btnRect = heroButton.getBoundingClientRect();
				const factRight = Math.max(
					...[...factsGrid.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right)
				);
				return {
					styleAttr: hero.getAttribute('data-preview-hero-style'),
					rootWidth: rootRect.width,
					heroHeight: heroRect.height,
					headingFontSize: parseFloat(getComputedStyle(heroHeading).fontSize),
					btnText: heroButton.textContent.trim(),
					btnInsideHero:
						btnRect.left >= heroRect.left - 1 &&
						btnRect.right <= heroRect.right + 1 &&
						btnRect.bottom <= heroRect.bottom + 1,
					factsColumns: getComputedStyle(factsGrid).gridTemplateColumns.trim().split(/\s+/).length,
					factFitsInRoot: factRight <= rootRect.right + 0.5
				};
			});

			assert.equal(previewMetrics.styleAttr, style);
			assert.ok(previewMetrics.rootWidth <= 385, 'Expected phone preview width <= 384px');
			assert.ok(
				previewMetrics.heroHeight >= 288,
				`Expected visible ${style} hero in phone preview`
			);
			assert.ok(
				previewMetrics.headingFontSize <= 34,
				`Expected mobile heading size in phone preview on 1280px desktop, got ${previewMetrics.headingFontSize}px`
			);
			assert.equal(previewMetrics.btnText, EIGHTY_CHAR_BUTTON_LABEL);
			assert.equal(previewMetrics.btnInsideHero, true);
			assert.equal(previewMetrics.factsColumns, 1);
			assert.equal(previewMetrics.factFitsInRoot, true);
		}

		await context.close();
	} finally {
		await browser.close();
	}
});
