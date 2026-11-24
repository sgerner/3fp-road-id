import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isReservedMicrositeSlug, normalizeMicrositeSlug } from '#lib/microsites/host.js';
import { parseGroupSiteFormData } from '#lib/microsites/config.js';
import { collectGroupSocialLinkInputs } from '#lib/groups/socialLinks.js';
import {
	extractPresenceStudioFormValues,
	normalizePresenceStudioView,
	syncSiteConfigWithCoreGroup
} from '#lib/groups/presenceStudio.js';
import { optimizeImageForStorage } from '#lib/server/storageImages.js';
import { parseGroupEditorImageDataUrl } from '#lib/server/groupEditorImages.js';
import { prepareRemoteImage as defaultPrepareRemoteImage } from '#lib/server/remoteImages.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const GROUP_MEDIA_BUCKET = 'storage';
export const SPONSOR_LOGO_BUCKET = 'group-assets';
export const SPONSOR_LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const SPONSOR_LOGO_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif'
]);

export const ALLOWED_PREFERRED_CTA_KINDS = new Set([
	'auto',
	'website',
	'email',
	'phone',
	'custom',
	'facebook',
	'instagram',
	'strava',
	'x',
	'tiktok'
]);

export const GROUP_TAXONOMY_TABLES = Object.freeze([
	{ table: 'group_x_group_types', column: 'group_type_id', formKey: 'group_type_ids' },
	{
		table: 'group_x_audience_focuses',
		column: 'audience_focus_id',
		formKey: 'audience_focus_ids'
	},
	{
		table: 'group_x_riding_disciplines',
		column: 'riding_discipline_id',
		formKey: 'riding_discipline_ids'
	},
	{ table: 'group_x_skill_levels', column: 'skill_level_id', formKey: 'skill_level_ids' }
]);

function parseFiniteCoordinate(raw) {
	if (raw === null || raw === undefined || raw === '') return null;
	const numeric = Number(raw);
	return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeSponsorItems(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => ({
			name: String(item?.name || '').trim(),
			text: String(item?.text || '').trim(),
			logo: String(item?.logo || '').trim(),
			url: String(item?.url || '').trim()
		}))
		.slice(0, 12);
}

function parseSponsorItemsJson(formData) {
	const raw = formData.get('sponsor_items_json');
	if (!raw) return [];
	try {
		return sanitizeSponsorItems(JSON.parse(String(raw)));
	} catch {
		return [];
	}
}

function buildGroupMediaObjectPath(groupId, slot, extension) {
	const safeExt = String(extension || 'webp').replace(/^\.+/, '') || 'webp';
	return `groups/${groupId}/${slot}-${Date.now()}-${randomUUID()}.${safeExt}`;
}

function buildSponsorLogoObjectPath(groupId, fileName) {
	const extension = path.extname(String(fileName || '')).toLowerCase() || '.png';
	return `groups/${groupId}/microsite/sponsors/${Date.now()}-${randomUUID()}${extension}`;
}

export function managedSponsorLogoObjectPaths(config, groupId) {
	const marker = `/storage/v1/object/public/${SPONSOR_LOGO_BUCKET}/`;
	const prefix = `groups/${groupId}/microsite/sponsors/`;
	return new Set(
		(Array.isArray(config?.sponsor_items) ? config.sponsor_items : [])
			.map((item) => {
				try {
					const pathname = new URL(String(item?.logo || '')).pathname;
					const markerIndex = pathname.indexOf(marker);
					if (markerIndex < 0) return '';
					const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
					return objectPath.startsWith(prefix) ? objectPath : '';
				} catch {
					return '';
				}
			})
			.filter(Boolean)
	);
}

export function extractManagedGroupMediaObjectPath(rawUrl, groupId) {
	if (!rawUrl || !groupId) return '';
	const marker = `/storage/v1/object/public/${GROUP_MEDIA_BUCKET}/`;
	const prefix = `groups/${groupId}/`;
	try {
		const pathname = new URL(String(rawUrl)).pathname;
		const markerIndex = pathname.indexOf(marker);
		if (markerIndex < 0) return '';
		const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
		return objectPath.startsWith(prefix) ? objectPath : '';
	} catch {
		return '';
	}
}

