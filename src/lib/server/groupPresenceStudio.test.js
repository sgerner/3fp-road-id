import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultGroupSiteConfig } from '#lib/microsites/config.js';
import { createGroupSitePage, normalizeGroupSitePages } from '#lib/microsites/pages.js';
import {
	buildPresenceRedirectFromEdit,
	buildPresenceRedirectFromSite,
	extractPresenceStudioFormValues,
	isWebsiteLayerView,
	mergeAiProposalIntoPresenceDraft,
	normalizePresenceStudioView,
	resolveMicrositeSeoDescription,
	syncSiteConfigWithCoreGroup
} from '#lib/groups/presenceStudio.js';
import { buildGroupSiteEditorState } from '#lib/groups/siteEditor.js';
import { load as loadLegacyEdit } from '../../routes/groups/[slug]/manage/edit/+page.server.js';
import { load as loadLegacySite } from '../../routes/groups/[slug]/manage/site/+page.server.js';
import { GET as getLegacyRootEdit } from '../../routes/groups/[slug]/edit/+server.js';

const sampleGroup = {
	id: 'group-1',
	slug: 'desert-spokes',
	name: 'Desert Spokes',
	tagline: 'Friendly Tuesday night social rides across Tempe.',
	description: 'Every Tuesday evening we roll 12 casual miles with music and lights.',
	city: 'Tempe',
	state_region: 'AZ',
	country: 'US'
};

test('normalizePresenceStudioView maps aliases and falls back safely', () => {
	assert.equal(normalizePresenceStudioView(''), 'profile');
	assert.equal(normalizePresenceStudioView('profile'), 'profile');
	assert.equal(normalizePresenceStudioView('buillder'), 'builder');
	assert.equal(normalizePresenceStudioView('site'), 'builder');
	assert.equal(normalizePresenceStudioView('domains'), 'address');
	assert.equal(normalizePresenceStudioView('unknown', 'builder'), 'builder');
	assert.equal(isWebsiteLayerView('profile'), false);
	assert.equal(isWebsiteLayerView('builder'), true);
	assert.equal(isWebsiteLayerView('address'), true);
});

test('legacy profile and website URLs redirect cleanly to matching Presence Studio views', async () => {
	assert.equal(
		buildPresenceRedirectFromEdit('desert-spokes', ''),
		'/groups/desert-spokes/manage/presence'
	);
	assert.equal(
		buildPresenceRedirectFromEdit('desert-spokes', '?stripe=connected&reason=ready'),
		'/groups/desert-spokes/manage/presence?stripe=connected&reason=ready'
	);
	assert.equal(
		buildPresenceRedirectFromSite('desert-spokes', ''),
		'/groups/desert-spokes/manage/presence?view=builder'
	);
	assert.equal(
		buildPresenceRedirectFromSite(
			'desert-spokes',
			'?domain_checkout=success&session_id=cs_live_123'
		),
		'/groups/desert-spokes/manage/presence?domain_checkout=success&session_id=cs_live_123&view=address'
	);

	await assert.rejects(
		async () => {
			await loadLegacyEdit({
				params: { slug: 'desert-spokes' },
				url: new URL('https://3fp.org/groups/desert-spokes/manage/edit?stripe=connected')
			});
		},
		(redirectObj) => {
			assert.equal(redirectObj.status, 307);
			assert.equal(redirectObj.location, '/groups/desert-spokes/manage/presence?stripe=connected');
			return true;
		}
	);

	await assert.rejects(
		async () => {
			await loadLegacySite({
				params: { slug: 'desert-spokes' },
				url: new URL('https://3fp.org/groups/desert-spokes/manage/site?view=address')
			});
		},
		(redirectObj) => {
			assert.equal(redirectObj.status, 307);
			assert.equal(redirectObj.location, '/groups/desert-spokes/manage/presence?view=address');
			return true;
		}
	);

	assert.throws(
		() => {
			getLegacyRootEdit({
				params: { slug: 'desert-spokes' },
				url: new URL('https://3fp.org/groups/desert-spokes/edit?saved=1')
			});
		},
		(redirectObj) => {
			assert.equal(redirectObj.status, 308);
			assert.equal(redirectObj.location, '/groups/desert-spokes/manage/presence?saved=1');
			return true;
		}
	);
});

