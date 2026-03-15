import { callMetaApi } from '$lib/server/social/meta/client';
import { normalizeMetaError } from '$lib/server/social/meta/normalize';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function extractMediaUrls(media) {
	if (!Array.isArray(media)) return [];
	const urls = [];
	for (const entry of media) {
		if (typeof entry === 'string') {
			const cleaned = cleanText(entry, 2000);
			if (cleaned) urls.push(cleaned);
			continue;
		}
		if (!entry || typeof entry !== 'object') continue;
		const cleaned = cleanText(entry.url || entry.public_url || entry.src, 2000);
		if (cleaned) urls.push(cleaned);
	}
	return urls;
}

async function publishToFacebookPage({ account, caption, media = [] }) {
	const pageId = cleanText(account?.meta_page_id, 120);
	if (!pageId) throw new Error('Connected Facebook Page id is missing.');
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!accessToken) throw new Error('Connected Facebook access token is missing.');

	const mediaUrls = extractMediaUrls(media);
	let response = null;
	let uploadedPhotoIds = [];

	if (mediaUrls.length) {
		for (const mediaUrl of mediaUrls) {
			const photoResponse = await callMetaApi({
				path: `/${pageId}/photos`,
				method: 'POST',
				accessToken,
				query: {
					url: mediaUrl,
					published: 'false'
				}
			});
			const photoId = cleanText(photoResponse?.id, 200);
			if (photoId) uploadedPhotoIds.push(photoId);
		}

		const attachedMedia = Object.fromEntries(
			uploadedPhotoIds.map((photoId, index) => [
				`attached_media[${index}]`,
				JSON.stringify({ media_fbid: photoId })
			])
		);
		response = await callMetaApi({
			path: `/${pageId}/feed`,
			method: 'POST',
			accessToken,
			query: {
				message: cleanText(caption, 4000) || undefined,
				published: 'true',
				...attachedMedia
			}
		});
	} else {
		response = await callMetaApi({
			path: `/${pageId}/feed`,
			method: 'POST',
			accessToken,
			query: {
				message: cleanText(caption, 4000) || undefined,
				published: 'true'
			}
		});
	}

	return {
		ok: true,
		platform: 'facebook',
		meta_id: cleanText(response?.id, 200) || null,
		meta_post_id: cleanText(response?.id, 200) || null,
		media_count_requested: mediaUrls.length,
		uploaded_photo_ids: uploadedPhotoIds,
		published_at: new Date().toISOString()
	};
}

async function publishToInstagramAccount({ account, caption, media = [] }) {
	const igAccountId = cleanText(account?.meta_instagram_account_id, 120);
	if (!igAccountId) throw new Error('Connected Instagram professional account id is missing.');
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!accessToken) throw new Error('Connected Instagram access token is missing.');

	const mediaUrls = extractMediaUrls(media);
	const mediaUrl = mediaUrls[0] || '';
	if (!mediaUrl) {
		throw new Error(
			'Instagram publishing requires at least one publicly accessible image URL in v1.'
		);
	}

	const container = await callMetaApi({
		path: `/${igAccountId}/media`,
		method: 'POST',
		accessToken,
		query: {
			image_url: mediaUrl,
			caption: cleanText(caption, 2200)
		}
	});
	const creationId = cleanText(container?.id, 200);
	if (!creationId) throw new Error('Instagram media container was not created.');

	const publishResponse = await callMetaApi({
		path: `/${igAccountId}/media_publish`,
		method: 'POST',
		accessToken,
		query: { creation_id: creationId }
	});

	return {
		ok: true,
		platform: 'instagram',
		meta_id: cleanText(publishResponse?.id, 200) || creationId,
		meta_media_id: cleanText(publishResponse?.id, 200) || null,
		creation_id: creationId,
		published_at: new Date().toISOString()
	};
}

export async function publishGroupSocialPostToPlatform({ platform, account, post }) {
	const caption = cleanText(post?.caption, 4000);
	const media = Array.isArray(post?.media) ? post.media : [];

	try {
		if (platform === 'facebook') {
			return await publishToFacebookPage({ account, caption, media });
		}
		if (platform === 'instagram') {
			return await publishToInstagramAccount({ account, caption, media });
		}
		throw new Error(`Unsupported social platform: ${platform}`);
	} catch (error) {
		return {
			ok: false,
			platform,
			error: normalizeMetaError(error, 'Unable to publish to Meta platform.')
		};
	}
}
