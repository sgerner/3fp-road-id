import { fail, redirect } from '@sveltejs/kit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	buildMicrositeUrl,
	isReservedMicrositeSlug,
	normalizeMicrositeSlug
} from '#lib/microsites/host';
import { buildDefaultGroupSiteConfig, parseGroupSiteFormData } from '#lib/microsites/config';
import { recommendGroupSiteTemplate } from '#lib/microsites/templates';
import {
	getGroupSiteConfig,
	invalidateMicrositePageCache,
	upsertGroupSiteConfig
} from '#lib/server/groupSites';
import { invalidateGroupSnapshotCache } from '#lib/server/groupSnapshots';
import { optimizeImageForStorage } from '#lib/server/storageImages';
import {
	parseGroupEditorImageDataUrl,
	uploadGroupEditorImageDataUrl
} from '#lib/server/groupEditorImages';
import { mirrorRemoteImageToStorage as mirrorPreparedRemoteImage } from '#lib/server/remoteImages';
import { readFormData } from '#lib/server/security';
import { collectGroupSocialLinkInputs } from '#lib/groups/socialLinks';
import {
	extractPresenceStudioFormValues,
	normalizePresenceStudioView,
	syncSiteConfigWithCoreGroup
} from '#lib/groups/presenceStudio';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const SPONSOR_LOGO_BUCKET = 'group-assets';
const SPONSOR_LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const SPONSOR_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_PREFERRED_CTA_KINDS = new Set([
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

async function mirrorRemoteImageToStorage(supabase, remoteUrl, destBasePath) {
	try {
		return await mirrorPreparedRemoteImage(supabase, remoteUrl, destBasePath, {
			maxBytes: MAX_IMAGE_BYTES,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
	} catch {
		return null;
	}
}

async function uploadLocalImageToStorage(supabase, file, destBasePath) {
	try {
		if (!file || typeof file.arrayBuffer !== 'function') return null;
		const contentType = file.type || 'application/octet-stream';
		if (!contentType.startsWith('image/')) return null;
		const optimized = await optimizeImageForStorage(Buffer.from(await file.arrayBuffer()), {
			contentType,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
		const objectPath = `${destBasePath}.${optimized.extension}`;
		const uploadResult = await supabase.storage
			.from('storage')
			.upload(objectPath, optimized.buffer, {
				contentType: optimized.contentType,
				upsert: true
			});
		if (uploadResult.error) return null;
		const { data } = supabase.storage.from('storage').getPublicUrl(objectPath);
		return data?.publicUrl || null;
	} catch {
		return null;
	}
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

function buildSponsorLogoObjectPath(groupId, fileName) {
	const extension = path.extname(String(fileName || '')).toLowerCase() || '.png';
	return `groups/${groupId}/microsite/sponsors/${Date.now()}-${randomUUID()}${extension}`;
}

async function uploadSponsorLogosAndRewriteJson({ formData, groupId }) {
	const sponsorItems = parseSponsorItemsJson(formData);
	if (!sponsorItems.length) return [];

	const hasFiles = sponsorItems.some((_, index) => {
		const file = formData.get(`sponsor_logo_file_${index}`);
		return file && typeof file.arrayBuffer === 'function' && file.size > 0;
	});
	if (!hasFiles) {
		formData.set(
			'sponsor_items_json',
			JSON.stringify(sponsorItems.filter((item) => item.name || item.text || item.logo || item.url))
		);
		return [];
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for sponsor logo uploads.');
	}

	const uploadedPaths = [];
	try {
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
			const optimized = await optimizeImageForStorage(sourceBuffer, {
				contentType: file.type,
				maxWidth: 1600,
				maxHeight: 1200,
				quality: 84
			});
			const baseName = path.basename(file.name, path.extname(file.name));
			const objectPath = buildSponsorLogoObjectPath(groupId, `${baseName}.${optimized.extension}`);
			const { error: uploadError } = await serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.upload(objectPath, optimized.buffer, {
					contentType: optimized.contentType,
					upsert: false
				});
			if (uploadError) throw uploadError;
			uploadedPaths.push(objectPath);

			const { data: publicData } = serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.getPublicUrl(objectPath);
			if (!publicData?.publicUrl) {
				throw new Error('Failed to get a public URL for uploaded sponsor logo.');
			}

			sponsorItems[index].logo = publicData.publicUrl;
		}
	} catch (error) {
		if (uploadedPaths.length) {
			await serviceSupabase.storage.from(SPONSOR_LOGO_BUCKET).remove(uploadedPaths);
		}
		throw error;
	}

	formData.set(
		'sponsor_items_json',
		JSON.stringify(sponsorItems.filter((item) => item.name || item.text || item.logo || item.url))
	);
	return uploadedPaths;
}

async function removeSponsorLogoObjects(paths) {
	if (!paths?.length) return;
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return;
	await serviceSupabase.storage.from(SPONSOR_LOGO_BUCKET).remove(paths);
}

function managedSponsorLogoObjectPaths(config, groupId) {
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

async function removeUnusedSponsorLogoObjects({ previousConfig, nextConfig, groupId }) {
	const previousPaths = managedSponsorLogoObjectPaths(previousConfig, groupId);
	const nextPaths = managedSponsorLogoObjectPaths(nextConfig, groupId);
	await removeSponsorLogoObjects(
		[...previousPaths].filter((objectPath) => !nextPaths.has(objectPath))
	);
}

async function requirePresenceManager(cookies, slug) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, response: fail(401, { error: 'Authentication required.' }) };
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.maybeSingle();
	if (groupError || !group) {
		return { ok: false, response: fail(404, { error: 'Group not found.' }) };
	}

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('user_id,email,admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	const isAdmin = profile?.admin === true;
	if (!isAdmin && !(ownerRows ?? []).length) {
		return {
			ok: false,
			response: fail(403, { error: 'You do not have permission to edit this group.' })
		};
	}

	return {
		ok: true,
		slug,
		group,
		groupId: group.id,
		userId: user.id,
		isAdmin,
		supabase
	};
}

function parseFiniteCoordinate(raw) {
	if (raw === null || raw === undefined || raw === '') return null;
	const numeric = Number(raw);
	return Number.isFinite(numeric) ? numeric : null;
}

async function publishPresenceChanges({ params, request, cookies }) {
	const auth = await requirePresenceManager(cookies, params.slug);
	if (!auth.ok) return auth.response;
	const { slug, group, groupId, supabase } = auth;

	const parsedForm = await readFormData(request, { maxBytes: 64 * 1024 * 1024 });
	if (!parsedForm.ok) {
		return fail(parsedForm.status, { error: parsedForm.error });
	}
	const form = parsedForm.value;
	const values = extractPresenceStudioFormValues(form, { group });

	const rawMicrositeSlug = form.has('microsite_slug')
		? form.get('microsite_slug')
		: group.microsite_slug || group.slug;
	const requestedMicrositeSlug = normalizeMicrositeSlug(rawMicrositeSlug);
	if (!requestedMicrositeSlug) {
		return fail(400, {
			error: 'Website slug is required and can only use letters/numbers.',
			values
		});
	}
	if (isReservedMicrositeSlug(requestedMicrositeSlug)) {
		return fail(400, {
			error: 'That website slug is reserved. Pick another one.',
			values
		});
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
			return fail(400, {
				error: 'Custom CTA label is required and must be 10 characters or fewer.',
				values
			});
		}
		if (!preferredCtaUrl) {
			return fail(400, { error: 'Custom CTA URL is required.', values });
		}
	}

	const stateRegion = form.get('state_region')?.toString().trim() ?? '';
	const country = form.get('country')?.toString().trim().toUpperCase() ?? 'US';
	if (!stateRegion || !country) {
		return fail(400, { error: 'State/Region and Country are required.', values });
	}

	const logoFile = form.get('logo_file');
	const coverFile = form.get('cover_file');
	const logoCropped = form.get('logo_file_cropped')?.toString() || '';
	const coverCropped = form.get('cover_file_cropped')?.toString() || '';
	if (logoFile && logoFile.size && logoFile.size > MAX_IMAGE_BYTES) {
		return fail(400, { error: 'Logo file exceeds 10MB limit.', values });
	}
	if (coverFile && coverFile.size && coverFile.size > MAX_IMAGE_BYTES) {
		return fail(400, { error: 'Cover image exceeds 10MB limit.', values });
	}
	if (logoCropped) {
		const parsed = parseGroupEditorImageDataUrl(logoCropped);
		if (!parsed || parsed.buffer.length > MAX_IMAGE_BYTES) {
			return fail(400, { error: 'Cropped logo exceeds 10MB limit.', values });
		}
	}
	if (coverCropped) {
		const parsed = parseGroupEditorImageDataUrl(coverCropped);
		if (!parsed || parsed.buffer.length > MAX_IMAGE_BYTES) {
			return fail(400, { error: 'Cropped cover exceeds 10MB limit.', values });
		}
	}

	const previousConfig = await getGroupSiteConfig(groupId, { group });

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

	const incomingLogo = form.get('logo_url')?.toString().trim() || '';
	const incomingCover = form.get('cover_photo_url')?.toString().trim() || '';
	const clearLogo = (form.get('clear_logo')?.toString() || '') === '1';
	const clearCover = (form.get('clear_cover')?.toString() || '') === '1';

	if (clearLogo) groupPayload.logo_url = null;
	if (clearCover) groupPayload.cover_photo_url = null;

	if (logoCropped) {
		const newLogo = await uploadGroupEditorImageDataUrl(
			supabase,
			logoCropped,
			`groups/${groupId}/logo`
		);
		if (newLogo) groupPayload.logo_url = newLogo;
		else if (group.logo_url) groupPayload.logo_url = group.logo_url;
	} else if (logoFile && logoFile.size) {
		const newLogo = await uploadLocalImageToStorage(supabase, logoFile, `groups/${groupId}/logo`);
		if (newLogo) groupPayload.logo_url = newLogo;
		else if (group.logo_url) groupPayload.logo_url = group.logo_url;
	} else if (
		incomingLogo &&
		incomingLogo !== group.logo_url &&
		/^https?:\/\//i.test(incomingLogo)
	) {
		const newLogo = await mirrorRemoteImageToStorage(
			supabase,
			incomingLogo,
			`groups/${groupId}/logo`
		);
		if (newLogo) groupPayload.logo_url = newLogo;
		else groupPayload.logo_url = incomingLogo;
	}

	if (coverCropped) {
		const newCover = await uploadGroupEditorImageDataUrl(
			supabase,
			coverCropped,
			`groups/${groupId}/cover`
		);
		if (newCover) groupPayload.cover_photo_url = newCover;
		else if (group.cover_photo_url) groupPayload.cover_photo_url = group.cover_photo_url;
	} else if (coverFile && coverFile.size) {
		const newCover = await uploadLocalImageToStorage(
			supabase,
			coverFile,
			`groups/${groupId}/cover`
		);
		if (newCover) groupPayload.cover_photo_url = newCover;
		else if (group.cover_photo_url) groupPayload.cover_photo_url = group.cover_photo_url;
	} else if (
		incomingCover &&
		incomingCover !== group.cover_photo_url &&
		/^https?:\/\//i.test(incomingCover)
	) {
		const newCover = await mirrorRemoteImageToStorage(
			supabase,
			incomingCover,
			`groups/${groupId}/cover`
		);
		if (newCover) groupPayload.cover_photo_url = newCover;
		else groupPayload.cover_photo_url = incomingCover;
	}

	let uploadedSponsorPaths = [];
	try {
		uploadedSponsorPaths = await uploadSponsorLogosAndRewriteJson({
			formData: form,
			groupId
		});
	} catch (error) {
		return fail(400, {
			error: error?.message || 'Unable to upload sponsor logo.',
			values
		});
	}

	const rollbackGroupSnapshot = {};
	for (const key of Object.keys(groupPayload)) {
		if (Object.prototype.hasOwnProperty.call(group, key)) {
			rollbackGroupSnapshot[key] = group[key];
		}
	}

	const { error: groupUpdateError } = await supabase
		.from('groups')
		.update(groupPayload)
		.eq('id', groupId);
	if (groupUpdateError) {
		await removeSponsorLogoObjects(uploadedSponsorPaths);
		const message = String(groupUpdateError.message || '').toLowerCase();
		if (groupUpdateError.code === '23505' || message.includes('duplicate')) {
			return fail(409, {
				error: 'That website slug is already taken. Try another one.',
				values
			});
		}
		return fail(400, {
			error: groupUpdateError.message || 'Unable to save group profile.',
			values
		});
	}

	const groupTypeIds = form
		.getAll('group_type_ids')
		.map((value) => Number(value))
		.filter(Boolean);
	const audienceFocusIds = form
		.getAll('audience_focus_ids')
		.map((value) => Number(value))
		.filter(Boolean);
	const ridingDisciplineIds = form
		.getAll('riding_discipline_ids')
		.map((value) => Number(value))
		.filter(Boolean);
	const skillLevelIds = form
		.getAll('skill_level_ids')
		.map((value) => Number(value))
		.filter(Boolean);

	const deleteResults = await Promise.all([
		supabase.from('group_x_group_types').delete().eq('group_id', groupId),
		supabase.from('group_x_audience_focuses').delete().eq('group_id', groupId),
		supabase.from('group_x_riding_disciplines').delete().eq('group_id', groupId),
		supabase.from('group_x_skill_levels').delete().eq('group_id', groupId)
	]);
	const taxonomyDeleteError = deleteResults.find((result) => result.error)?.error;
	if (taxonomyDeleteError) {
		await removeSponsorLogoObjects(uploadedSponsorPaths);
		if (Object.keys(rollbackGroupSnapshot).length) {
			await supabase.from('groups').update(rollbackGroupSnapshot).eq('id', groupId);
		}
		return fail(500, { error: taxonomyDeleteError.message, values });
	}

	const taxonomyInserts = [];
	if (groupTypeIds.length) {
		taxonomyInserts.push(
			supabase
				.from('group_x_group_types')
				.insert(groupTypeIds.map((group_type_id) => ({ group_id: groupId, group_type_id })))
		);
	}
	if (audienceFocusIds.length) {
		taxonomyInserts.push(
			supabase
				.from('group_x_audience_focuses')
				.insert(
					audienceFocusIds.map((audience_focus_id) => ({ group_id: groupId, audience_focus_id }))
				)
		);
	}
	if (ridingDisciplineIds.length) {
		taxonomyInserts.push(
			supabase.from('group_x_riding_disciplines').insert(
				ridingDisciplineIds.map((riding_discipline_id) => ({
					group_id: groupId,
					riding_discipline_id
				}))
			)
		);
	}
	if (skillLevelIds.length) {
		taxonomyInserts.push(
			supabase
				.from('group_x_skill_levels')
				.insert(skillLevelIds.map((skill_level_id) => ({ group_id: groupId, skill_level_id })))
		);
	}
	if (taxonomyInserts.length) {
		const insertResults = await Promise.all(taxonomyInserts);
		const taxonomyInsertError = insertResults.find((result) => result.error)?.error;
		if (taxonomyInsertError) {
			await removeSponsorLogoObjects(uploadedSponsorPaths);
			if (Object.keys(rollbackGroupSnapshot).length) {
				await supabase.from('groups').update(rollbackGroupSnapshot).eq('id', groupId);
			}
			return fail(500, { error: taxonomyInsertError.message, values });
		}
	}

	const updatedGroup = { ...group, ...groupPayload };
	const seoDescription = form.get('seo_description')?.toString().trim() || '';
	const parsedSiteConfig = parseGroupSiteFormData(form, { group: updatedGroup });
	const syncedSiteConfig = syncSiteConfigWithCoreGroup(parsedSiteConfig, updatedGroup, {
		seoDescription
	});

	try {
		await upsertGroupSiteConfig(groupId, syncedSiteConfig);
	} catch (error) {
		await removeSponsorLogoObjects(uploadedSponsorPaths);
		if (Object.keys(rollbackGroupSnapshot).length) {
			await supabase.from('groups').update(rollbackGroupSnapshot).eq('id', groupId);
		}
		return fail(400, {
			error: error?.message || 'Unable to publish presence changes.',
			values
		});
	}

	await removeUnusedSponsorLogoObjects({
		previousConfig,
		nextConfig: syncedSiteConfig,
		groupId
	});
	invalidateGroupSnapshotCache({ groupId, slug: group.slug || slug });

	const returnView = normalizePresenceStudioView(form.get('return_view'), 'profile');
	throw redirect(
		303,
		`/groups/${encodeURIComponent(slug)}/manage/presence?saved=1&view=${encodeURIComponent(returnView)}`
	);
}

export const load = async ({ parent, url, cookies }) => {
	const parentData = await parent();
	const group = parentData.group;
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	const supabase = createRequestSupabaseClient(accessToken);
	const privateSupabase = createServiceSupabaseClient() || supabase;

	const [
		profileResponse,
		ownersResponse,
		groupTypesResponse,
		audienceFocusesResponse,
		ridingDisciplinesResponse,
		skillLevelsResponse,
		selectedTypesResponse,
		selectedAudiencesResponse,
		selectedDisciplinesResponse,
		selectedSkillsResponse,
		donationResponse,
		storedSiteConfig,
		groupsResponse
	] = await Promise.all([
		user?.id
			? supabase.from('profiles').select('user_id,email,admin').eq('user_id', user.id).maybeSingle()
			: Promise.resolve({ data: null }),
		supabase.from('group_members').select('user_id').eq('group_id', group.id).eq('role', 'owner'),
		supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name'),
		supabase.from('skill_levels').select('id, name').order('name'),
		supabase.from('group_x_group_types').select('group_type_id').eq('group_id', group.id),
		supabase.from('group_x_audience_focuses').select('audience_focus_id').eq('group_id', group.id),
		supabase
			.from('group_x_riding_disciplines')
			.select('riding_discipline_id')
			.eq('group_id', group.id),
		supabase.from('group_x_skill_levels').select('skill_level_id').eq('group_id', group.id),
		Promise.resolve(
			privateSupabase
				.from('donation_accounts')
				.select(
					'id,stripe_account_id,stripe_account_email,charges_enabled,payouts_enabled,connected_at'
				)
				.eq('group_id', group.id)
				.maybeSingle()
		).catch(() => ({ data: null })),
		getGroupSiteConfig(group.id, { group }),
		supabase
			.from('groups')
			.select('id,slug,name,city,state_region')
			.order('name', { ascending: true })
			.limit(500)
	]);

	const allOwners = ownersResponse?.data ?? [];
	const ownerIds = allOwners.map((row) => row.user_id).filter(Boolean);
	let ownerEmails = [];
	if (ownerIds.length) {
		const { data: emailsData } = await privateSupabase
			.from('profiles')
			.select('user_id,email')
			.in('user_id', ownerIds);
		ownerEmails = emailsData || [];
	}

	const groupTypes = groupTypesResponse?.data ?? [];
	const selectedGroupTypeIds = (selectedTypesResponse?.data ?? []).map((row) => row.group_type_id);
	const selectedTypeSet = new Set(selectedGroupTypeIds);
	const groupTypeNames = groupTypes
		.filter((item) => selectedTypeSet.has(item.id))
		.map((item) => item.name)
		.filter(Boolean);

	const defaultSiteConfig = buildDefaultGroupSiteConfig(group);
	const siteConfig = syncSiteConfigWithCoreGroup(storedSiteConfig, group);
	const micrositeSlug = normalizeMicrositeSlug(group.microsite_slug || group.slug);
	const previewPath = `/${encodeURIComponent(micrositeSlug)}`;
	const directoryPreviewPath = `/groups/${encodeURIComponent(group.slug)}`;
	const liveUrl = buildMicrositeUrl(micrositeSlug, url);
	const directoryUrl = `${url.origin}/groups/${encodeURIComponent(group.slug)}`;

	const hasDomainReturn =
		url.searchParams.has('domain_checkout') || url.searchParams.has('domain_payment');
	const initialView = normalizePresenceStudioView(
		url.searchParams.get('view'),
		hasDomainReturn ? 'address' : 'profile'
	);

	return {
		group,
		group_types: groupTypes,
		audience_focuses: audienceFocusesResponse?.data ?? [],
		riding_disciplines: ridingDisciplinesResponse?.data ?? [],
		skill_levels: skillLevelsResponse?.data ?? [],
		selected: {
			group_type_ids: selectedGroupTypeIds,
			audience_focus_ids: (selectedAudiencesResponse?.data ?? []).map(
				(row) => row.audience_focus_id
			),
			riding_discipline_ids: (selectedDisciplinesResponse?.data ?? []).map(
				(row) => row.riding_discipline_id
			),
			skill_level_ids: (selectedSkillsResponse?.data ?? []).map((row) => row.skill_level_id)
		},
		owners: allOwners.map((row) => ({
			user_id: row.user_id,
			email: ownerEmails.find((entry) => entry.user_id === row.user_id)?.email || ''
		})),
		donation_account: donationResponse?.data ?? null,
		stripe_status: url.searchParams.get('stripe') || '',
		stripe_reason: url.searchParams.get('reason') || '',
		current_user_id: user?.id || parentData.session_user_id || '',
		current_profile: profileResponse?.data ?? null,
		micrositeSlug,
		availableGroups: Array.isArray(groupsResponse?.data) ? groupsResponse.data : [],
		groupTypeNames,
		recommendedSiteTemplateId: recommendGroupSiteTemplate({ group, groupTypeNames }),
		siteConfig,
		defaultSiteConfig,
		previewPath,
		directoryPreviewPath,
		liveUrl,
		directoryUrl,
		initialView,
		saved: (url.searchParams.get('saved') || '').trim(),
		generated: (url.searchParams.get('generated') || '').trim(),
		reset: (url.searchParams.get('reset') || '').trim()
	};
};

export const actions = {
	publish: publishPresenceChanges,
	save: publishPresenceChanges,
	reset: async ({ params, request, cookies }) => {
		const auth = await requirePresenceManager(cookies, params.slug);
		if (!auth.ok) return auth.response;
		const { slug, group, groupId, supabase } = auth;

		const parsedForm = await readFormData(request, { maxBytes: 64 * 1024 * 1024 });
		const values =
			parsedForm.ok && [...parsedForm.value.keys()].length > 0
				? extractPresenceStudioFormValues(parsedForm.value, { group })
				: null;
		const previousConfig = await getGroupSiteConfig(groupId, { group });
		const { error } = await supabase.from('group_site_configs').delete().eq('group_id', groupId);
		if (error) {
			return fail(400, {
				error: error.message,
				...(values ? { values } : {})
			});
		}
		invalidateMicrositePageCache(groupId);
		invalidateGroupSnapshotCache({ groupId, slug: group.slug || slug });
		await removeSponsorLogoObjects([...managedSponsorLogoObjectPaths(previousConfig, groupId)]);
		throw redirect(303, `/groups/${encodeURIComponent(slug)}/manage/presence?reset=1&view=builder`);
	},
	delete: async ({ params, cookies }) => {
		const auth = await requirePresenceManager(cookies, params.slug);
		if (!auth.ok) return auth.response;

		const { group, groupId, supabase } = auth;
		const { error: deleteError } = await supabase
			.from('groups')
			.update({
				is_published: false,
				updated_at: new Date().toISOString()
			})
			.eq('id', groupId);
		if (deleteError) return fail(500, { error: deleteError.message });

		invalidateMicrositePageCache(groupId);
		invalidateGroupSnapshotCache({ groupId, slug: group?.slug || params.slug });
		throw redirect(303, '/groups/my');
	}
};
