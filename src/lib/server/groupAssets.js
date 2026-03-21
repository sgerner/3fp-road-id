import path from 'node:path';
import {
	GROUP_ASSET_BUCKET,
	GROUP_ASSET_BUCKETS,
	GROUP_ASSET_MAX_FILE_BYTES,
	cleanGroupAssetBucket,
	getGroupAssetBucketMeta,
	groupGroupAssetsByBucket,
	slugifyGroupAssetSegment
} from '$lib/groups/assets';
import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';

export const GROUP_ASSET_ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'application/pdf',
	'text/plain',
	'text/csv',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/zip',
	'application/x-zip-compressed'
];

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function getGroupAssetsReadClient() {
	return createServiceSupabaseClient() ?? createRequestSupabaseClient(null);
}

export function requireGroupAssetsServiceClient() {
	const client = createServiceSupabaseClient();
	if (!client) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for group asset uploads.');
	}
	return client;
}

export async function requireGroupAssetManager(cookies, groupSlug) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = requireGroupAssetsServiceClient();
	const slug = cleanText(groupSlug);
	const { data: group, error: groupError } = await requestSupabase
		.from('groups')
		.select('id,slug,name')
		.eq('slug', slug)
		.maybeSingle();

	if (groupError) {
		return { ok: false, status: 500, error: groupError.message };
	}

	if (!group) {
		return { ok: false, status: 404, error: 'Group not found.' };
	}

	const { data: profile } = await requestSupabase
		.from('profiles')
		.select('admin')
		.eq('user_id', user.id)
		.maybeSingle();

	const isAdmin = profile?.admin === true;

	if (!isAdmin) {
		const { data: ownerRows, error: ownerError } = await requestSupabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
			.limit(1);

		if (ownerError) {
			return { ok: false, status: 500, error: ownerError.message };
		}

		if (!Array.isArray(ownerRows) || ownerRows.length === 0) {
			return {
				ok: false,
				status: 403,
				error: 'Only group owners can manage shared assets for this group.'
			};
		}
	}

	return {
		ok: true,
		group,
		user,
		userId: user.id,
		isAdmin,
		requestSupabase,
		serviceSupabase
	};
}

function mapSectionTypeToBucket(sectionType) {
	const normalized = cleanText(sectionType).toLowerCase();
	if (normalized === 'links') return 'links';
	if (normalized === 'gallery') return 'photos';
	return 'files';
}

export async function ensureCanonicalGroupAssetSections(serviceSupabase, groupId, userId) {
	const { data: sections, error } = await serviceSupabase
		.from('group_asset_sections')
		.select('id, group_id, name, slug, section_type, sort_order')
		.eq('group_id', groupId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);

	const selectedByBucket = new Map();
	for (const section of sections ?? []) {
		const bucket = mapSectionTypeToBucket(section.section_type);
		if (!selectedByBucket.has(bucket)) {
			selectedByBucket.set(bucket, section);
		}
		if (cleanText(section.slug) === bucket) {
			selectedByBucket.set(bucket, section);
		}
	}

	let sortOrder = Number(sections?.[sections.length - 1]?.sort_order ?? -1) + 1;
	for (const bucket of GROUP_ASSET_BUCKETS) {
		if (selectedByBucket.has(bucket)) continue;

		const meta = getGroupAssetBucketMeta(bucket);
		const insert = await serviceSupabase
			.from('group_asset_sections')
			.insert({
				group_id: groupId,
				created_by_user_id: userId,
				name: meta.sectionName,
				slug: meta.slug,
				description: null,
				section_type: meta.sectionType,
				sort_order: sortOrder
			})
			.select('id, group_id, name, slug, section_type, sort_order')
			.single();

		if (insert.error) throw new Error(insert.error.message);
		selectedByBucket.set(bucket, insert.data);
		sortOrder += 1;
	}

	return Object.fromEntries(
		GROUP_ASSET_BUCKETS.map((bucket) => [bucket, selectedByBucket.get(bucket)])
	);
}

export async function listGroupAssetBuckets(supabase, groupId, { includeEmpty = false } = {}) {
	if (!supabase || !groupId) return [];

	const { data: assets, error } = await supabase
		.from('group_assets')
		.select(
			'id, group_id, section_id, asset_kind, title, description, file_url, bucket_id, object_path, file_name, mime_type, size_bytes, external_url, sort_order, created_at, updated_at'
		)
		.eq('group_id', groupId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: false });

	if (error) throw new Error(error.message);

	return groupGroupAssetsByBucket(assets ?? [], { includeEmpty });
}

export async function loadGroupAssetBucket(supabase, groupId, bucket) {
	const rawBucket = cleanText(bucket).toLowerCase();
	if (!GROUP_ASSET_BUCKETS.includes(rawBucket)) return null;
	const normalizedBucket = cleanGroupAssetBucket(rawBucket);
	const buckets = await listGroupAssetBuckets(supabase, groupId, { includeEmpty: true });
	return buckets.find((entry) => entry.slug === normalizedBucket) ?? null;
}

export function buildGroupAssetObjectPath({ groupId, bucket, fileName }) {
	const extension = path.extname(fileName || '').toLowerCase();
	const baseName =
		slugifyGroupAssetSegment(path.basename(fileName || 'asset', extension)) || 'asset';
	const safeBucket = cleanGroupAssetBucket(bucket);
	return `groups/${groupId}/assets/${safeBucket}/${Date.now()}-${baseName}${extension}`;
}

export function sanitizeExternalUrl(value) {
	const raw = cleanText(value);
	if (!raw) return '';
	try {
		const parsed = new URL(raw);
		if (!['http:', 'https:'].includes(parsed.protocol)) return '';
		return parsed.toString();
	} catch {
		return '';
	}
}

export function validateAssetUpload(file, bucket) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		return 'A valid file upload is required.';
	}
	if (!GROUP_ASSET_ALLOWED_MIME_TYPES.includes(file.type)) {
		return `Unsupported file type: ${file.type || file.name}`;
	}
	if (file.size > GROUP_ASSET_MAX_FILE_BYTES) {
		return `${file.name} exceeds the 25 MB upload limit.`;
	}

	const normalizedBucket = cleanGroupAssetBucket(bucket);
	if (normalizedBucket === 'photos' && !String(file.type).startsWith('image/')) {
		return `${file.name} is not an image. The Photos bucket only accepts image uploads.`;
	}
	if (normalizedBucket === 'files' && String(file.type).startsWith('image/')) {
		return `${file.name} is an image. Use the Photos bucket for image uploads.`;
	}

	return '';
}

export async function removeStoredGroupAssetFiles(serviceSupabase, assets = []) {
	const objectPaths = assets.map((asset) => cleanText(asset?.object_path)).filter(Boolean);

	if (!objectPaths.length) return;

	const { error } = await serviceSupabase.storage.from(GROUP_ASSET_BUCKET).remove(objectPaths);
	if (error) {
		console.warn('Failed to remove group asset files from storage', error);
	}
}
