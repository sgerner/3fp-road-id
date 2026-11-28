import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildGroupSiteEditorState,
	extractGroupSiteEditorFormValues,
	GROUP_SITE_LOGO_MAX_BYTES,
	mergeGroupSiteEditorConfig,
	siteEditorConfigFingerprint,
	toIsoDateTimeValue,
	validateGroupSiteDraftSubmission
} from '../groups/siteEditor.js';
import { buildDefaultGroupSiteConfig, normalizeGroupSiteConfig } from '../microsites/config.js';
import { isReservedMicrositeSlug, normalizeMicrositeSlug } from '../microsites/host.js';

test('site editor config preserves nested defaults when saved settings are partial', () => {
	const merged = mergeGroupSiteEditorConfig(
		{
			theme_colors: { primary: '#111111', secondary: '#222222' },
			sections: { story: true, contact: true },
			ride_widget_config: { theme: 'auto', showUserFilters: true }
		},
		{
			theme_colors: { primary: '#abcdef' },
			sections: { story: false },
			ride_widget_config: { theme: 'dark' }
		}
	);
	assert.deepEqual(merged.theme_colors, { primary: '#abcdef', secondary: '#222222' });
	assert.deepEqual(merged.sections, { story: false, contact: true });
	assert.deepEqual(merged.ride_widget_config, { theme: 'dark', showUserFilters: true });
});

test('site editor fingerprints ignore object key order but detect newer nested edits', () => {
	const first = { sections: { story: true, contact: false }, title: 'Hello' };
	const reordered = { title: 'Hello', sections: { contact: false, story: true } };
	assert.equal(siteEditorConfigFingerprint(first), siteEditorConfigFingerprint(reordered));
	assert.notEqual(
		siteEditorConfigFingerprint(first),
		siteEditorConfigFingerprint({ ...reordered, sections: { ...reordered.sections, story: false } })
	);
});