export async function removeStorageObjects(storageClient, bucket, paths) {
	if (!storageClient || !paths?.length) return;
	try {
		await storageClient.storage.from(bucket).remove(paths);
	} catch {
		// Best-effort storage cleanup; avoid masking primary error.
	}
}

/**
 * @param {any} supabase
 * @param {string} groupId
 * @returns {Promise<{ ok: true, snapshot: Record<string, number[]> } | { ok: false, error: any }>}
 */
export async function snapshotGroupTaxonomies(supabase, groupId) {
	const results = await Promise.all(
		GROUP_TAXONOMY_TABLES.map(({ table, column }) =>
			supabase.from(table).select(column).eq('group_id', groupId)
		)
	);

	/** @type {Record<string, number[]>} */
	const snapshot = {};
	for (let index = 0; index < GROUP_TAXONOMY_TABLES.length; index += 1) {
		const { table, column } = GROUP_TAXONOMY_TABLES[index];
		const result = results[index];
		if (result?.error) {
			return { ok: false, error: result.error };
		}
		snapshot[table] = (Array.isArray(result?.data) ? result.data : [])
			.map((row) => Number(row?.[column]))
			.filter((value) => Number.isFinite(value) && value > 0);
	}

	return { ok: true, snapshot };
}

/**
 * @param {any} supabase
 * @param {string} groupId
 * @param {string} table
 * @param {string} column
 * @param {number[]} targetIds
 * @param {number[]} currentIds
 */
async function syncSingleTaxonomyTable(supabase, groupId, table, column, targetIds, currentIds) {
	const targetSet = new Set(targetIds);
	const currentSet = new Set(currentIds);
	const addedIds = targetIds.filter((id) => !currentSet.has(id));
	const removedIds = currentIds.filter((id) => !targetSet.has(id));

	if (addedIds.length) {
		const insertResult = await supabase
			.from(table)
			.insert(addedIds.map((id) => ({ group_id: groupId, [column]: id })));
		if (insertResult?.error) {
			return { ok: false, stage: 'insert', error: insertResult.error };
		}
	}

	if (removedIds.length) {
		const deleteResult = await supabase
			.from(table)
			.delete()
			.eq('group_id', groupId)
			.in(column, removedIds);
		if (deleteResult?.error) {
			return { ok: false, stage: 'delete', error: deleteResult.error };
		}
	}

	return { ok: true, mutated: addedIds.length > 0 || removedIds.length > 0 };
}

/**
 * @param {any} supabase
 * @param {string} groupId
 * @param {Record<string, number[]> | null | undefined} snapshot
 */
export async function restoreGroupTaxonomySnapshot(supabase, groupId, snapshot) {
	if (!supabase || !snapshot) return;
	const currentResult = await snapshotGroupTaxonomies(supabase, groupId);
	if (currentResult.ok && currentResult.snapshot) {
		const currentSnapshot = currentResult.snapshot;
		const syncResults = await Promise.all(
			GROUP_TAXONOMY_TABLES.map(({ table, column }) => {
				const targetIds = Array.isArray(snapshot[table]) ? snapshot[table] : [];
				const currentIds = Array.isArray(currentSnapshot[table]) ? currentSnapshot[table] : [];
				return syncSingleTaxonomyTable(supabase, groupId, table, column, targetIds, currentIds);
			})
		);
		if (syncResults.every((result) => result.ok)) {
			return;
		}
	}

	await Promise.all(
		GROUP_TAXONOMY_TABLES.map(({ table }) => supabase.from(table).delete().eq('group_id', groupId))
	);
	const restoreInserts = [];
	for (const { table, column } of GROUP_TAXONOMY_TABLES) {
		const ids = Array.isArray(snapshot[table]) ? snapshot[table] : [];
		if (ids.length) {
			restoreInserts.push(
				supabase.from(table).insert(ids.map((id) => ({ group_id: groupId, [column]: id })))
			);
		}
	}
	if (restoreInserts.length) {
		await Promise.all(restoreInserts);
	}
}

