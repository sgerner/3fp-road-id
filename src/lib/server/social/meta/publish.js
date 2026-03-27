import { callInstagramApi, callMetaApi } from '$lib/server/social/meta/client';
import { normalizeMetaError } from '$lib/server/social/meta/normalize';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function isSocialPublishDebugEnabled() {
	const value = cleanText(process.env.SOCIAL_PUBLISH_DEBUG, 20).toLowerCase();
	return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function logSocialPublishDebug(event, payload = {}) {
	if (!isSocialPublishDebugEnabled()) return;
	console.info(event, payload);
}

function buildMetaErrorDebugPayload(error) {
	if (!error || typeof error !== 'object') return null;
	const payload =
		error?.payload && typeof error.payload === 'object'
			? error.payload
			: error?.error && typeof error.error === 'object'
				? error
				: null;
	const inner = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
	if (!inner || typeof inner !== 'object') return null;
	return {
		status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
		type: cleanText(inner?.type, 120) || null,
		code: Number.isFinite(Number(inner?.code)) ? Number(inner.code) : null,
		error_subcode: Number.isFinite(Number(inner?.error_subcode))
			? Number(inner.error_subcode)
			: null,
		message: cleanText(inner?.message || inner?.error_message, 1000) || null,
		error_user_title: cleanText(inner?.error_user_title, 240) || null,
		error_user_msg: cleanText(inner?.error_user_msg, 1000) || null,
		fbtrace_id: cleanText(inner?.fbtrace_id, 120) || null
	};
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

function normalizePostTarget(value) {
	const cleaned = cleanText(value, 40).toLowerCase();
	return cleaned === 'story' ? 'story' : 'page';
}

function isFacebookPageIdentityError(error) {
	const text = cleanText(error?.message || error, 1200).toLowerCase();
	return text.includes('must be posted to a page as the page itself');
}

async function resolveFacebookPageAccessToken({ pageId, accessToken }) {
	const normalizedPageId = cleanText(pageId, 120);
	const token = cleanText(accessToken, 5000);
	if (!normalizedPageId || !token) return '';
	try {
		const payload = await callMetaApi({
			path: '/me/accounts',
			accessToken: token,
			query: {
				fields: 'id,access_token',
				limit: 50
			}
		});
		const pages = Array.isArray(payload?.data) ? payload.data : [];
		const selected = pages.find((entry) => cleanText(entry?.id, 120) === normalizedPageId);
		return cleanText(selected?.access_token, 5000);
	} catch {
		return '';
	}
}

async function publishToFacebookPage({ account, caption, media = [] }) {
	const pageId = cleanText(account?.meta_page_id, 120);
	if (!pageId) throw new Error('Connected Facebook Page id is missing.');
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!accessToken) throw new Error('Connected Facebook access token is missing.');

	const mediaUrls = extractMediaUrls(media);
	const postMessage = cleanText(caption, 4000) || undefined;
	const publishWithToken = async (token) => {
		if (mediaUrls.length) {
			const firstMediaUrl = mediaUrls[0];
			return callMetaApi({
				path: `/${pageId}/photos`,
				method: 'POST',
				accessToken: token,
				query: {
					url: firstMediaUrl,
					message: postMessage,
					published: 'true'
				}
			});
		}
		return callMetaApi({
			path: `/${pageId}/feed`,
			method: 'POST',
			accessToken: token,
			query: {
				message: postMessage,
				published: 'true'
			}
		});
	};

	let response = null;
	let usedPageTokenFallback = false;
	try {
		response = await publishWithToken(accessToken);
	} catch (error) {
		if (!isFacebookPageIdentityError(error)) throw error;
		const pageToken = await resolveFacebookPageAccessToken({
			pageId,
			accessToken
		});
		if (!pageToken || pageToken === accessToken) throw error;
		response = await publishWithToken(pageToken);
		usedPageTokenFallback = true;
	}

	return {
		ok: true,
		platform: 'facebook',
		post_target: 'page',
		meta_id: cleanText(response?.id, 200) || null,
		meta_post_id: cleanText(response?.id, 200) || null,
		media_count_requested: mediaUrls.length,
		media_count_published: mediaUrls.length ? 1 : 0,
		used_page_token_fallback: usedPageTokenFallback,
		published_at: new Date().toISOString()
	};
}

async function publishToFacebookStory({ account, media = [] }) {
	const pageId = cleanText(account?.meta_page_id, 120);
	if (!pageId) throw new Error('Connected Facebook Page id is missing.');
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!accessToken) throw new Error('Connected Facebook access token is missing.');

	const mediaUrls = extractMediaUrls(media);
	const firstMediaUrl = mediaUrls[0] || '';
	if (!firstMediaUrl) {
		throw new Error('Facebook stories require at least one media item.');
	}

	const response = await callMetaApi({
		path: `/${pageId}/photo_stories`,
		method: 'POST',
		accessToken,
		query: {
			url: firstMediaUrl,
			published: 'true'
		}
	});

	return {
		ok: true,
		platform: 'facebook',
		post_target: 'story',
		meta_id: cleanText(response?.id, 200) || null,
		meta_story_id: cleanText(response?.id, 200) || null,
		media_count_requested: mediaUrls.length,
		media_count_published: 1,
		published_at: new Date().toISOString()
	};
}

