import { callInstagramApi, callMetaApi } from '$lib/server/social/meta/client';
import { normalizeMetaError } from '$lib/server/social/meta/normalize';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function toIso(value) {
	if (!value) return new Date().toISOString();
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function firstString(values = [], maxLength = 0) {
	for (const value of values) {
		const next = cleanText(value, maxLength);
		if (next) return next;
	}
	return '';
}

function isFacebookReplyRetryableError(error) {
	const text = cleanText(error?.message || error, 1200).toLowerCase();
	if (!text) return false;
	return (
		text.includes('permissions error') ||
		text.includes('insufficient permission') ||
		text.includes('must be posted to a page as the page itself')
	);
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

function extractFacebookPostImage(sourcePost = null) {
	const direct = firstString(
		[
			sourcePost?.full_picture,
			sourcePost?.picture,
			sourcePost?.attachments?.data?.[0]?.media?.image?.src,
			sourcePost?.attachments?.data?.[0]?.media?.source,
			sourcePost?.attachments?.data?.[0]?.subattachments?.data?.[0]?.media?.image?.src,
			sourcePost?.attachments?.data?.[0]?.subattachments?.data?.[0]?.media?.source,
			sourcePost?.attachments?.data?.[0]?.thumbnail_url
		],
		2000
	);
	return direct || null;
}

function normalizeFacebookComment(comment, sourcePost = null) {
	const fromName =
		firstString([comment?.from?.name, comment?.from?.username, comment?.from?.id], 200) || null;
	const postId = cleanText(sourcePost?.id, 200) || null;
	const sourceImage = extractFacebookPostImage(sourcePost);
	const sourceMessage = firstString([sourcePost?.message, sourcePost?.story], 8000) || null;
	return {
		platform: 'facebook',
		meta_comment_id: cleanText(comment?.id, 200) || null,
		meta_media_id: postId,
		meta_parent_comment_id: cleanText(comment?.parent?.id, 200) || null,
		author_name: fromName,
		author_username: fromName,
		body: cleanText(comment?.message, 8000),
		is_hidden: comment?.is_hidden === true,
		can_reply: true,
		raw_payload: {
			comment,
			source_post: sourcePost
				? {
						id: postId,
						message: sourceMessage,
						permalink_url: cleanText(sourcePost?.permalink_url, 2000) || null,
						full_picture: sourceImage,
						attachments: sourcePost?.attachments || null,
						created_time: sourcePost?.created_time || null
					}
				: null
		},
		commented_at: toIso(comment?.created_time)
	};
}

async function fetchFacebookPostAttachments(postId, accessToken) {
	const id = cleanText(postId, 200);
	if (!id) return null;
	try {
		const payload = await callMetaApi({
			path: `/${id}/attachments`,
			accessToken,
			query: {
				fields: 'media,subattachments,target,url',
				limit: 1
			}
		});
		const data = Array.isArray(payload?.data) ? payload.data : [];
		return data.length ? { data } : null;
	} catch {
		return null;
	}
}

function normalizeInstagramComment(comment, media = null) {
	const mediaId = cleanText(media?.id, 200) || null;
	const username =
		cleanText(comment?.username || comment?.from?.username || comment?.from?.name, 200) || null;
	const parentId = cleanText(comment?.parent_id, 200) || null;
	return {
		platform: 'instagram',
		meta_comment_id: cleanText(comment?.id, 200) || null,
		meta_media_id: cleanText(mediaId, 200) || null,
		meta_parent_comment_id: parentId,
		author_name: username,
		author_username: username,
		body: cleanText(comment?.text || comment?.message, 8000),
		is_hidden: comment?.hidden === true,
		can_reply: !parentId,
		raw_payload: {
			comment,
			source_post: media
				? {
						id: mediaId,
						message: cleanText(media?.caption, 8000) || null,
						permalink_url: cleanText(media?.permalink, 2000) || null,
						full_picture:
							cleanText(media?.media_url || media?.thumbnail_url || media?.display_url, 2000) ||
							null,
						created_time: media?.timestamp || null
					}
				: null
		},
		commented_at: toIso(comment?.timestamp || comment?.created_time)
	};
}

export async function fetchFacebookComments({ account, limitPosts = 10, limitComments = 25 } = {}) {
	const pageId = cleanText(account?.meta_page_id, 120);
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!pageId || !accessToken) return [];
	const fields = `id,message,created_time,full_picture,picture,permalink_url,comments.limit(${Math.max(1, limitComments)}){id,message,created_time,from{id,name},parent{id},is_hidden}`;
	let response = null;
	try {
		response = await callMetaApi({
			path: `/${pageId}/feed`,
			accessToken,
			query: {
				fields,
				limit: Math.max(1, limitPosts)
			}
		});
	} catch {
		response = await callMetaApi({
			path: `/${pageId}/posts`,
			accessToken,
			query: {
				fields,
				limit: Math.max(1, limitPosts)
			}
		});
	}

	const rows = [];
	for (const post of Array.isArray(response?.data) ? response.data : []) {
		let sourcePost = post;
		if (!extractFacebookPostImage(sourcePost)) {
			const attachments = await fetchFacebookPostAttachments(post?.id, accessToken);
			if (attachments) {
				sourcePost = { ...post, attachments };
			}
		}
		for (const comment of Array.isArray(post?.comments?.data) ? post.comments.data : []) {
			const normalized = normalizeFacebookComment(comment, sourcePost);
			if (!normalized.meta_comment_id) continue;
			rows.push(normalized);
		}
	}
	return rows;
}

export async function fetchInstagramComments({
	account,
	limitMedia = 10,
	limitComments = 25
} = {}) {
	const igAccountId = cleanText(account?.meta_instagram_account_id, 120);
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!igAccountId || !accessToken) return [];

	const callInstagramReadEdge = async (path, query) => {
		try {
			return await callInstagramApi({
				path,
				accessToken,
				query
			});
		} catch (primaryError) {
			// Backward compatibility for existing FB-linked IG tokens.
			return callMetaApi({
				path,
				accessToken,
				query
			}).catch(() => {
				throw primaryError;
			});
		}
	};

	const mediaResponse = await callInstagramReadEdge(`/${igAccountId}/media`, {
		fields: 'id,caption,timestamp,comments_count,permalink,media_type,media_url,thumbnail_url',
		limit: Math.max(1, limitMedia)
	});

	const rows = [];
	for (const media of Array.isArray(mediaResponse?.data) ? mediaResponse.data : []) {
		const mediaId = cleanText(media?.id, 200);
		if (!mediaId) continue;
		if (Number(media?.comments_count || 0) <= 0) continue;

		const commentsResponse = await callInstagramReadEdge(`/${mediaId}/comments`, {
			fields: 'id,text,timestamp,username,parent_id,hidden,from{id,username}',
			limit: Math.max(1, limitComments)
		});

		for (const comment of Array.isArray(commentsResponse?.data) ? commentsResponse.data : []) {
			const normalized = normalizeInstagramComment(comment, media);
			if (!normalized.meta_comment_id) continue;
			rows.push(normalized);
		}
	}

	return rows;
}

