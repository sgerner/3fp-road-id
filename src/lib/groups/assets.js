export const GROUP_ASSET_BUCKET = 'group-assets';
export const GROUP_ASSET_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const GROUP_ASSET_BUCKET_META = {
	photos: {
		slug: 'photos',
		label: 'Photos',
		description: 'Upload image galleries for the public group page.',
		emptyLabel: 'No photos yet',
		sectionType: 'gallery',
		sectionName: 'Photos'
	},
	files: {
		slug: 'files',
		label: 'Files',
		description: 'Upload PDFs, waivers, flyers, maps, and other downloadable documents.',
		emptyLabel: 'No files yet',
		sectionType: 'documents',
		sectionName: 'Files'
	},
	links: {
		slug: 'links',
		label: 'Links',
		description: 'Share registration pages, useful resources, and partner links.',
		emptyLabel: 'No links yet',
		sectionType: 'links',
		sectionName: 'Links'
	}
};

export const GROUP_ASSET_BUCKETS = Object.keys(GROUP_ASSET_BUCKET_META);

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function slugifyGroupAssetSegment(value) {
	return cleanText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function cleanGroupAssetBucket(value) {
	const normalized = cleanText(value).toLowerCase();
	return GROUP_ASSET_BUCKETS.includes(normalized) ? normalized : 'files';
}

export function getGroupAssetBucketMeta(bucket) {
	return GROUP_ASSET_BUCKET_META[cleanGroupAssetBucket(bucket)];
}

export function isGroupAssetLink(asset) {
	return cleanText(asset?.asset_kind || asset?.assetKind).toLowerCase() === 'link';
}

export function isGroupAssetImage(asset) {
	const mimeType = cleanText(asset?.mime_type || asset?.mimeType).toLowerCase();
	return mimeType.startsWith('image/');
}

export function isGroupAssetPdf(asset) {
	const mimeType = cleanText(asset?.mime_type || asset?.mimeType).toLowerCase();
	return mimeType === 'application/pdf';
}

export function isGroupAssetFile(asset) {
	return !isGroupAssetLink(asset);
}

export function isGroupAssetDocument(asset) {
	return isGroupAssetFile(asset) && !isGroupAssetImage(asset);
}

export function deriveGroupAssetBucket(asset) {
	if (isGroupAssetLink(asset)) return 'links';
	if (isGroupAssetImage(asset)) return 'photos';
	return 'files';
}

export function getGroupAssetHref(asset) {
	return cleanText(asset?.external_url || asset?.externalUrl || asset?.file_url || asset?.fileUrl);
}

export function getGroupAssetTitle(asset) {
	return (
		cleanText(asset?.title) ||
		cleanText(asset?.file_name || asset?.fileName) ||
		cleanText(asset?.external_url || asset?.externalUrl) ||
		'Untitled resource'
	);
}

export function formatGroupAssetSize(sizeBytes) {
	const numeric = Number(sizeBytes);
	if (!Number.isFinite(numeric) || numeric <= 0) return '';
	if (numeric < 1024) return `${numeric} B`;
	if (numeric < 1024 * 1024) return `${Math.round(numeric / 1024)} KB`;
	return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatGroupAssetDate(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	}).format(date);
}

export function normalizeGroupAsset(asset) {
	const title = getGroupAssetTitle(asset);
	const href = getGroupAssetHref(asset);
	const normalized = {
		...asset,
		title,
		href,
		asset_kind: isGroupAssetLink(asset) ? 'link' : 'file',
		isLink: isGroupAssetLink(asset),
		isFile: isGroupAssetFile(asset),
		isImage: isGroupAssetImage(asset),
		isPdf: isGroupAssetPdf(asset),
		isDocument: isGroupAssetDocument(asset),
		bucket: deriveGroupAssetBucket(asset),
		sizeLabel: formatGroupAssetSize(asset?.size_bytes || asset?.sizeBytes),
		createdLabel: formatGroupAssetDate(asset?.created_at || asset?.createdAt)
	};
	return normalized;
}

export function sortGroupAssets(assets = []) {
	return [...assets].sort((a, b) => {
		const aTime =
			new Date(a?.updated_at || a?.updatedAt || a?.created_at || a?.createdAt || 0).getTime() || 0;
		const bTime =
			new Date(b?.updated_at || b?.updatedAt || b?.created_at || b?.createdAt || 0).getTime() || 0;
		return bTime - aTime;
	});
}

export function normalizeGroupAssetBucket(bucket, assets = []) {
	const normalizedAssets = sortGroupAssets(assets.map(normalizeGroupAsset));
	const meta = getGroupAssetBucketMeta(bucket);
	return {
		slug: meta.slug,
		label: meta.label,
		description: meta.description,
		emptyLabel: meta.emptyLabel,
		assets: normalizedAssets,
		asset_count: normalizedAssets.length,
		image_assets: normalizedAssets.filter((asset) => asset.isImage),
		file_assets: normalizedAssets.filter((asset) => asset.isFile),
		document_assets: normalizedAssets.filter((asset) => asset.isDocument),
		link_assets: normalizedAssets.filter((asset) => asset.isLink)
	};
}

export function groupGroupAssetsByBucket(assets = [], { includeEmpty = false } = {}) {
	const buckets = Object.fromEntries(
		GROUP_ASSET_BUCKETS.map((bucket) => [bucket, normalizeGroupAssetBucket(bucket, [])])
	);

	for (const asset of assets.map(normalizeGroupAsset)) {
		const bucket = deriveGroupAssetBucket(asset);
		const list = buckets[bucket]?.assets ?? [];
		buckets[bucket] = normalizeGroupAssetBucket(bucket, [...list, asset]);
	}

	return GROUP_ASSET_BUCKETS.map((bucket) => buckets[bucket]).filter(
		(bucket) => includeEmpty || bucket.asset_count > 0
	);
}

export function summarizeGroupAssetBucket(bucket) {
	const normalized = normalizeGroupAssetBucket(
		bucket.slug || bucket.bucket || 'files',
		bucket.assets || []
	);
	if (normalized.slug === 'photos') return `${normalized.asset_count} photos`;
	if (normalized.slug === 'files') return `${normalized.asset_count} files`;
	return `${normalized.asset_count} links`;
}
