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
import { publishGroupPresence } from '#lib/server/groupPresencePublish.js';
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
			await loadLegacyEdit(
				/** @type {any} */ ({
					params: { slug: 'desert-spokes' },
					url: new URL('https://3fp.org/groups/desert-spokes/manage/edit?stripe=connected')
				})
			);
		},
		(/** @type {any} */ redirectObj) => {
			assert.equal(redirectObj.status, 307);
			assert.equal(redirectObj.location, '/groups/desert-spokes/manage/presence?stripe=connected');
			return true;
		}
	);

	await assert.rejects(
		async () => {
			await loadLegacySite(
				/** @type {any} */ ({
					params: { slug: 'desert-spokes' },
					url: new URL('https://3fp.org/groups/desert-spokes/manage/site?view=address')
				})
			);
		},
		(/** @type {any} */ redirectObj) => {
			assert.equal(redirectObj.status, 307);
			assert.equal(redirectObj.location, '/groups/desert-spokes/manage/presence?view=address');
			return true;
		}
	);

	assert.throws(
		() => {
			getLegacyRootEdit(
				/** @type {any} */ ({
					params: { slug: 'desert-spokes' },
					url: new URL('https://3fp.org/groups/desert-spokes/edit?saved=1')
				})
			);
		},
		(/** @type {any} */ redirectObj) => {
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

/**
 * @param {{
 *   initialGroup?: Record<string, any>,
 *   initialTaxonomies?: Record<string, number[]>,
 *   initialObjects?: Record<string, Record<string, string | Buffer>>,
 *   failGroupUpdate?: any,
 *   failTaxonomyInsertTable?: string | null,
 *   failUpsertSiteConfig?: any
 * }} [options]
 */
function createPublishMockHarness({
	initialGroup = {},
	initialTaxonomies = {},
	initialObjects = {},
	failGroupUpdate = null,
	failTaxonomyInsertTable = null,
	failUpsertSiteConfig = null
} = {}) {
	const groupId = initialGroup.id || '11111111-2222-3333-4444-555555555555';
	const groupRow = {
		id: groupId,
		slug: 'desert-spokes',
		microsite_slug: 'desertspokes',
		name: 'Desert Spokes',
		tagline: 'Original tagline',
		description: 'Original description',
		city: 'Tempe',
		state_region: 'AZ',
		country: 'US',
		logo_url: `https://example.supabase.co/storage/v1/object/public/storage/groups/${groupId}/logo`,
		cover_photo_url: `https://example.supabase.co/storage/v1/object/public/storage/groups/${groupId}/cover`,
		website_url: null,
		public_contact_email: null,
		public_phone_number: null,
		preferred_contact_method_instructions: null,
		how_to_join_instructions: null,
		specific_meeting_point_address: null,
		latitude: 33.4255,
		longitude: -111.94,
		service_area_description: null,
		zip_code: null,
		activity_frequency: null,
		typical_activity_day_time: null,
		membership_info: null,
		preferred_cta_kind: 'auto',
		preferred_cta_label: null,
		preferred_cta_url: null,
		social_links: null,
		...initialGroup
	};

	const taxonomyColumns = {
		group_x_group_types: 'group_type_id',
		group_x_audience_focuses: 'audience_focus_id',
		group_x_riding_disciplines: 'riding_discipline_id',
		group_x_skill_levels: 'skill_level_id'
	};

	const taxonomyRows = {
		group_x_group_types: [...(initialTaxonomies.group_x_group_types ?? [1, 3])].map((id) => ({
			group_id: groupId,
			group_type_id: id
		})),
		group_x_audience_focuses: [...(initialTaxonomies.group_x_audience_focuses ?? [2])].map(
			(id) => ({
				group_id: groupId,
				audience_focus_id: id
			})
		),
		group_x_riding_disciplines: [...(initialTaxonomies.group_x_riding_disciplines ?? [4, 5])].map(
			(id) => ({
				group_id: groupId,
				riding_discipline_id: id
			})
		),
		group_x_skill_levels: [...(initialTaxonomies.group_x_skill_levels ?? [2, 3])].map((id) => ({
			group_id: groupId,
			skill_level_id: id
		}))
	};

	/** @type {Record<string, Map<string, Buffer>>} */
	const buckets = {
		storage: new Map(
			/** @type {Array<[string, Buffer]>} */ ([
				[`groups/${groupId}/logo`, Buffer.from('existing-logo')],
				[`groups/${groupId}/cover`, Buffer.from('existing-cover')],
				...Object.entries(initialObjects.storage || {}).map(([k, v]) => [k, Buffer.from(v)])
			])
		),
		'group-assets': new Map(
			/** @type {Array<[string, Buffer]>} */ (
				Object.entries(initialObjects['group-assets'] || {}).map(([k, v]) => [k, Buffer.from(v)])
			)
		)
	};

	const uploadCalls = [];
	const removeCalls = [];
	let groupUpdateCount = 0;
	let siteConfigSaved = buildDefaultGroupSiteConfig(groupRow);
	const invalidatedSnapshots = [];

	function makeStorageBucket(bucketName) {
		const map = buckets[bucketName];
		return {
			async upload(objectPath, buffer, options = {}) {
				uploadCalls.push({ bucket: bucketName, objectPath, options });
				if (options.upsert !== true && map.has(objectPath)) {
					return { error: { message: `Object already exists: ${objectPath}` } };
				}
				map.set(objectPath, Buffer.from(buffer));
				return { data: { path: objectPath }, error: null };
			},
			getPublicUrl(objectPath) {
				return {
					data: {
						publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucketName}/${objectPath}`
					}
				};
			},
			async remove(paths) {
				removeCalls.push({ bucket: bucketName, paths: [...paths] });
				for (const item of paths) {
					map.delete(item);
				}
				return { data: paths, error: null };
			}
		};
	}

	const supabase = {
		storage: {
			from: (bucketName) => makeStorageBucket(bucketName)
		},
		from(table) {
			if (table === 'groups') {
				return {
					update(patch) {
						return {
							async eq(_col, targetId) {
								groupUpdateCount += 1;
								if (groupUpdateCount === 1 && failGroupUpdate) {
									return { error: failGroupUpdate };
								}
								if (targetId === groupId) {
									Object.assign(groupRow, patch);
								}
								return { error: null };
							}
						};
					}
				};
			}

			if (Object.prototype.hasOwnProperty.call(taxonomyColumns, table)) {
				const column = taxonomyColumns[table];
				return {
					select() {
						return {
							async eq(_col, targetId) {
								return {
									data: taxonomyRows[table]
										.filter((row) => row.group_id === targetId)
										.map((row) => ({ [column]: row[column] })),
									error: null
								};
							}
						};
					},
					delete() {
						return {
							async eq(_col, targetId) {
								taxonomyRows[table] = taxonomyRows[table].filter(
									(row) => row.group_id !== targetId
								);
								return { error: null };
							}
						};
					},
					async insert(rows) {
						if (failTaxonomyInsertTable === table) {
							failTaxonomyInsertTable = null;
							return { error: { message: `Foreign key error on ${table}` } };
						}
						for (const row of rows) {
							const exists = taxonomyRows[table].some(
								(existing) => existing.group_id === row.group_id && existing[column] === row[column]
							);
							if (exists) {
								return { error: { message: `Duplicate PK in ${table}` } };
							}
							taxonomyRows[table].push({ ...row });
						}
						return { error: null };
					}
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		}
	};

	const serviceSupabase = {
		storage: {
			from: (bucketName) => makeStorageBucket(bucketName)
		}
	};

	function readTaxonomyIds() {
		return Object.fromEntries(
			Object.entries(taxonomyColumns).map(([table, col]) => [
				table,
				taxonomyRows[table].map((row) => row[col]).sort((a, b) => a - b)
			])
		);
	}

	return {
		groupId,
		initialSnapshot: { ...groupRow },
		groupRow,
		buckets,
		uploadCalls,
		removeCalls,
		readTaxonomyIds,
		supabase,
		serviceSupabase,
		invalidatedSnapshots,
		getSiteConfig: async () => siteConfigSaved,
		upsertSiteConfig: async (_id, nextConfig) => {
			if (failUpsertSiteConfig) {
				throw failUpsertSiteConfig;
			}
			siteConfigSaved = nextConfig;
			return nextConfig;
		},
		getSavedSiteConfig: () => siteConfigSaved,
		optimizeImage: async (buffer) => ({
			buffer,
			contentType: 'image/webp',
			extension: 'webp'
		})
	};
}

function buildSamplePublishForm({
	name = 'Desert Spokes Collective',
	tagline = 'Updated tagline',
	micrositeSlug = 'desertspokes',
	returnView = 'builder',
	includeUploads = true
} = {}) {
	const form = new FormData();
	form.set('return_view', returnView);
	form.set('name', name);
	form.set('tagline', tagline);
	form.set('description', 'Updated story across Tempe');
	form.set('city', 'Tempe');
	form.set('state_region', 'AZ');
	form.set('country', 'US');
	form.set('microsite_slug', micrositeSlug);
	form.set('seo_description', 'Updated SEO description');
	form.append('group_type_ids', '9');
	form.append('audience_focus_ids', '7');
	form.append('riding_discipline_ids', '8');
	form.append('skill_level_ids', '6');
	if (includeUploads) {
		form.set(
			'logo_file',
			new File([new Uint8Array([1, 2, 3, 4])], 'new-logo.png', { type: 'image/png' })
		);
		form.set(
			'cover_file',
			new File([new Uint8Array([5, 6, 7, 8])], 'new-cover.png', { type: 'image/png' })
		);
		form.set(
			'sponsor_items_json',
			JSON.stringify([{ name: 'Tempe Cyclery', text: 'Shop partner', logo: '', url: '' }])
		);
		form.set(
			'sponsor_logo_file_0',
			new File([new Uint8Array([9, 10, 11, 12])], 'sponsor.png', { type: 'image/png' })
		);
	}
	return form;
}

test('publishGroupPresence uploads media to non-overwriting versioned paths and cleans up replaced assets only after commit', async () => {
	const harness = createPublishMockHarness();
	const form = buildSamplePublishForm();

	const result = await publishGroupPresence({
		slug: 'desert-spokes',
		group: harness.initialSnapshot,
		groupId: harness.groupId,
		supabase: harness.supabase,
		form,
		getSiteConfig: harness.getSiteConfig,
		upsertSiteConfig: harness.upsertSiteConfig,
		getServiceSupabase: () => harness.serviceSupabase,
		invalidateSnapshotCache: (payload) => harness.invalidatedSnapshots.push(payload),
		optimizeImage: harness.optimizeImage,
		supabasePublicUrl: 'https://example.supabase.co'
	});

	assert.equal(result.ok, true);
	assert.equal(result.redirectTo, '/groups/desert-spokes/manage/presence?saved=1&view=builder');

	// Every storage upload must use upsert: false at a unique versioned path
	assert.equal(harness.uploadCalls.length, 3);
	for (const call of harness.uploadCalls) {
		assert.equal(call.options.upsert, false);
	}
	const storageUploads = harness.uploadCalls.filter((call) => call.bucket === 'storage');
	assert.equal(storageUploads.length, 2);
	assert.match(storageUploads[0].objectPath, new RegExp(`^groups/${harness.groupId}/logo-`));
	assert.match(storageUploads[1].objectPath, new RegExp(`^groups/${harness.groupId}/cover-`));

	// Replaced legacy objects are cleaned up post-commit while new objects remain
	assert.equal(harness.buckets.storage.has(`groups/${harness.groupId}/logo`), false);
	assert.equal(harness.buckets.storage.has(`groups/${harness.groupId}/cover`), false);
	assert.equal(harness.buckets.storage.has(storageUploads[0].objectPath), true);
	assert.equal(harness.buckets.storage.has(storageUploads[1].objectPath), true);

	assert.deepEqual(harness.readTaxonomyIds(), {
		group_x_group_types: [9],
		group_x_audience_focuses: [7],
		group_x_riding_disciplines: [8],
		group_x_skill_levels: [6]
	});
	assert.equal(harness.groupRow.name, 'Desert Spokes Collective');
	assert.equal(harness.getSavedSiteConfig().site_title, 'Desert Spokes Collective');
	assert.equal(harness.invalidatedSnapshots.length, 1);
});

test('publishGroupPresence cleans up staged media and preserves existing assets and taxonomies when group update fails', async () => {
	const harness = createPublishMockHarness({
		failGroupUpdate: { code: '23505', message: 'duplicate key value violates unique constraint' }
	});
	const form = buildSamplePublishForm({ micrositeSlug: 'taken-slug' });

	const result = await publishGroupPresence({
		slug: 'desert-spokes',
		group: harness.initialSnapshot,
		groupId: harness.groupId,
		supabase: harness.supabase,
		form,
		getSiteConfig: harness.getSiteConfig,
		upsertSiteConfig: harness.upsertSiteConfig,
		getServiceSupabase: () => harness.serviceSupabase,
		optimizeImage: harness.optimizeImage,
		supabasePublicUrl: 'https://example.supabase.co'
	});

	if (result.ok) {
		assert.fail('Expected publishGroupPresence to fail on duplicate slug');
	}
	assert.equal(result.status, 409);
	assert.equal(result.body.values.site.microsite_slug, 'taken-slug');

	// Existing live logo and cover objects were never overwritten or deleted
	assert.deepEqual(
		[...harness.buckets.storage.keys()],
		[`groups/${harness.groupId}/logo`, `groups/${harness.groupId}/cover`]
	);
	assert.equal(harness.buckets['group-assets'].size, 0);

	// Taxonomies were untouched
	assert.deepEqual(harness.readTaxonomyIds(), {
		group_x_group_types: [1, 3],
		group_x_audience_focuses: [2],
		group_x_riding_disciplines: [4, 5],
		group_x_skill_levels: [2, 3]
	});
});

test('publishGroupPresence restores group fields, all 4 taxonomy tables, and cleans up staged media on taxonomy insert failure', async () => {
	const harness = createPublishMockHarness({
		failTaxonomyInsertTable: 'group_x_skill_levels'
	});
	const form = buildSamplePublishForm();

	const result = await publishGroupPresence({
		slug: 'desert-spokes',
		group: harness.initialSnapshot,
		groupId: harness.groupId,
		supabase: harness.supabase,
		form,
		getSiteConfig: harness.getSiteConfig,
		upsertSiteConfig: harness.upsertSiteConfig,
		getServiceSupabase: () => harness.serviceSupabase,
		optimizeImage: harness.optimizeImage,
		supabasePublicUrl: 'https://example.supabase.co'
	});

	if (result.ok) {
		assert.fail('Expected publishGroupPresence to fail on taxonomy insert');
	}
	assert.equal(result.status, 500);
	assert.match(result.body.error, /group_x_skill_levels/);

	// Group row restored to original snapshot (including original logo_url & cover_photo_url)
	assert.equal(harness.groupRow.name, 'Desert Spokes');
	assert.equal(harness.groupRow.tagline, 'Original tagline');
	assert.equal(harness.groupRow.logo_url, harness.initialSnapshot.logo_url);
	assert.equal(harness.groupRow.cover_photo_url, harness.initialSnapshot.cover_photo_url);

	// All 4 taxonomy tables restored to pre-publish snapshot (not wiped empty or partially updated)
	assert.deepEqual(harness.readTaxonomyIds(), {
		group_x_group_types: [1, 3],
		group_x_audience_focuses: [2],
		group_x_riding_disciplines: [4, 5],
		group_x_skill_levels: [2, 3]
	});

	// Staged uploads removed while original storage objects remain untouched
	assert.deepEqual(
		[...harness.buckets.storage.keys()],
		[`groups/${harness.groupId}/logo`, `groups/${harness.groupId}/cover`]
	);
	assert.equal(harness.buckets['group-assets'].size, 0);
});

test('publishGroupPresence restores group fields, all 4 taxonomy tables, and preserves live media when upsertSiteConfig fails', async () => {
	const harness = createPublishMockHarness({
		failUpsertSiteConfig: new Error('Invalid microsite block configuration')
	});
	const form = buildSamplePublishForm();

	const result = await publishGroupPresence({
		slug: 'desert-spokes',
		group: harness.initialSnapshot,
		groupId: harness.groupId,
		supabase: harness.supabase,
		form,
		getSiteConfig: harness.getSiteConfig,
		upsertSiteConfig: harness.upsertSiteConfig,
		getServiceSupabase: () => harness.serviceSupabase,
		optimizeImage: harness.optimizeImage,
		supabasePublicUrl: 'https://example.supabase.co'
	});

	if (result.ok) {
		assert.fail('Expected publishGroupPresence to fail on upsertSiteConfig');
	}
	assert.equal(result.status, 400);
	assert.equal(result.body.error, 'Invalid microsite block configuration');
	assert.equal(result.body.values.profile.name, 'Desert Spokes Collective');

	// Group row restored
	assert.equal(harness.groupRow.name, 'Desert Spokes');
	assert.equal(harness.groupRow.tagline, 'Original tagline');
	assert.equal(harness.groupRow.logo_url, harness.initialSnapshot.logo_url);
	assert.equal(harness.groupRow.cover_photo_url, harness.initialSnapshot.cover_photo_url);

	// Newly inserted taxonomy rows cleared and all 4 snapshotted taxonomy tables restored without PK collisions
	assert.deepEqual(harness.readTaxonomyIds(), {
		group_x_group_types: [1, 3],
		group_x_audience_focuses: [2],
		group_x_riding_disciplines: [4, 5],
		group_x_skill_levels: [2, 3]
	});

	// Original storage objects remain untouched and newly uploaded objects were rolled back
	assert.deepEqual(
		[...harness.buckets.storage.keys()],
		[`groups/${harness.groupId}/logo`, `groups/${harness.groupId}/cover`]
	);
	assert.equal(
		harness.buckets.storage.get(`groups/${harness.groupId}/logo`)?.toString(),
		'existing-logo'
	);
	assert.equal(
		harness.buckets.storage.get(`groups/${harness.groupId}/cover`)?.toString(),
		'existing-cover'
	);
	assert.equal(harness.buckets['group-assets'].size, 0);
});