export async function fetchConnectedAccountComments({ account, limit = 50 } = {}) {
	const platform = cleanText(account?.platform, 40).toLowerCase();
	const cappedLimit = Math.max(5, Math.min(100, Number.parseInt(String(limit), 10) || 50));
	if (platform === 'facebook') {
		return fetchFacebookComments({
			account,
			limitPosts: Math.max(5, Math.ceil(cappedLimit / 5)),
			limitComments: 20
		});
	}
	if (platform === 'instagram') {
		return fetchInstagramComments({
			account,
			limitMedia: Math.max(5, Math.ceil(cappedLimit / 5)),
			limitComments: 20
		});
	}
	return [];
}

export async function replyToConnectedComment({ platform, account, metaCommentId, body }) {
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	const commentId = cleanText(metaCommentId, 200);
	const message = cleanText(body, 2200);
	const normalizedPlatform = cleanText(platform, 40).toLowerCase();
	if (!accessToken) throw new Error('Missing connected account access token.');
	if (!commentId) throw new Error('Missing comment id.');
	if (!message) throw new Error('Reply message is required.');

	try {
		if (normalizedPlatform === 'facebook') {
			const postFacebookReply = async (token) =>
				callMetaApi({
					path: `/${commentId}/comments`,
					method: 'POST',
					accessToken: token,
					query: { message }
				});
			let response = null;
			let usedPageTokenFallback = false;
			try {
				response = await postFacebookReply(accessToken);
			} catch (primaryError) {
				if (!isFacebookReplyRetryableError(primaryError)) throw primaryError;
				const pageToken = await resolveFacebookPageAccessToken({
					pageId: account?.meta_page_id,
					accessToken
				});
				if (!pageToken || pageToken === accessToken) throw primaryError;
				response = await postFacebookReply(pageToken);
				usedPageTokenFallback = true;
			}
			return {
				ok: true,
				platform: normalizedPlatform,
				meta_reply_id: cleanText(response?.id, 200) || null,
				used_page_token_fallback: usedPageTokenFallback
			};
		}

		if (normalizedPlatform === 'instagram') {
			const response = await (async () => {
				try {
					return await callInstagramApi({
						path: `/${commentId}/replies`,
						method: 'POST',
						accessToken,
						query: { message }
					});
				} catch (primaryError) {
					return callMetaApi({
						path: `/${commentId}/replies`,
						method: 'POST',
						accessToken,
						query: { message }
					}).catch(() => {
						throw primaryError;
					});
				}
			})();
			return {
				ok: true,
				platform: normalizedPlatform,
				meta_reply_id: cleanText(response?.id, 200) || null
			};
		}

		throw new Error(`Unsupported platform: ${normalizedPlatform || platform}`);
	} catch (error) {
		const message = normalizeMetaError(error, 'Unable to send comment reply.');
		if (normalizedPlatform === 'facebook' && /permissions?\s+error/i.test(message)) {
			return {
				ok: false,
				platform: normalizedPlatform,
				error:
					'Facebook permissions error. Reconnect Facebook and approve pages_manage_engagement, then try again.'
			};
		}
		return {
			ok: false,
			platform: normalizedPlatform || platform,
			error: message
		};
	}
}