async function prepareGroupMediaSlot({
	slot,
	croppedDataUrl,
	rawFile,
	incomingUrl,
	currentUrl,
	allowStoragePassthrough = false,
	supabaseOrigin = '',
	optimizeImage,
	prepareRemoteImage
}) {
	if (croppedDataUrl) {
		const parsed = parseGroupEditorImageDataUrl(croppedDataUrl);
		if (!parsed || parsed.buffer.length > MAX_IMAGE_BYTES) {
			return {
				ok: false,
				error: `Cropped ${slot === 'logo' ? 'logo' : 'cover'} exceeds 10MB limit.`
			};
		}
		const contentType = parsed.mime || 'image/jpeg';
		if (!contentType.startsWith('image/')) {
			return {
				ok: false,
				error: `Unsupported ${slot === 'logo' ? 'logo' : 'cover'} image format.`
			};
		}
		const optimized = await optimizeImage(parsed.buffer, {
			contentType,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
		return { ok: true, kind: 'upload', slot, optimized };
	}

	if (rawFile && typeof rawFile.arrayBuffer === 'function' && rawFile.size > 0) {
		if (rawFile.size > MAX_IMAGE_BYTES) {
			return {
				ok: false,
				error: `${slot === 'logo' ? 'Logo file' : 'Cover image'} exceeds 10MB limit.`
			};
		}
		const contentType = rawFile.type || 'application/octet-stream';
		if (!contentType.startsWith('image/')) {
			return {
				ok: false,
				error: `Unsupported ${slot === 'logo' ? 'logo' : 'cover'} image format.`
			};
		}
		const optimized = await optimizeImage(Buffer.from(await rawFile.arrayBuffer()), {
			contentType,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
		return { ok: true, kind: 'upload', slot, optimized };
	}

	if (incomingUrl && incomingUrl !== currentUrl && /^https?:\/\//i.test(incomingUrl)) {
		if (
			allowStoragePassthrough &&
			supabaseOrigin &&
			incomingUrl.startsWith(
				`${supabaseOrigin}/storage/v1/object/public/${GROUP_MEDIA_BUCKET}/groups/`
			)
		) {
			return { ok: true, kind: 'direct', url: incomingUrl };
		}
		try {
			const optimized = await prepareRemoteImage(incomingUrl, {
				maxBytes: MAX_IMAGE_BYTES,
				maxWidth: 2400,
				maxHeight: 1800,
				quality: 82
			});
			return { ok: true, kind: 'upload', slot, optimized, fallbackUrl: incomingUrl };
		} catch {
			return { ok: true, kind: 'direct', url: incomingUrl };
		}
	}

	return { ok: true, kind: 'unchanged' };
}

async function prepareSponsorLogoUploads({ formData, optimizeImage }) {
	const sponsorItems = parseSponsorItemsJson(formData);
	if (!sponsorItems.length) {
		return { sponsorItems: [], pendingUploads: [] };
	}

	const pendingUploads = [];
	for (let index = 0; index < sponsorItems.length; index += 1) {
		const file = formData.get(`sponsor_logo_file_${index}`);
		if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) continue;

		if (!SPONSOR_LOGO_MIME_TYPES.has(file.type)) {
			throw new Error(`Unsupported sponsor logo type: ${file.type || 'unknown type'}`);
		}
		if (file.size > SPONSOR_LOGO_MAX_BYTES) {
			throw new Error(`${file.name || 'Sponsor logo'} exceeds the 5 MB limit.`);
		}

		const sourceBuffer = Buffer.from(await file.arrayBuffer());
		const optimized = await optimizeImage(sourceBuffer, {
			contentType: file.type,
			maxWidth: 1600,
			maxHeight: 1200,
			quality: 84
		});
		const baseName = path.basename(file.name, path.extname(file.name));
		pendingUploads.push({
			index,
			fileName: `${baseName}.${optimized.extension}`,
			optimized
		});
	}

	return { sponsorItems, pendingUploads };
}

/**
 * @param {{
 *   slug: string,
 *   group: Record<string, any>,
 *   groupId: string,
 *   supabase: any,
 *   form: FormData,
 *   getSiteConfig: (groupId: string, opts?: any) => Promise<any>,
 *   upsertSiteConfig: (groupId: string, config: any, opts?: any) => Promise<any>,
 *   getServiceSupabase?: () => any,
 *   invalidateSnapshotCache?: (target: any) => any,
 *   optimizeImage?: (buffer: any, opts?: any) => Promise<any>,
 *   prepareRemoteImage?: (url: string, opts?: any) => Promise<any>,
 *   supabasePublicUrl?: string
 * }} options
 * @returns {Promise<{ ok: true, redirectTo: string } | { ok: false, status: number, body: Record<string, any> }>}
 */
export async function publishGroupPresence({
	slug,
	group,
	groupId,
	supabase,
	form,
	getSiteConfig,
	upsertSiteConfig,
	getServiceSupabase = () => null,
	invalidateSnapshotCache = () => {},
	optimizeImage = optimizeImageForStorage,
	prepareRemoteImage = defaultPrepareRemoteImage,
	supabasePublicUrl = process.env.PUBLIC_SUPABASE_URL || ''
}) {
	const values = extractPresenceStudioFormValues(form, { group });

	const rawMicrositeSlug = form.has('microsite_slug')
		? form.get('microsite_slug')
		: group.microsite_slug || group.slug;
	const requestedMicrositeSlug = normalizeMicrositeSlug(rawMicrositeSlug);
	if (!requestedMicrositeSlug) {
		return {
			ok: false,
			status: 400,
			body: {
				error: 'Website slug is required and can only use letters/numbers.',
				values
			}
		};
	}
	if (isReservedMicrositeSlug(requestedMicrositeSlug)) {
		return {
			ok: false,
			status: 400,
			body: {
				error: 'That website slug is reserved. Pick another one.',
				values
			}
		};
	}

	const rawPreferredCtaKind = (form.get('preferred_cta_kind')?.toString() || 'auto')
		.trim()
		.toLowerCase();
	const preferredCtaKind = ALLOWED_PREFERRED_CTA_KINDS.has(rawPreferredCtaKind)
		? rawPreferredCtaKind
		: 'auto';

	let preferredCtaLabel = null;
	let preferredCtaUrl = null;
	if (preferredCtaKind === 'custom') {
		preferredCtaLabel = (form.get('preferred_cta_label')?.toString().trim() || '').slice(0, 10);
		preferredCtaUrl = form.get('preferred_cta_url')?.toString().trim() || '';
		if (!preferredCtaLabel) {
			return {
				ok: false,
				status: 400,
				body: {
					error: 'Custom CTA label is required and must be 10 characters or fewer.',
					values
				}
			};
		}
		if (!preferredCtaUrl) {
			return {
				ok: false,
				status: 400,
				body: { error: 'Custom CTA URL is required.', values }
			};
		}
	}

	const stateRegion = form.get('state_region')?.toString().trim() ?? '';
	const country = form.get('country')?.toString().trim().toUpperCase() ?? 'US';
	if (!stateRegion || !country) {
		return {
			ok: false,
			status: 400,
			body: { error: 'State/Region and Country are required.', values }
		};
	}

	/** @type {any} */
	const logoFile = form.get('logo_file');
	/** @type {any} */
	const coverFile = form.get('cover_file');
	const logoCropped = form.get('logo_file_cropped')?.toString() || '';
	const coverCropped = form.get('cover_file_cropped')?.toString() || '';
	if (logoFile && logoFile.size && logoFile.size > MAX_IMAGE_BYTES) {
		return {
			ok: false,
			status: 400,
			body: { error: 'Logo file exceeds 10MB limit.', values }
		};
	}
	if (coverFile && coverFile.size && coverFile.size > MAX_IMAGE_BYTES) {
		return {
			ok: false,
			status: 400,
			body: { error: 'Cover image exceeds 10MB limit.', values }
		};
	}
	if (logoCropped) {
		const parsed = parseGroupEditorImageDataUrl(logoCropped);
		if (!parsed || parsed.buffer.length > MAX_IMAGE_BYTES) {
			return {
				ok: false,
				status: 400,
				body: { error: 'Cropped logo exceeds 10MB limit.', values }
			};
		}
	}
	if (coverCropped) {
		const parsed = parseGroupEditorImageDataUrl(coverCropped);
		if (!parsed || parsed.buffer.length > MAX_IMAGE_BYTES) {
			return {
				ok: false,
				status: 400,
				body: { error: 'Cropped cover exceeds 10MB limit.', values }
			};
		}
	}

	const incomingLogo = form.get('logo_url')?.toString().trim() || '';
	const incomingCover = form.get('cover_photo_url')?.toString().trim() || '';
	const clearLogo = (form.get('clear_logo')?.toString() || '') === '1';
	const clearCover = (form.get('clear_cover')?.toString() || '') === '1';
	const supabaseOrigin = String(supabasePublicUrl || '').replace(/\/$/, '');

	let preparedLogo;
	let preparedCover;
	try {
		[preparedLogo, preparedCover] = await Promise.all([
			prepareGroupMediaSlot({
				slot: 'logo',
				croppedDataUrl: logoCropped,
				rawFile: logoFile,
				incomingUrl: clearLogo ? '' : incomingLogo,
				currentUrl: group.logo_url || '',
				allowStoragePassthrough: false,
				supabaseOrigin,
				optimizeImage,
				prepareRemoteImage
			}),
			prepareGroupMediaSlot({
				slot: 'cover',
				croppedDataUrl: coverCropped,
				rawFile: coverFile,
				incomingUrl: clearCover ? '' : incomingCover,
				currentUrl: group.cover_photo_url || '',
				allowStoragePassthrough: true,
				supabaseOrigin,
				optimizeImage,
				prepareRemoteImage
			})
		]);
	} catch (error) {
		return {
			ok: false,
			status: 400,
			body: {
				error: error?.message || 'Unable to process uploaded image.',
				values
			}
		};
	}

	if (!preparedLogo.ok) {
		return { ok: false, status: 400, body: { error: preparedLogo.error, values } };
	}
	if (!preparedCover.ok) {
		return { ok: false, status: 400, body: { error: preparedCover.error, values } };
	}

	let preparedSponsors;
	try {
		preparedSponsors = await prepareSponsorLogoUploads({ formData: form, optimizeImage });
	} catch (error) {
		return {
			ok: false,
			status: 400,
			body: {
				error: error?.message || 'Unable to upload sponsor logo.',
				values
			}
		};
	}

	const serviceSupabase = preparedSponsors.pendingUploads.length ? getServiceSupabase() : null;
	if (preparedSponsors.pendingUploads.length && !serviceSupabase) {
		return {
			ok: false,
			status: 400,
			body: {
				error: 'SUPABASE_SERVICE_ROLE_KEY is required for sponsor logo uploads.',
				values
			}
		};
	}

	// Snapshot existing site config and all 4 taxonomy join tables before any storage or DB writes.
	let previousConfig;
	let taxonomySnapshotResult;
	try {
		[previousConfig, taxonomySnapshotResult] = await Promise.all([
			getSiteConfig(groupId, { group, supabaseClient: supabase }),
			snapshotGroupTaxonomies(supabase, groupId)
		]);
	} catch (error) {
		return {
			ok: false,
			status: 500,
			body: {
				error: error?.message || 'Unable to load current group presence state.',
				values
			}
		};
	}
	if (!taxonomySnapshotResult.ok) {
		return {
			ok: false,
			status: 500,
			body: {
				error:
					taxonomySnapshotResult.error?.message || 'Unable to snapshot current group categories.',
				values
			}
		};
	}
	const taxonomySnapshot = taxonomySnapshotResult.snapshot;

	/** @type {Record<string, any>} */
	const groupPayload = {
		city: form.get('city')?.toString().trim() ?? '',
		state_region: stateRegion,
		country,
		tagline: form.get('tagline')?.toString().trim() || null,
		description: form.get('description')?.toString().trim() || null,
		website_url: form.get('website_url')?.toString().trim() || null,
		public_contact_email: form.get('public_contact_email')?.toString().trim() || null,
		public_phone_number: form.get('public_phone_number')?.toString().trim() || null,
		preferred_contact_method_instructions:
			form.get('preferred_contact_method_instructions')?.toString().trim() || null,
		how_to_join_instructions: form.get('how_to_join_instructions')?.toString().trim() || null,
		specific_meeting_point_address:
			form.get('specific_meeting_point_address')?.toString().trim() || null,
		latitude: parseFiniteCoordinate(form.get('latitude')),
		longitude: parseFiniteCoordinate(form.get('longitude')),
		service_area_description: form.get('service_area_description')?.toString().trim() || null,
		zip_code: form.get('zip_code')?.toString().trim() || null,
		activity_frequency: form.get('activity_frequency')?.toString().trim() || null,
		typical_activity_day_time: form.get('typical_activity_day_time')?.toString().trim() || null,
		membership_info: form.get('membership_info')?.toString().trim() || null,
		preferred_cta_kind: preferredCtaKind,
		preferred_cta_label: preferredCtaLabel,
		preferred_cta_url: preferredCtaUrl,
		social_links: (() => {
			const cleaned = collectGroupSocialLinkInputs(
				(field) => form.get(`social_${field}`)?.toString() || ''
			);
			return Object.keys(cleaned).length ? cleaned : null;
		})()
	};

	const incomingName = form.get('name')?.toString().trim() || '';
	if (incomingName) {
		groupPayload.name = incomingName;
	}

	const currentMicrositeSlug = normalizeMicrositeSlug(group.microsite_slug || group.slug);
	if (requestedMicrositeSlug !== currentMicrositeSlug || !group.microsite_slug) {
		groupPayload.microsite_slug = requestedMicrositeSlug;
	}

	if (clearLogo) groupPayload.logo_url = null;
	if (clearCover) groupPayload.cover_photo_url = null;

	const uploadedGroupMediaPaths = [];
	const uploadedSponsorPaths = [];

	const uploadPreparedSlot = async (prepared, label) => {
		if (prepared.kind === 'unchanged') return null;
		if (prepared.kind === 'direct') return prepared.url;

		const objectPath = buildGroupMediaObjectPath(
			groupId,
			prepared.slot,
			prepared.optimized.extension
		);
		const uploadResult = await supabase.storage
			.from(GROUP_MEDIA_BUCKET)
			.upload(objectPath, prepared.optimized.buffer, {
				contentType: prepared.optimized.contentType,
				upsert: false
			});
		if (uploadResult?.error) {
			if (prepared.fallbackUrl) return prepared.fallbackUrl;
			throw new Error(uploadResult.error.message || `Unable to upload ${label}.`);
		}
		uploadedGroupMediaPaths.push(objectPath);
		const { data: publicData } = supabase.storage.from(GROUP_MEDIA_BUCKET).getPublicUrl(objectPath);
		if (!publicData?.publicUrl) {
			if (prepared.fallbackUrl) return prepared.fallbackUrl;
			throw new Error(`Unable to resolve public URL for uploaded ${label}.`);
		}
		return publicData.publicUrl;
	};

	try {
		const nextLogoUrl = await uploadPreparedSlot(preparedLogo, 'logo');
		if (nextLogoUrl !== null) {
			groupPayload.logo_url = nextLogoUrl;
		}
		const nextCoverUrl = await uploadPreparedSlot(preparedCover, 'cover image');
		if (nextCoverUrl !== null) {
			groupPayload.cover_photo_url = nextCoverUrl;
		}

		for (const pending of preparedSponsors.pendingUploads) {
			if (!serviceSupabase) {
				throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for sponsor logo uploads.');
			}
			const objectPath = buildSponsorLogoObjectPath(groupId, pending.fileName);
			const { error: uploadError } = await serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.upload(objectPath, pending.optimized.buffer, {
					contentType: pending.optimized.contentType,
					upsert: false
				});
			if (uploadError) throw uploadError;
			uploadedSponsorPaths.push(objectPath);

			const { data: publicData } = serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.getPublicUrl(objectPath);
			if (!publicData?.publicUrl) {
				throw new Error('Failed to get a public URL for uploaded sponsor logo.');
			}
			preparedSponsors.sponsorItems[pending.index].logo = publicData.publicUrl;
		}
	} catch (error) {
		await Promise.all([
			removeStorageObjects(supabase, GROUP_MEDIA_BUCKET, uploadedGroupMediaPaths),
			removeStorageObjects(serviceSupabase, SPONSOR_LOGO_BUCKET, uploadedSponsorPaths)
		]);
		return {
			ok: false,
			status: 400,
			body: {
				error: error?.message || 'Unable to upload presence media.',
				values
			}
		};
	}

	if (preparedSponsors.sponsorItems.length) {
		form.set(
			'sponsor_items_json',
			JSON.stringify(
				preparedSponsors.sponsorItems.filter(
					(item) => item.name || item.text || item.logo || item.url
				)
			)
		);
	}

	/** @type {Record<string, any>} */
	const rollbackGroupSnapshot = {};
	for (const key of Object.keys(groupPayload)) {
		rollbackGroupSnapshot[key] = Object.prototype.hasOwnProperty.call(group, key)
			? group[key]
			: null;
	}

	const rollbackAllMutations = async ({ groupUpdated = false, taxonomiesMutated = false } = {}) => {
		const cleanupService = serviceSupabase || getServiceSupabase();
		try {
			await Promise.allSettled([
				removeStorageObjects(supabase, GROUP_MEDIA_BUCKET, uploadedGroupMediaPaths),
				removeStorageObjects(cleanupService, SPONSOR_LOGO_BUCKET, uploadedSponsorPaths)
			]);
		} catch {
			// Best-effort staged asset cleanup.
		}
		if (taxonomiesMutated) {
			try {
				await restoreGroupTaxonomySnapshot(supabase, groupId, taxonomySnapshot);
			} catch {
				// Continue to group row restoration even if taxonomy restore throws.
			}
		}
		if (groupUpdated && Object.keys(rollbackGroupSnapshot).length) {
			try {
				await supabase.from('groups').update(rollbackGroupSnapshot).eq('id', groupId);
			} catch {
				// Avoid masking primary error.
			}
		}
	};

	const { error: groupUpdateError } = await supabase
		.from('groups')
		.update(groupPayload)
		.eq('id', groupId);
	if (groupUpdateError) {
		await rollbackAllMutations({ groupUpdated: false, taxonomiesMutated: false });
		const message = String(groupUpdateError.message || '').toLowerCase();
		if (groupUpdateError.code === '23505' || message.includes('duplicate')) {
			return {
				ok: false,
				status: 409,
				body: {
					error: 'That website slug is already taken. Try another one.',
					values
				}
			};
		}
		return {
			ok: false,
			status: 400,
			body: {
				error: groupUpdateError.message || 'Unable to save group profile.',
				values
			}
		};
	}

	// Diff-based taxonomy updates: skip unchanged tables, insert newly added IDs first,
	// and delete removed IDs second so existing categories are never wiped empty.
	const taxonomyPlans = GROUP_TAXONOMY_TABLES.map(({ table, column, formKey }) => {
		const selectedIds = [
			...new Set(
				form
					.getAll(formKey)
					.map((value) => Number(value))
					.filter((value) => Number.isFinite(value) && value > 0)
			)
		];
		const previousIds = Array.isArray(taxonomySnapshot[table]) ? taxonomySnapshot[table] : [];
		const previousSet = new Set(previousIds);
		const selectedSet = new Set(selectedIds);
		return {
			table,
			column,
			addedIds: selectedIds.filter((id) => !previousSet.has(id)),
			removedIds: previousIds.filter((id) => !selectedSet.has(id))
		};
	});

	let taxonomiesMutated = false;
	const plansWithInserts = taxonomyPlans.filter((plan) => plan.addedIds.length > 0);
	if (plansWithInserts.length) {
		taxonomiesMutated = true;
		const insertResults = await Promise.all(
			plansWithInserts.map(({ table, column, addedIds }) =>
				supabase.from(table).insert(addedIds.map((id) => ({ group_id: groupId, [column]: id })))
			)
		);
		const taxonomyInsertError = insertResults.find((result) => result?.error)?.error;
		if (taxonomyInsertError) {
			await rollbackAllMutations({ groupUpdated: true, taxonomiesMutated: true });
			return {
				ok: false,
				status: 500,
				body: { error: taxonomyInsertError.message, values }
			};
		}
	}

	const plansWithDeletes = taxonomyPlans.filter((plan) => plan.removedIds.length > 0);
	if (plansWithDeletes.length) {
		taxonomiesMutated = true;
		const deleteResults = await Promise.all(
			plansWithDeletes.map(({ table, column, removedIds }) =>
				supabase.from(table).delete().eq('group_id', groupId).in(column, removedIds)
			)
		);
		const taxonomyDeleteError = deleteResults.find((result) => result?.error)?.error;
		if (taxonomyDeleteError) {
			await rollbackAllMutations({ groupUpdated: true, taxonomiesMutated: true });
			return {
				ok: false,
				status: 500,
				body: { error: taxonomyDeleteError.message, values }
			};
		}
	}

	/** @type {Record<string, any>} */
	const updatedGroup = { ...group, ...groupPayload };
	const seoDescription = form.get('seo_description')?.toString().trim() || '';
	const parsedSiteConfig = parseGroupSiteFormData(form, { group: updatedGroup });
	const syncedSiteConfig = syncSiteConfigWithCoreGroup(parsedSiteConfig, updatedGroup, {
		seoDescription
	});

	try {
		await upsertSiteConfig(groupId, syncedSiteConfig, { supabaseClient: supabase });
	} catch (error) {
		await rollbackAllMutations({ groupUpdated: true, taxonomiesMutated });
		return {
			ok: false,
			status: 400,
			body: {
				error: error?.message || 'Unable to publish presence changes.',
				values
			}
		};
	}

	// Post-commit cleanup: remove replaced managed group media and unused sponsor logos only after all DB writes succeed.
	const serializedNextSiteConfig = JSON.stringify(syncedSiteConfig || {});
	const activeGroupMediaPaths = new Set(
		[updatedGroup.logo_url, updatedGroup.cover_photo_url]
			.map((url) => extractManagedGroupMediaObjectPath(url, groupId))
			.filter(Boolean)
	);
	const replacedGroupMediaPaths = [
		...new Set(
			[group.logo_url, group.cover_photo_url]
				.filter((oldUrl) => oldUrl && !serializedNextSiteConfig.includes(String(oldUrl)))
				.map((oldUrl) => extractManagedGroupMediaObjectPath(oldUrl, groupId))
				.filter((oldPath) => oldPath && !activeGroupMediaPaths.has(oldPath))
		)
	];
	if (replacedGroupMediaPaths.length) {
		await removeStorageObjects(supabase, GROUP_MEDIA_BUCKET, replacedGroupMediaPaths);
	}

	const previousSponsorPaths = managedSponsorLogoObjectPaths(previousConfig, groupId);
	const nextSponsorPaths = managedSponsorLogoObjectPaths(syncedSiteConfig, groupId);
	const unusedSponsorPaths = [...previousSponsorPaths].filter(
		(objectPath) => !nextSponsorPaths.has(objectPath)
	);
	if (unusedSponsorPaths.length) {
		const cleanupService = serviceSupabase || getServiceSupabase();
		await removeStorageObjects(cleanupService, SPONSOR_LOGO_BUCKET, unusedSponsorPaths);
	}

	invalidateSnapshotCache({ groupId, slug: group.slug || slug });

	const returnView = normalizePresenceStudioView(form.get('return_view'), 'profile');
	return {
		ok: true,
		redirectTo: `/groups/${encodeURIComponent(slug)}/manage/presence?saved=1&view=${encodeURIComponent(returnView)}`
	};
}
