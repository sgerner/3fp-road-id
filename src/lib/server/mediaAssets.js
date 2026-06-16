import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export const CANONICAL_MEDIA_BUCKETS = new Set(['ride-media', 'group-social-media']);

const MIME_TYPE_TO_EXTENSION = new Map([
	['image/jpeg', '.jpg'],
	['image/jpg', '.jpg'],
	['image/png', '.png'],
	['image/webp', '.webp'],
	['image/gif', '.gif']
]);

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizeBucketId(bucketId) {
	const cleaned = cleanText(bucketId);
	if (!CANONICAL_MEDIA_BUCKETS.has(cleaned)) {
		throw new Error(`Unsupported media bucket: ${cleaned || '(empty)'}`);
	}
	return cleaned;
}

function normalizeMimeType(mimeType, fallback = 'image/png') {
	const cleaned = cleanText(mimeType, 120).toLowerCase();
	return cleaned || fallback;
}

function extensionForMimeType(mimeType, fallbackFileName = '') {
	const normalized = normalizeMimeType(mimeType);
	if (MIME_TYPE_TO_EXTENSION.has(normalized)) {
		return MIME_TYPE_TO_EXTENSION.get(normalized);
	}

	const fallbackName = cleanText(fallbackFileName).toLowerCase();
	const fallbackExtension = fallbackName.split('.').pop();
	if (fallbackExtension && fallbackExtension.length <= 5 && fallbackExtension !== fallbackName) {
		return `.${fallbackExtension}`;
	}

	return '.png';
}

function toArrayBuffer(value) {
	if (value instanceof ArrayBuffer) return value;
	if (ArrayBuffer.isView(value)) {
		return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
	}
	return new Uint8Array(value).buffer;
}

async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildCanonicalMediaObjectPath(
	bucketId,
	contentHash,
	mimeType,
	fallbackFileName = ''
) {
	const bucket = normalizeBucketId(bucketId);
	const extension = extensionForMimeType(mimeType, fallbackFileName);
	const prefix = bucket === 'ride-media' ? 'canonical/rides' : 'canonical/social';
	return `${prefix}/${contentHash.slice(0, 2)}/${contentHash}${extension}`;
}

function buildPublicUrl(bucketId, objectPath) {
	return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucketId}/${objectPath
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')}`;
}

export async function uploadCanonicalMediaAsset({
	supabase,
	bucketId,
	objectPath,
	contentType,
	buffer,
	fileName = '',
	sizeBytes = null
}) {
	const normalizedBucket = normalizeBucketId(bucketId);
	const normalizedMimeType = normalizeMimeType(contentType);
	const normalizedBuffer = toArrayBuffer(buffer);
	const contentHash = await sha256Hex(normalizedBuffer);
	const canonicalObjectPath =
		cleanText(objectPath) ||
		buildCanonicalMediaObjectPath(normalizedBucket, contentHash, normalizedMimeType, fileName);
	const now = new Date().toISOString();

	const { data: existingRow, error: existingError } = await supabase
		.from('media_assets')
		.select(
			'id, bucket_id, object_path, public_url, content_hash, file_name, mime_type, size_bytes, last_referenced_at, created_at'
		)
		.eq('bucket_id', normalizedBucket)
		.eq('content_hash', contentHash)
		.maybeSingle();

	if (existingError) {
		throw existingError;
	}

	if (existingRow) {
		const { data: updatedRow, error: updateError } = await supabase
			.from('media_assets')
			.update({
				file_name: cleanText(fileName) || existingRow.file_name,
				last_referenced_at: now,
				updated_at: now
			})
			.eq('id', existingRow.id)
			.select(
				'id, bucket_id, object_path, public_url, content_hash, file_name, mime_type, size_bytes, last_referenced_at, created_at'
			)
			.single();

		if (updateError) {
			throw updateError;
		}

		return {
			...updatedRow,
			public_url: updatedRow.public_url || buildPublicUrl(normalizedBucket, updatedRow.object_path),
			content_hash: contentHash,
			bucket: normalizedBucket,
			object_path: updatedRow.object_path,
			url: updatedRow.public_url || buildPublicUrl(normalizedBucket, updatedRow.object_path),
			file_name: updatedRow.file_name || cleanText(fileName),
			mime_type: updatedRow.mime_type || normalizedMimeType,
			size_bytes: updatedRow.size_bytes ?? sizeBytes ?? null,
			deduped: true
		};
	}

	const uploadResult = await supabase.storage
		.from(normalizedBucket)
		.upload(canonicalObjectPath, normalizedBuffer, {
			contentType: normalizedMimeType,
			upsert: true
		});

	if (uploadResult.error) {
		throw uploadResult.error;
	}

	const { data: publicUrlData } = supabase.storage
		.from(normalizedBucket)
		.getPublicUrl(canonicalObjectPath);
	const publicUrl =
		publicUrlData?.publicUrl || buildPublicUrl(normalizedBucket, canonicalObjectPath);
	const rowPayload = {
		bucket_id: normalizedBucket,
		object_path: canonicalObjectPath,
		public_url: publicUrl,
		content_hash: contentHash,
		file_name: cleanText(fileName) || canonicalObjectPath.split('/').pop() || '',
		mime_type: normalizedMimeType,
		size_bytes: sizeBytes ?? normalizedBuffer.byteLength,
		last_referenced_at: now,
		updated_at: now
	};

	const { data: storedRow, error: insertError } = await supabase
		.from('media_assets')
		.upsert(rowPayload, { onConflict: 'bucket_id,content_hash' })
		.select(
			'id, bucket_id, object_path, public_url, content_hash, file_name, mime_type, size_bytes, last_referenced_at, created_at'
		)
		.single();

	if (insertError) {
		throw insertError;
	}

	return {
		...storedRow,
		public_url: storedRow.public_url || publicUrl,
		content_hash: contentHash,
		bucket: normalizedBucket,
		object_path: storedRow.object_path,
		url: storedRow.public_url || publicUrl,
		file_name: storedRow.file_name || cleanText(fileName),
		mime_type: storedRow.mime_type || normalizedMimeType,
		size_bytes: storedRow.size_bytes ?? sizeBytes ?? normalizedBuffer.byteLength,
		deduped: false
	};
}

export function normalizeMediaAssetSummary(asset, fallback = {}) {
	if (!asset) return null;
	return {
		url: cleanText(asset.public_url || fallback.url),
		bucket: cleanText(asset.bucket || asset.bucket_id || fallback.bucket),
		object_path: cleanText(asset.object_path || fallback.object_path),
		content_hash: cleanText(asset.content_hash || fallback.content_hash),
		file_name: cleanText(asset.file_name || fallback.file_name),
		mime_type: cleanText(asset.mime_type || fallback.mime_type),
		size_bytes: Number(asset.size_bytes ?? fallback.size_bytes ?? 0) || 0,
		deduped: Boolean(asset.deduped || fallback.deduped)
	};
}