test('syncSiteConfigWithCoreGroup keeps directory identity and single seo_description aligned', () => {
	const base = buildDefaultGroupSiteConfig(sampleGroup);
	const customSubpage = createGroupSitePage({
		id: 'routes',
		title: 'Weekly Routes',
		slug: 'routes',
		description: 'Flat canal loops and neighborhood coffee stops.'
	});
	const pages = normalizeGroupSitePages([...base.site_pages, customSubpage], {
		homeBlocks: base.page_blocks
	});
	const staleConfig = {
		...base,
		site_title: 'Outdated Title',
		site_tagline: 'Outdated Tagline',
		home_intro: 'Outdated Intro',
		site_pages: pages
	};

	const synced = syncSiteConfigWithCoreGroup(staleConfig, sampleGroup, {
		seoDescription: 'Casual Tuesday night social bike rides in Tempe, Arizona.'
	});

	assert.equal(synced.site_title, sampleGroup.name);
	assert.equal(synced.site_tagline, sampleGroup.tagline);
	assert.equal(synced.home_intro, sampleGroup.description);
	assert.equal(synced.seo_description, 'Casual Tuesday night social bike rides in Tempe, Arizona.');
	assert.equal(
		synced.site_pages[0].seo_description,
		'Casual Tuesday night social bike rides in Tempe, Arizona.'
	);
	assert.equal(
		synced.site_pages[1].seo_description,
		'Flat canal loops and neighborhood coffee stops.'
	);
});

test('mergeAiProposalIntoPresenceDraft merges AI drafts after manual edits and syncs copy', () => {
	const base = buildDefaultGroupSiteConfig(sampleGroup);
	const manuallyEdited = {
		...base,
		footer_blurb: 'Manual footer edit before applying AI draft'
	};
	const aiProposal = {
		...base,
		site_tagline: 'No-drop Tuesday social rides welcoming every rider in Tempe.',
		home_intro: 'Bring any bike and roll with neighbors across Tempe.',
		seo_description: 'Join Desert Spokes for welcoming Tuesday night no-drop bike rides in Tempe.',
		hero_style: 'bold'
	};

	const result = mergeAiProposalIntoPresenceDraft({
		currentConfig: manuallyEdited,
		proposalConfig: aiProposal,
		groupDraft: sampleGroup
	});

	assert.equal(
		result.groupPatch.tagline,
		'No-drop Tuesday social rides welcoming every rider in Tempe.'
	);
	assert.equal(
		result.groupPatch.description,
		'Bring any bike and roll with neighbors across Tempe.'
	);
	assert.equal(
		result.seoDescription,
		'Join Desert Spokes for welcoming Tuesday night no-drop bike rides in Tempe.'
	);
	assert.equal(result.siteConfig.hero_style, 'bold');
	assert.equal(
		result.siteConfig.site_tagline,
		'No-drop Tuesday social rides welcoming every rider in Tempe.'
	);
});