test('site editor converts stored timestamps into a datetime-local value without changing the instant', () => {
	const instant = '2026-01-15T18:30:00.000Z';
	const localValue = mergeGroupSiteEditorConfig(
		{},
		{ announcement_expires_at: instant }
	).announcement_expires_at;
	assert.match(localValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
	assert.equal(new Date(localValue).toISOString(), instant);
	assert.equal(toIsoDateTimeValue(localValue), instant);
	assert.equal(mergeGroupSiteEditorConfig({}, {}).announcement_expires_at, '');
	assert.equal(
		mergeGroupSiteEditorConfig({}, { announcement_expires_at: '' }).announcement_expires_at,
		''
	);
	assert.equal(
		mergeGroupSiteEditorConfig({}, { announcement_expires_at: 'not-a-date' })
			.announcement_expires_at,
		''
	);
	assert.equal(toIsoDateTimeValue(''), '');
	assert.equal(toIsoDateTimeValue('not-a-date'), '');
});

test('a partial AI proposal preserves unrelated local edits', () => {
	const merged = mergeGroupSiteEditorConfig(
		{
			home_intro: 'Keep this unpublished local copy',
			sponsor_items: [{ name: 'Local sponsor' }],
			sections: { story: true, contact: false }
		},
		{
			hero_style: 'bold',
			sections: { contact: true }
		}
	);
	assert.equal(merged.home_intro, 'Keep this unpublished local copy');
	assert.deepEqual(merged.sponsor_items, [{ name: 'Local sponsor' }]);
	assert.deepEqual(merged.sections, { story: true, contact: true });
	assert.equal(merged.hero_style, 'bold');
});

function containsNonSerializableFile(value) {
	if (typeof File !== 'undefined' && value instanceof File) return true;
	if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
	if (Array.isArray(value)) return value.some(containsNonSerializableFile);
	if (value && typeof value === 'object') {
		return Object.values(value).some(containsNonSerializableFile);
	}
	return false;
}

test('extractGroupSiteEditorFormValues preserves drafts, navigation view, and pending logo filenames while omitting File objects', () => {
	const group = { name: 'Desert Spoke Collective', city: 'Phoenix', state_region: 'AZ' };
	const formData = new FormData();
	formData.set('microsite_slug', 'desertspoke');
	formData.set('return_view', 'navigation');
	formData.set('site_title', 'Desert Spoke Draft');
	formData.set('site_tagline', 'Night rides and wrench clinics');
	formData.set('theme_mode', 'custom');
	formData.set('theme_primary', '#ea580c');
	formData.set('theme_secondary', '#be185d');
	formData.set('theme_accent', '#eab308');
	formData.set('theme_surface', '#fff7ed');
	formData.set('faq_1_q', 'Do I need lights?');
	formData.set('faq_1_a', 'Yes, front and rear lights are required after sunset.');
	formData.set('ride_widget_filter_mode', 'location');
	formData.set('ride_widget_location', '');
	formData.set(
		'page_blocks_json',
		JSON.stringify([
			{ id: 'hero-1', type: 'hero', enabled: true, content: {} },
			{
				id: 'text-1',
				type: 'text',
				enabled: true,
				content: { eyebrow: 'Draft', title: 'Unpublished block', body: 'Keep me on error' }
			}
		])
	);
	formData.set(
		'site_pages_json',
		JSON.stringify([
			{
				id: 'home',
				title: 'Home',
				nav_label: 'Home',
				slug: 'home',
				is_home: true,
				show_in_nav: true,
				blocks: [
					{ id: 'hero-1', type: 'hero', enabled: true, content: {} },
					{
						id: 'text-1',
						type: 'text',
						enabled: true,
						content: { eyebrow: 'Draft', title: 'Unpublished block', body: 'Keep me on error' }
					}
				]
			},
			{
				id: 'page- clinics',
				title: 'Wrench Clinics',
				nav_label: 'Clinics',
				slug: 'clinics',
				is_home: false,
				show_in_nav: true,
				blocks: [{ id: 'hero-2', type: 'hero', enabled: true, content: {} }]
			}
		])
	);
	formData.set(
		'sponsor_items_json',
		JSON.stringify([
			{ name: 'Sonoran Cycles', text: 'Tube sponsor', logo: '', url: 'https://example.com' },
			{ name: '', text: '', logo: '', url: '' }
		])
	);
	formData.set(
		'sponsor_logo_file_0',
		new File([new Uint8Array([137, 80, 78, 71])], 'sonoran-logo.png', { type: 'image/png' })
	);
	formData.set(
		'sponsor_logo_file_1',
		new File([new Uint8Array([82, 73, 70, 70])], 'pending-card.webp', { type: 'image/webp' })
	);

	const values = extractGroupSiteEditorFormValues(formData, { group });

	assert.equal(containsNonSerializableFile(values), false);
	assert.deepEqual(JSON.parse(JSON.stringify(values)), values);
	assert.equal(values.microsite_slug, 'desertspoke');
	assert.equal(values.return_view, 'navigation');
	assert.equal(values.ride_widget_filter_mode, 'location');
	assert.equal(values.site_title, 'Desert Spoke Draft');
	assert.equal(values.faq_1_q, 'Do I need lights?');
	assert.equal(values.theme_colors.primary, '#EA580C');
	assert.equal(values.site_pages.length, 2);
	assert.equal(values.site_pages[1].slug, 'clinics');
	assert.equal(values.sponsor_items.length, 2);
	assert.equal(values.sponsor_items[0].name, 'Sonoran Cycles');
	assert.deepEqual(values.sponsor_items[1], { name: '', text: '', logo: '', url: '' });
	assert.deepEqual(values.pending_sponsor_logo_files, ['sonoran-logo.png', 'pending-card.webp']);
});

test('draft submission validator rejects empty slugs, reserved slugs, and oversized logo uploads', () => {
	assert.equal(normalizeMicrositeSlug('---'), '');
	assert.equal(isReservedMicrositeSlug('admin'), true);
	assert.equal(isReservedMicrositeSlug('GROUPS'), true);
	assert.equal(isReservedMicrositeSlug('desertspoke'), false);

	assert.deepEqual(validateGroupSiteDraftSubmission({ slug: '   ' }), {
		ok: false,
		reason: 'invalid_slug',
		error: 'Website slug is required and can only use letters/numbers.'
	});

	for (const reserved of ['admin', 'api', 'groups', 'volunteer']) {
		assert.deepEqual(validateGroupSiteDraftSubmission({ slug: reserved }), {
			ok: false,
			reason: 'reserved_slug',
			error: 'That website slug is reserved. Pick another one.'
		});
	}

	const oversizedLogo = { name: 'huge-banner.png', size: GROUP_SITE_LOGO_MAX_BYTES + 1 };
	assert.deepEqual(
		validateGroupSiteDraftSubmission({ slug: 'desertspoke', files: [oversizedLogo] }),
		{
			ok: false,
			reason: 'file_too_large',
			error: 'huge-banner.png exceeds the 5 MB limit.'
		}
	);

	assert.deepEqual(
		validateGroupSiteDraftSubmission({
			slug: 'Desert-Spoke',
			files: [{ name: 'ok.png', size: 1024 }]
		}),
		{ ok: true, slug: 'desertspoke' }
	);
});

test('hydrating from form.values preserves unpublished state while anchoring savedSnapshot to data for dirty tracking', () => {
	const group = { name: 'Mesa Riders', slug: 'mesa-riders', city: 'Mesa', state_region: 'AZ' };
	const defaultSiteConfig = buildDefaultGroupSiteConfig(group);
	const siteConfig = normalizeGroupSiteConfig(
		{
			site_title: 'Mesa Riders',
			faq_1_q: 'Saved question',
			faq_1_a: 'Saved answer'
		},
		{ group }
	);

	const savedState = buildGroupSiteEditorState({
		defaultSiteConfig,
		siteConfig,
		micrositeSlug: 'mesariders',
		group
	});
	assert.equal(savedState.siteConfig.site_title, 'Mesa Riders');
	assert.equal(savedState.slugInput, 'mesariders');
	assert.deepEqual(savedState.faqItems, [{ question: 'Saved question', answer: 'Saved answer' }]);

	const formData = new FormData();
	formData.set('microsite_slug', 'taken-slug');
	formData.set('return_view', 'navigation');
	formData.set('site_title', 'Mesa Riders Unpublished Draft');
	formData.set('site_tagline', siteConfig.site_tagline);
	formData.set('home_intro', siteConfig.home_intro);
	formData.set('featured_quote', siteConfig.featured_quote);
	formData.set('footer_blurb', siteConfig.footer_blurb);
	formData.set('seo_description', siteConfig.seo_description);
	formData.set('faq_1_q', 'Draft question');
	formData.set('faq_1_a', 'Draft answer');
	formData.set('ride_widget_filter_mode', 'location');
	formData.set('ride_widget_location', '');
	formData.set('simple_mode', 'on');
	formData.set('published', 'on');
	for (const [key, enabled] of Object.entries(siteConfig.sections)) {
		if (enabled) formData.set(`section_${key}`, 'on');
	}
	formData.set('page_blocks_json', JSON.stringify(siteConfig.page_blocks));
	formData.set('site_pages_json', JSON.stringify(siteConfig.site_pages));

	const values = extractGroupSiteEditorFormValues(formData, { group });
	const hydratedState = buildGroupSiteEditorState({
		defaultSiteConfig,
		siteConfig,
		micrositeSlug: 'mesariders',
		group,
		values
	});

	assert.equal(hydratedState.siteConfig.site_title, 'Mesa Riders Unpublished Draft');
	assert.equal('microsite_slug' in hydratedState.siteConfig, false);
	assert.equal('return_view' in hydratedState.siteConfig, false);
	assert.equal('ride_widget_filter_mode' in hydratedState.siteConfig, false);
	assert.equal('pending_sponsor_logo_files' in hydratedState.siteConfig, false);
	assert.equal(hydratedState.slugInput, 'taken-slug');
	assert.equal(hydratedState.activeView, 'navigation');
	assert.equal(hydratedState.rideFilterMode, 'location');
	assert.deepEqual(hydratedState.faqItems, [
		{ question: 'Draft question', answer: 'Draft answer' }
	]);

	// Reverting all draft fields back to the saved values restores the saved state cleanly.
	const revertedState = buildGroupSiteEditorState({
		defaultSiteConfig,
		siteConfig,
		micrositeSlug: 'mesariders',
		group,
		values: {
			...siteConfig,
			microsite_slug: 'mesariders',
			return_view: 'navigation',
			ride_widget_filter_mode: 'none',
			pending_sponsor_logo_files: []
		}
	});
	assert.deepEqual(revertedState.siteConfig, savedState.siteConfig);
	assert.equal(revertedState.slugInput, savedState.slugInput);
	assert.equal(revertedState.rideFilterMode, savedState.rideFilterMode);
	assert.deepEqual(revertedState.faqItems, savedState.faqItems);
});