async function publishToInstagramAccount({ account, caption, media = [], postTarget = 'page' }) {
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
	logSocialPublishDebug('social_publish_instagram_container_request', {
		ig_account_id: igAccountId,
		media_url: mediaUrl,
		media_count_requested: mediaUrls.length
	});

	const callInstagramWriteEdge = async (path, query) => {
		try {
			return await callInstagramApi({
				path,
				method: 'POST',
				accessToken,
				query
			});
		} catch (primaryError) {
			// Backward compatibility for existing FB-linked IG tokens.
			return callMetaApi({
				path,
				method: 'POST',
				accessToken,
				query
			}).catch(() => {
				throw primaryError;
			});
		}
	};

	const callInstagramReadEdge = async (path, query) => {
		try {
			return await callInstagramApi({
				path,
				method: 'GET',
				accessToken,
				query
			});
		} catch (primaryError) {
			return callMetaApi({
				path,
				method: 'GET',
				accessToken,
				query
			}).catch(() => {
				throw primaryError;
			});
		}
	};

	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const waitForInstagramContainerReady = async (creationId) => {
		const maxAttempts = 8;
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			const statusPayload = await callInstagramReadEdge(`/${creationId}`, {
				fields: 'status_code,status'
			});
			const statusCode = cleanText(statusPayload?.status_code, 80).toUpperCase();
			const status = cleanText(statusPayload?.status, 80).toUpperCase();
			logSocialPublishDebug('social_publish_instagram_container_status', {
				creation_id: creationId,
				attempt,
				status_code: statusCode || null,
				status: status || null
			});
			if (statusCode === 'FINISHED') return;
			if (statusCode === 'ERROR' || status === 'ERROR') {
				throw new Error('Instagram media container processing failed.');
			}
			if (attempt < maxAttempts) await wait(1500 * attempt);
		}
		throw new Error('Instagram media is still processing. Please retry in a minute.');
	};

	const target = normalizePostTarget(postTarget);
	const containerPayload =
		target === 'story'
			? {
					media_type: 'STORIES',
					image_url: mediaUrl
				}
			: {
					media_type: 'IMAGE',
					image_url: mediaUrl,
					caption: cleanText(caption, 2200)
				};
	const container = await callInstagramWriteEdge(`/${igAccountId}/media`, containerPayload);
	const creationId = cleanText(container?.id, 200);
	if (!creationId) throw new Error('Instagram media container was not created.');
	logSocialPublishDebug('social_publish_instagram_container_created', {
		ig_account_id: igAccountId,
		creation_id: creationId
	});
	await waitForInstagramContainerReady(creationId);

	const publishResponse = await callInstagramWriteEdge(`/${igAccountId}/media_publish`, {
		creation_id: creationId
	});

	return {
		ok: true,
		platform: 'instagram',
		post_target: target,
		meta_id: cleanText(publishResponse?.id, 200) || creationId,
		meta_media_id: cleanText(publishResponse?.id, 200) || null,
		creation_id: creationId,
		published_at: new Date().toISOString()
	};
}

export async function publishGroupSocialPostToPlatform({ platform, account, post }) {
	const caption = cleanText(post?.caption, 4000);
	const media = Array.isArray(post?.media) ? post.media : [];
	const postTarget = normalizePostTarget(post?.post_target);

	try {
		if (platform === 'facebook') {
			if (postTarget === 'story') return await publishToFacebookStory({ account, media });
			return await publishToFacebookPage({ account, caption, media });
		}
		if (platform === 'instagram') {
			return await publishToInstagramAccount({ account, caption, media, postTarget });
		}
		throw new Error(`Unsupported social platform: ${platform}`);
	} catch (error) {
		const debug = buildMetaErrorDebugPayload(error);
		if (debug) {
			console.error('social_publish_platform_error', {
				platform,
				...debug
			});
			logSocialPublishDebug('social_publish_platform_error', {
				platform,
				...debug
			});
		} else {
			console.error('social_publish_platform_error', {
				platform,
				error: cleanText(error?.message, 1000) || 'Unknown publish error.'
			});
		}
		return {
			ok: false,
			platform,
			error: normalizeMetaError(error, 'Unable to publish to Meta platform.'),
			...(debug ? { debug } : {})
		};
	}
}