test('resolveMicrositeSeoDescription outputs configured homepage seo_description and subpage descriptions', () => {
	const configuredSeo =
		'Tempe social cycling club hosting welcoming Tuesday night rides for all skill levels.';
	const site = {
		siteConfig: {
			...buildDefaultGroupSiteConfig(sampleGroup),
			seo_description: configuredSeo
		}
	};

	assert.equal(
		resolveMicrositeSeoDescription({
			site,
			group: sampleGroup,
			isHomePage: true,
			seoTitle: sampleGroup.name,
			seoSection: ''
		}),
		configuredSeo
	);

	assert.equal(
		resolveMicrositeSeoDescription({
			site,
			group: sampleGroup,
			customPage: {
				slug: 'routes',
				title: 'Routes',
				description: 'Explore our favorite Tempe canal and park loops.',
				seo_description: 'Explore our favorite Tempe canal and park loops.'
			},
			isHomePage: false,
			seoTitle: sampleGroup.name,
			seoSection: 'routes'
		}),
		'Explore our favorite Tempe canal and park loops.'
	);

	const blankSeoSite = {
		siteConfig: {
			...buildDefaultGroupSiteConfig(sampleGroup),
			seo_description: ''
		}
	};
	const fallback = resolveMicrositeSeoDescription({
		site: blankSeoSite,
		group: sampleGroup,
		isHomePage: true,
		seoTitle: sampleGroup.name,
		seoSection: ''
	});
	assert.match(fallback, /Friendly Tuesday night social rides across Tempe/i);
	assert.match(fallback, /Tempe, AZ/);
});

test('extractPresenceStudioFormValues preserves profile and website drafts while omitting File objects', () => {
	const defaultSiteConfig = buildDefaultGroupSiteConfig(sampleGroup);
	const formData = new FormData();
	formData.set('return_view', 'profile');
	formData.set('name', 'Desert Spokes Updated');
	formData.set('tagline', 'Updated tagline on error');
	formData.set('description', 'Updated story draft');
	formData.set('city', 'Tempe');
	formData.set('state_region', 'AZ');
	formData.set('country', 'us');
	formData.set('social_instagram', '@desertspokes');
	formData.append('group_type_ids', '4');
	formData.append('group_type_ids', '2');
	formData.set('seo_description', 'Draft search summary preserved across server validation');
	formData.set('microsite_slug', 'taken-slug');
	formData.set('faq_1_q', 'Bring water?');
	formData.set('faq_1_a', 'Yes, two bottles in summer.');
	formData.set('ride_widget_filter_mode', 'radius');
	formData.set('ride_widget_near', 'Tempe, AZ');
	formData.set('ride_widget_radius_miles', '25');
	formData.set(
		'logo_file',
		new File([new Uint8Array([137, 80, 78, 71])], 'club-badge.png', { type: 'image/png' })
	);
	formData.set(
		'sponsor_items_json',
		JSON.stringify([{ name: 'Tempe Bike Co', text: 'Wrench support', logo: '', url: '' }])
	);
	formData.set(
		'sponsor_logo_file_0',
		new File([new Uint8Array([137, 80, 78, 71])], 'tempe-bike.png', { type: 'image/png' })
	);

	const values = extractPresenceStudioFormValues(formData, { group: sampleGroup });

	assert.deepEqual(JSON.parse(JSON.stringify(values)), values);
	assert.equal(values.return_view, 'profile');
	assert.equal(values.seo_description, 'Draft search summary preserved across server validation');
	assert.equal(values.profile.name, 'Desert Spokes Updated');
	assert.equal(values.profile.tagline, 'Updated tagline on error');
	assert.equal(values.profile.country, 'US');
	assert.equal(values.profile.socialInputs.instagram, '@desertspokes');
	assert.deepEqual(values.profile.group_type_ids, [2, 4]);
	assert.deepEqual(values.pending_profile_files, ['club-badge.png']);
	assert.deepEqual(values.pending_sponsor_logo_files, ['tempe-bike.png']);

	const hydratedSite = buildGroupSiteEditorState({
		defaultSiteConfig,
		siteConfig: defaultSiteConfig,
		micrositeSlug: 'desertspokes',
		group: sampleGroup,
		values: values.site
	});
	assert.equal(hydratedSite.slugInput, 'taken-slug');
	assert.equal(hydratedSite.rideFilterMode, 'radius');
	assert.equal(
		hydratedSite.siteConfig.seo_description,
		'Draft search summary preserved across server validation'
	);
	assert.deepEqual(hydratedSite.faqItems, [
		{ question: 'Bring water?', answer: 'Yes, two bottles in summer.' }
	]);
});
