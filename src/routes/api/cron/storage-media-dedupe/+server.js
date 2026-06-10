import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { CANONICAL_MEDIA_BUCKETS } from '$lib/server/mediaAssets';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

const RETENTION_DAYS = 21;
const DELETE_BATCH_SIZE = 100;
const REFRESH_BATCH_SIZE = 100;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function parseManagedMediaUrl(value) {
	const mediaUrl = cleanText(value, 2000);
	if (!mediaUrl) return null;
	try {
		const parsed = new URL(mediaUrl);
		const expected = new URL(PUBLIC_SUPABASE_URL);
		if (parsed.host !== expected.host) return null;
		const segments = parsed.pathname.split('/').filter(Boolean);
		if (segments.length < 6) return null;
		if (
			segments[0] !== 'storage' ||
			segments[1] !== 'v1' ||
			segments[2] !== 'object' ||
			segments[3] !== 'public'
		) {
			return null;
		}
		const bucket = segments[4];
		if (!CANONICAL_MEDIA_BUCKETS.has(bucket)) return null;
		const objectPath = decodeURIComponent(segments.slice(5).join('/'));
		if (!objectPath) return null;
		return { bucket, objectPath, key: `${bucket}:${objectPath}` };
	} catch {
		return null;
	}
}

function collectManagedMediaUrls(value, activeKeys) {
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (typeof entry === 'string') {
				const parsed = parseManagedMediaUrl(entry);
				if (parsed) activeKeys.add(parsed.key);
				continue;
			}
			if (!entry || typeof entry !== 'object') continue;
			const parsed = parseManagedMediaUrl(entry.url || entry.public_url || entry.src);
			if (parsed) activeKeys.add(parsed.key);
		}
		return;
	}
	const parsed = parseManagedMediaUrl(value);
	if (parsed) activeKeys.add(parsed.key);
}

async function verifyCronRequest(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('storage_media_dedupe', providedSecret);
}

async function loadActiveMediaKeys(supabase) {
	const activeKeys = new Set();

	const [{ data: rideDetails, error: rideError }, { data: socialPosts, error: postError }, { data: contentLibrary, error: libraryError }] = await Promise.all([
		supabase.from('ride_details').select('image_urls'),
		supabase.from('group_social_posts').select('media'),
		supabase.from('group_social_content_library').select('media')
	]);

	if (rideError) throw rideError;
	if (postError) throw postError;
	if (libraryError) throw libraryError;

	for (const row of Array.isArray(rideDetails) ? rideDetails : []) {
		collectManagedMediaUrls(row?.image_urls, activeKeys);
	}
	for (const row of Array.isArray(socialPosts) ? socialPosts : []) {
		collectManagedMediaUrls(row?.media, activeKeys);
	}
	for (const row of Array.isArray(contentLibrary) ? contentLibrary : []) {
		collectManagedMediaUrls(row?.media, activeKeys);
	}

	return activeKeys;
}

async function loadTrackedObjects(supabase) {
	const { data, error } = await supabase
		.schema('storage')
		.from('objects')
		.select('bucket_id, name, created_at, metadata')
		.in('bucket_id', Array.from(CANONICAL_MEDIA_BUCKETS));

	if (error) throw error;
	return Array.isArray(data) ? data : [];
}

async function loadMediaAssets(supabase) {
	const { data, error } = await supabase
		.from('media_assets')
		.select('id, bucket_id, object_path, public_url, last_referenced_at')
		.in('bucket_id', Array.from(CANONICAL_MEDIA_BUCKETS));

	if (error) throw error;
	return Array.isArray(data) ? data : [];
}

function toIsoDate(value) {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function updateLastReferencedAt(supabase, ids) {
	const idList = Array.from(ids).filter(Boolean);
	let updated = 0;
	for (let index = 0; index < idList.length; index += REFRESH_BATCH_SIZE) {
		const batch = idList.slice(index, index + REFRESH_BATCH_SIZE);
		const { error, count } = await supabase
			.from('media_assets')
			.update({ last_referenced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
			.in('id', batch);
		if (error) throw error;
		updated += count ?? batch.length;
	}
	return updated;
}

async function deleteStorageObjects(supabase, deletionsByBucket) {
	let deleted = 0;
	let reclaimedBytes = 0;
	for (const [bucket, entries] of deletionsByBucket.entries()) {
		for (let index = 0; index < entries.length; index += DELETE_BATCH_SIZE) {
			const batch = entries.slice(index, index + DELETE_BATCH_SIZE);
			const objectPaths = batch.map((entry) => entry.name);
			const { error } = await supabase.storage.from(bucket).remove(objectPaths);
			if (error) throw error;
			deleted += objectPaths.length;
			reclaimedBytes += batch.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);
		}
	}
	return { deleted, reclaimedBytes };
}

async function deleteMediaAssetRows(supabase, ids) {
	const idList = Array.from(ids).filter(Boolean);
	let deleted = 0;
	for (let index = 0; index < idList.length; index += DELETE_BATCH_SIZE) {
		const batch = idList.slice(index, index + DELETE_BATCH_SIZE);
		const { error } = await supabase.from('media_assets').delete().in('id', batch);
		if (error) throw error;
		deleted += batch.length;
	}
	return deleted;
}

async function handleCron(request) {
	const verified = await verifyCronRequest(request);
	if (!verified) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Supabase service role is not configured.' }, { status: 500 });
	}

	const activeKeys = await loadActiveMediaKeys(supabase);
	const trackedObjects = await loadTrackedObjects(supabase);
	const mediaAssets = await loadMediaAssets(supabase);
	const assetByKey = new Map(
		mediaAssets.map((asset) => [`${asset.bucket_id}:${asset.object_path}`, asset])
	);
	const now = new Date();
	const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const deletionsByBucket = new Map();
	const refreshIds = new Set();
	const deleteAssetIds = new Set();
	for (const object of trackedObjects) {
		const key = `${object.bucket_id}:${object.name}`;
		const asset = assetByKey.get(key) || null;
		if (activeKeys.has(key)) {
			if (asset) refreshIds.add(asset.id);
			continue;
		}
		const baseline = asset?.last_referenced_at ? new Date(asset.last_referenced_at) : new Date(object.created_at);
		if (Number.isNaN(baseline.getTime()) || baseline > cutoff) {
			continue;
		}
		const sizeBytes = Number(object.metadata?.size || object.metadata?.contentLength || 0) || 0;
		const bucketEntries = deletionsByBucket.get(object.bucket_id) || [];
		bucketEntries.push({ name: object.name, sizeBytes });
		deletionsByBucket.set(object.bucket_id, bucketEntries);
		if (asset) deleteAssetIds.add(asset.id);
	}
	const refreshed = refreshIds.size ? await updateLastReferencedAt(supabase, refreshIds) : 0;
	const { deleted, reclaimedBytes } =
		deletionsByBucket.size > 0 ? await deleteStorageObjects(supabase, deletionsByBucket) : { deleted: 0, reclaimedBytes: 0 };
	const deletedAssetRows = deleteAssetIds.size ? await deleteMediaAssetRows(supabase, deleteAssetIds) : 0;

	return json({
		data: {
			refreshed,
			deleted,
			deleted_asset_rows: deletedAssetRows,
			reclaimed_bytes: reclaimedBytes,
			retention_days: RETENTION_DAYS,
			buckets: Array.from(CANONICAL_MEDIA_BUCKETS)
		}
	});
}

export async function GET({ request }) {
	return handleCron(request);
}

export async function POST({ request }) {
	return handleCron(request);
}
